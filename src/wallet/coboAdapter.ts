import { setTimeout as sleep } from "node:timers/promises";
import { Configuration, PactsApi, TransactionRecordsApi, TransactionsApi } from "@cobo/agentic-wallet";
import type { WalletAuthorization, WalletPolicyInput, WalletPolicyResult } from "../types.js";
import { shortId } from "../utils/hash.js";
import { policyHash } from "./policy.js";

export interface CoboWalletAdapter {
  checkPolicy(input: WalletPolicyInput): Promise<WalletPolicyResult>;
  authorizeSpend(input: WalletPolicyInput): Promise<WalletAuthorization>;
  settleSpend(operationId: string, actualCostUsd: number): Promise<WalletAuthorization>;
  voidAuthorization(operationId: string): Promise<WalletAuthorization>;
  getOperationStatus(operationId: string): Promise<WalletAuthorization>;
}

type StoredOperation = {
  operationId: string;
  paymentReference: string;
  pactApiKey?: string;
  proofType: "on_chain" | "cobo_operation";
  txHash?: string | null;
  explorerUrl?: string | null;
};

type CoboErrorPayload = {
  response?: {
    status?: number;
    data?: {
      error?: {
        code?: string;
        reason?: string;
      };
      suggestion?: string;
    };
  };
};

const demoWalletAddress = "0xC0B0000000000000000000000000000000000000";

function envValue(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

function requireEnvValue(...names: string[]): string {
  const value = envValue(...names);
  if (!value) {
    throw new Error(`Missing required Cobo live environment variable. Set one of: ${names.join(", ")}`);
  }
  return value;
}

function parseCoboError(error: unknown): string {
  const payload = error as CoboErrorPayload;
  const http = payload.response?.status;
  const reason = payload.response?.data?.error?.reason || payload.response?.data?.error?.code;
  const suggestion = payload.response?.data?.suggestion;
  return [http ? `HTTP ${http}` : null, reason, suggestion].filter(Boolean).join(" - ") || (error instanceof Error ? error.message : "unknown Cobo error");
}

function localPolicyDecision(
  input: WalletPolicyInput,
  policyId: string,
  walletAddress: string,
  authority: WalletPolicyResult["policyAuthority"],
  source: WalletPolicyResult["policySource"],
  coboPactId?: string
): WalletPolicyResult {
  const hash = policyHash(policyId, input.dailySpendCapUsd, input.humanApprovalThresholdUsd, input.allowedProviders);
  const evidence = {
    source,
    live: authority === "cobo_agentic_wallet",
    coboPactId,
    spendCapUsd: input.dailySpendCapUsd,
    providerAllowlistHash: policyHash("provider_allowlist", 0, 0, input.allowedProviders)
  };

  if (!input.allowedProviders.includes(input.providerId)) {
    return {
      result: "blocked",
      reason: "provider_not_allowlisted",
      policyId,
      policyHash: hash,
      walletAddress,
      policySource: source,
      policyAuthority: authority,
      evidence
    };
  }

  if (input.quotedCostUsd > input.maxSpendUsd) {
    return {
      result: "blocked",
      reason: "quote_exceeds_task_budget",
      policyId,
      policyHash: hash,
      walletAddress,
      policySource: source,
      policyAuthority: authority,
      evidence
    };
  }

  if (input.dailySpendUsedUsd + input.quotedCostUsd > input.dailySpendCapUsd) {
    return {
      result: "blocked",
      reason: "daily_wallet_cap_exceeded",
      policyId,
      policyHash: hash,
      walletAddress,
      policySource: source,
      policyAuthority: authority,
      evidence
    };
  }

  if (input.quotedCostUsd > input.humanApprovalThresholdUsd) {
    return {
      result: "requires_human_approval",
      reason: "human_approval_threshold_exceeded",
      policyId,
      policyHash: hash,
      walletAddress,
      policySource: source,
      policyAuthority: authority,
      evidence
    };
  }

  return {
    result: "approved",
    policyId,
    policyHash: hash,
    walletAddress,
    policySource: source,
    policyAuthority: authority,
    evidence
  };
}

export class DemoCoboWalletAdapter implements CoboWalletAdapter {
  private readonly policyId = process.env.COBO_POLICY_ID || "cobo_policy_demo";
  private readonly walletAddress = process.env.COBO_WALLET_ADDRESS || demoWalletAddress;
  private readonly proofType = "cobo_operation";

  async checkPolicy(input: WalletPolicyInput): Promise<WalletPolicyResult> {
    return localPolicyDecision(input, this.policyId, this.walletAddress, "local_demo", "local_policy_guard");
  }

  async authorizeSpend(_input: WalletPolicyInput): Promise<WalletAuthorization> {
    const operationId = shortId("cobo_op");
    return {
      operationId,
      paymentReference: shortId("cobo_pay"),
      status: "authorized",
      proofType: this.proofType,
      txHash: null,
      explorerUrl: null
    };
  }

  async settleSpend(operationId: string, _actualCostUsd: number): Promise<WalletAuthorization> {
    return {
      operationId,
      paymentReference: shortId("cobo_pay"),
      status: "settled",
      proofType: this.proofType,
      txHash: null,
      explorerUrl: null
    };
  }

  async voidAuthorization(operationId: string): Promise<WalletAuthorization> {
    return {
      operationId,
      paymentReference: shortId("cobo_void"),
      status: "failed",
      proofType: this.proofType,
      txHash: null,
      explorerUrl: null
    };
  }

  async getOperationStatus(operationId: string): Promise<WalletAuthorization> {
    return {
      operationId,
      paymentReference: shortId("cobo_status"),
      status: "settled",
      proofType: this.proofType,
      txHash: null,
      explorerUrl: null
    };
  }
}

export class LiveCoboWalletAdapter implements CoboWalletAdapter {
  private readonly apiUrl = envValue("AGENT_WALLET_API_URL", "COBO_AGENT_WALLET_API_URL") || "https://api.agenticwallet.cobo.com";
  private readonly apiKey = requireEnvValue("AGENT_WALLET_API_KEY", "COBO_API_KEY");
  private readonly walletId = requireEnvValue("AGENT_WALLET_WALLET_ID", "COBO_WALLET_ID");
  private readonly walletAddress = requireEnvValue("COBO_WALLET_ADDRESS");
  private readonly policyId = requireEnvValue("COBO_POLICY_ID");
  private readonly proofType = process.env.COBO_PROOF_TYPE === "on_chain" ? "on_chain" : "cobo_operation";
  private readonly operations = new Map<string, StoredOperation>();

  private ownerPactsApi(): PactsApi {
    return new PactsApi(new Configuration({ apiKey: this.apiKey, basePath: this.apiUrl }));
  }

  private txApi(apiKey = this.apiKey): TransactionsApi {
    return new TransactionsApi(new Configuration({ apiKey, basePath: this.apiUrl }));
  }

  private txRecordsApi(apiKey = this.apiKey): TransactionRecordsApi {
    return new TransactionRecordsApi(new Configuration({ apiKey, basePath: this.apiUrl }));
  }

  async checkPolicy(input: WalletPolicyInput): Promise<WalletPolicyResult> {
    return localPolicyDecision(
      input,
      this.policyId,
      this.walletAddress,
      "coborouter_policy_engine",
      "coborouter_preflight",
      process.env.COBO_LIVE_PACT_ID || this.policyId
    );
  }

  async authorizeSpend(input: WalletPolicyInput): Promise<WalletAuthorization> {
    const existingPactId = process.env.COBO_LIVE_PACT_ID;
    const existingPactApiKey = process.env.COBO_LIVE_PACT_API_KEY;

    if (existingPactId && existingPactApiKey) {
      const operation: StoredOperation = {
        operationId: existingPactId,
        paymentReference: `caw_pact_${existingPactId}`,
        pactApiKey: existingPactApiKey,
        proofType: this.proofType
      };
      this.operations.set(existingPactId, operation);
      return {
        operationId: operation.operationId,
        paymentReference: operation.paymentReference,
        status: "authorized",
        proofType: operation.proofType,
        txHash: null,
        explorerUrl: null
      };
    }

    try {
      const pact = (
        await this.ownerPactsApi().submitPact({
          wallet_id: this.walletId,
          name: `CoboRouter inference procurement ${input.taskId}`,
          intent: `Authorize CoboRouter to procure ${input.model} inference from ${input.providerId} for up to $${input.maxSpendUsd}.`,
          original_intent: input.policyContext.routeTraceSummary,
          spec: {
            execution_plan: [
              "# Summary",
              `CoboRouter will authorize one inference procurement for task ${input.taskId}.`,
              "# Spend Controls",
              `Provider: ${input.providerId}`,
              `Quoted cost USD: ${input.quotedCostUsd}`,
              `Task cap USD: ${input.maxSpendUsd}`,
              `Daily cap USD: ${input.dailySpendCapUsd}`,
              "# Completion",
              "Complete after one inference procurement operation or after 24 hours."
            ].join("\n"),
            policies: [
              {
                name: "coborouter-provider-spend-cap",
                type: "transfer",
                rules: {
                  effect: "allow",
                  deny_if: {
                    amount_usd_gt: String(input.maxSpendUsd)
                  }
                }
              }
            ],
            completion_conditions: [{ type: "time_elapsed", threshold: "86400" }]
          }
        })
      ).data.result;

      const pactId = pact.pact_id;
      const approvalId = pact.approval_id || `caw_pact_${pactId}`;
      const operation: StoredOperation = {
        operationId: pactId,
        paymentReference: approvalId,
        proofType: this.proofType
      };
      this.operations.set(pactId, operation);

      const status = String(pact.status).toLowerCase();
      if (status === "active") {
        const active = (await this.ownerPactsApi().getPact(pactId)).data.result;
        operation.pactApiKey = active.api_key;
        this.operations.set(pactId, operation);
        return {
          operationId: pactId,
          paymentReference: approvalId,
          status: "authorized",
          proofType: this.proofType,
          txHash: null,
          explorerUrl: null
        };
      }

      return {
        operationId: pactId,
        paymentReference: approvalId,
        status: "pending_approval",
        proofType: this.proofType,
        txHash: null,
        explorerUrl: null
      };
    } catch (error) {
      throw new Error(`Cobo authorizeSpend failed: ${parseCoboError(error)}`);
    }
  }

  async settleSpend(operationId: string, actualCostUsd: number): Promise<WalletAuthorization> {
    const operation = this.operations.get(operationId);
    if (!operation) {
      throw new Error(`Unknown Cobo operation ${operationId}`);
    }

    if (process.env.COBO_SETTLEMENT_MODE !== "transfer") {
      return {
        operationId,
        paymentReference: operation.paymentReference,
        status: "authorized",
        proofType: operation.proofType,
        txHash: operation.txHash ?? null,
        explorerUrl: operation.explorerUrl ?? null
      };
    }

    const destination = requireEnvValue("COBO_PROVIDER_SETTLEMENT_ADDRESS");
    const tokenId = requireEnvValue("COBO_SETTLEMENT_TOKEN_ID");
    const amount = process.env.COBO_SETTLEMENT_AMOUNT || actualCostUsd.toFixed(4);
    const requestId = `coborouter_${operationId}`;
    const sourceAddress = process.env.COBO_SOURCE_ADDRESS || this.walletAddress;

    try {
      const transfer = (
        await this.txApi(operation.pactApiKey || this.apiKey).transferTokens(this.walletId, {
          src_addr: sourceAddress,
          dst_addr: destination,
          amount,
          token_id: tokenId,
          chain_id: process.env.COBO_SETTLEMENT_CHAIN_ID,
          request_id: requestId,
          description: `CoboRouter inference settlement for ${operationId}`
        })
      ).data.result;

      let txHash = transfer.transaction_hash || null;
      let rawStatus = String(transfer.status_display || transfer.status || "").toLowerCase();
      for (let attempt = 0; attempt < 8 && !txHash && !["success", "failed"].includes(rawStatus); attempt += 1) {
        await sleep(2500);
        const record = (
          await this.txRecordsApi(operation.pactApiKey || this.apiKey).getUserTransactionByRequestId(this.walletId, requestId, true)
        ).data.result;
        txHash = record.transaction_hash || null;
        rawStatus = String(record.status_display || record.sub_status || record.status || "").toLowerCase();
      }

      const explorerUrl = txHash && process.env.COBO_EXPLORER_TX_BASE_URL ? `${process.env.COBO_EXPLORER_TX_BASE_URL.replace(/\/$/, "")}/${txHash}` : null;
      const status = rawStatus.includes("fail")
        ? "failed"
        : txHash || rawStatus.includes("success") || rawStatus.includes("complete")
            ? "settled"
            : rawStatus.includes("pending")
              ? "pending_approval"
              : "authorized";

      return {
        operationId: transfer.id || operationId,
        paymentReference: transfer.request_id || requestId,
        status,
        proofType: txHash ? "on_chain" : this.proofType,
        txHash,
        explorerUrl
      };
    } catch (error) {
      throw new Error(`Cobo settleSpend failed: ${parseCoboError(error)}`);
    }
  }

  async voidAuthorization(operationId: string): Promise<WalletAuthorization> {
    const operation = this.operations.get(operationId);
    return {
      operationId,
      paymentReference: operation?.paymentReference || `caw_void_${operationId}`,
      status: "failed",
      proofType: operation?.proofType || this.proofType,
      txHash: null,
      explorerUrl: null
    };
  }

  async getOperationStatus(operationId: string): Promise<WalletAuthorization> {
    const operation = this.operations.get(operationId);
    if (!operation) {
      throw new Error(`Unknown Cobo operation ${operationId}`);
    }

    try {
      const pact = (await this.ownerPactsApi().getPact(operationId)).data.result;
      const status = String(pact.status).toLowerCase() === "active" ? "authorized" : "pending_approval";
      return {
        operationId,
        paymentReference: operation.paymentReference,
        status,
        proofType: operation.proofType,
        txHash: operation.txHash ?? null,
        explorerUrl: operation.explorerUrl ?? null
      };
    } catch {
      return {
        operationId,
        paymentReference: operation.paymentReference,
        status: "authorized",
        proofType: operation.proofType,
        txHash: operation.txHash ?? null,
        explorerUrl: operation.explorerUrl ?? null
      };
    }
  }
}

export function createCoboWalletAdapter(): CoboWalletAdapter {
  return process.env.COBO_ADAPTER_MODE === "live" ? new LiveCoboWalletAdapter() : new DemoCoboWalletAdapter();
}
