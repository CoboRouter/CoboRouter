import type { RouteDecision, RouteInferenceRequest, RouteInferenceResponse } from "../types.js";
import { runInference } from "../inference/inferenceAdapter.js";
import { lowestCapablePaidQuote, markSelected, providerById, quoteProviders, selectRoute } from "./routingPolicy.js";
import { saveReceipt } from "../receipts/receiptGenerator.js";
import { triagePrompt } from "../triage/zaiTriage.js";
import { createCoboWalletAdapter } from "../wallet/coboAdapter.js";
import { appendJsonl } from "../utils/fs.js";
import { sha256, shortId } from "../utils/hash.js";

function defaultPrompt(): string {
  return [
    "Plan a 3-step treasury action for an autonomous DAO agent with $1,000 USDC.",
    "Compare these two provided low-risk DeFi yield options, explain the risks, and recommend one:",
    "Option A: USDC lending on approved protocol fixture, 4.2% estimated APY, high liquidity, audited.",
    "Option B: USDC vault on approved protocol fixture, 6.1% estimated APY, medium liquidity, audited.",
    "Use a reasoning-capable model only if needed and return a wallet/payment receipt."
  ].join("\n");
}

export function demoRequest(scenario: "approved" | "blocked"): RouteInferenceRequest {
  return {
    prompt: defaultPrompt(),
    routing_mode: "cheapest_capable",
    max_spend_usd: scenario === "blocked" ? 0.03 : 0.25,
    allowed_providers: ["zai", "second_real_provider", "local_baseline"],
    require_receipt: true,
    idempotency_key: `demo-${scenario}-001`,
    scenario
  };
}

function routeTraceSummary(trace: RouteDecision[]): string {
  return trace.map((entry) => `${entry.provider_id}:${entry.decision}:${entry.reason}`).join(" | ");
}

function receiptPaths(receiptId: string): { receiptPath: string; logPath: string } {
  return {
    receiptPath: `receipts/${receiptId}.json`,
    logPath: "logs/demo-run.jsonl"
  };
}

export async function routeInference(request: RouteInferenceRequest): Promise<RouteInferenceResponse> {
  const wallet = createCoboWalletAdapter();
  const taskId = shortId("task");
  const receiptId = request.scenario === "blocked" ? "coborouter_demo_blocked_001" : "coborouter_demo_approved_001";
  const { receiptPath, logPath } = receiptPaths(receiptId);
  const promptHash = sha256(request.prompt);
  const quoteId = shortId("quote");
  const triage = await triagePrompt(request);
  const trace = quoteProviders(triage, request.allowed_providers);
  const selected = selectRoute(trace, request.routing_mode, request.max_spend_usd);
  const lowestQuote = lowestCapablePaidQuote(trace);
  const policyQuote = selected ?? lowestQuote;
  const routeTrace = markSelected(trace, selected, request.max_spend_usd);
  const policyProviderId = policyQuote?.provider_id ?? "none";
  const policyProvider = policyQuote ? providerById(policyQuote.provider_id) : undefined;

  const policyInput = {
    taskId,
    callerId: "demo_agent",
    providerId: policyProviderId,
    model: policyQuote?.model ?? "none",
    quotedCostUsd: policyQuote?.estimated_cost_usd ?? 0,
    maxSpendUsd: request.max_spend_usd,
    dailySpendUsedUsd: 0,
    dailySpendCapUsd: Number(process.env.COBO_DAILY_SPEND_CAP_USD || 5),
    allowedProviders: request.allowed_providers.filter((provider) => provider !== "local_baseline"),
    humanApprovalThresholdUsd: 0.5,
    asset: "USDC" as const,
    network: policyProvider?.payment_network ?? process.env.COBO_DEMO_NETWORK ?? "cobo_sandbox",
    routingMode: request.routing_mode,
    taskRiskLevel: triage.risk_level,
    policyContext: {
      promptHash,
      quoteId,
      routeTraceSummary: routeTraceSummary(routeTrace)
    }
  };

  const walletPolicy = await wallet.checkPolicy(policyInput);

  const base = {
    task_id: taskId,
    broker_decision: {
      task_type: triage.task_type,
      triage_source: triage.triage_source,
      triage_model: triage.triage_model,
      selected_provider: selected?.provider_id ?? null,
      selected_model: selected?.model ?? null,
      reason: selected ? selected.reason : walletPolicy.reason ?? "no provider selected",
      estimated_cost_usd: policyQuote?.estimated_cost_usd ?? 0,
      actual_cost_usd: 0,
      triage_cost_usd: triage.triage_source === "zai_live" ? 0.0009 : 0,
      routing_mode: request.routing_mode,
      quote_id: quoteId,
      route_trace: routeTrace
    },
    wallet_policy: {
      ...walletPolicy,
      max_spend_usd: request.max_spend_usd,
      approved_spend_usd: walletPolicy.result === "approved" ? policyQuote?.estimated_cost_usd ?? 0 : 0,
      provider_allowlisted: Boolean(policyQuote && request.allowed_providers.includes(policyQuote.provider_id)),
      human_approval_required: walletPolicy.result === "requires_human_approval"
    },
    receipt: {
      receipt_id: receiptId,
      prompt_hash: promptHash,
      policy_hash: walletPolicy.policyHash,
      quote_id: quoteId,
      idempotency_key: request.idempotency_key,
      timestamp: new Date().toISOString(),
      log_path: logPath,
      receipt_path: receiptPath
    }
  };

  if (!selected || walletPolicy.result !== "approved") {
    const blockedResponse: RouteInferenceResponse = {
      status: walletPolicy.result === "requires_human_approval" ? "requires_human_approval" : "blocked",
      ...base,
      payment: {
        wallet_provider: "cobo_agentic_wallet",
        operation_id: null,
        payment_reference: null,
        tx_hash: null,
        explorer_url: null,
        proof_type: "cobo_operation",
        status: "not_created",
        refund_status: "not_required"
      },
      provider_invoice: {
        provider_request_id: null,
        provider_invoice_id: null,
        simulated: false
      },
      answer: null
    };
    await appendJsonl(logPath, { event: "route_inference", response: blockedResponse });
    return saveReceipt(blockedResponse);
  }

  const selectedProvider = providerById(selected.provider_id);
  if (!selectedProvider) {
    throw new Error(`Provider ${selected.provider_id} not found`);
  }

  const authorization = await wallet.authorizeSpend(policyInput);
  if (authorization.status === "pending_approval" || authorization.status === "blocked" || authorization.status === "failed") {
    const pendingResponse: RouteInferenceResponse = {
      status: authorization.status === "pending_approval" ? "requires_human_approval" : "failed",
      ...base,
      payment: {
        wallet_provider: "cobo_agentic_wallet",
        operation_id: authorization.operationId,
        payment_reference: authorization.paymentReference,
        tx_hash: authorization.txHash ?? null,
        explorer_url: authorization.explorerUrl ?? null,
        proof_type: authorization.proofType,
        status: authorization.status,
        refund_status: "not_required"
      },
      provider_invoice: {
        provider_request_id: null,
        provider_invoice_id: null,
        simulated: false
      },
      answer: null
    };
    await appendJsonl(logPath, { event: "route_inference", response: pendingResponse });
    return saveReceipt(pendingResponse);
  }

  const inference = await runInference(selectedProvider, request.prompt, selected.estimated_cost_usd);
  const settlement = await wallet.settleSpend(authorization.operationId, inference.actualCostUsd);

  const completedResponse: RouteInferenceResponse = {
    status: "completed",
    ...base,
    broker_decision: {
      ...base.broker_decision,
      actual_cost_usd: inference.actualCostUsd
    },
    payment: {
      wallet_provider: "cobo_agentic_wallet",
      operation_id: settlement.operationId,
      payment_reference: settlement.paymentReference,
      tx_hash: settlement.txHash ?? null,
      explorer_url: settlement.explorerUrl ?? null,
      proof_type: settlement.proofType,
      status: settlement.status,
      refund_status: "not_required"
    },
    provider_invoice: {
      provider_request_id: inference.providerRequestId,
      provider_invoice_id: inference.providerInvoiceId,
      simulated: inference.simulated
    },
    answer: {
      summary: inference.summary,
      steps: inference.steps
    }
  };

  await appendJsonl(logPath, { event: "route_inference", response: completedResponse });
  return saveReceipt(completedResponse);
}
