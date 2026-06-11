export type RoutingMode = "cheapest_capable" | "fastest_capable" | "quality_first";

export type RiskLevel = "low" | "medium" | "high";

export type CapabilityKey =
  | "reasoning"
  | "coding"
  | "long_context"
  | "latency_sensitivity"
  | "privacy_sensitivity"
  | "web3_context"
  | "structured_output";

export type CapabilityScores = Record<CapabilityKey, number>;

export type TriageResult = {
  task_type: string;
  triage_source: "zai_live" | "cached_zai_response" | "deterministic_fallback";
  triage_model: string;
  capabilities: CapabilityScores;
  routing_preference: RoutingMode;
  max_spend_usd: number;
  requires_wallet_payment: boolean;
  risk_level: RiskLevel;
  recommended_policy: {
    human_approval_required: boolean;
    allowed_provider_classes: string[];
  };
};

export type ProviderConfig = {
  provider_id: string;
  display_name: string;
  model: string;
  capabilities: Partial<Record<CapabilityKey, number>>;
  cost_per_1k_input_usd: number;
  cost_per_1k_output_usd: number;
  avg_latency_ms: number;
  quality_score: number;
  allowlisted: boolean;
  requires_wallet_payment: boolean;
  payment_asset: "USDC" | null;
  payment_network: string | null;
  label?: string;
  stretch_target?: boolean;
};

export type RouteDecision = {
  provider_id: string;
  model: string;
  display_name: string;
  estimated_input_tokens: number;
  estimated_output_tokens: number;
  estimated_cost_usd: number;
  decision: "selected" | "rejected";
  reason: string;
  capable: boolean;
  requires_wallet_payment: boolean;
};

export type WalletPolicyInput = {
  taskId: string;
  callerId?: string;
  providerId: string;
  model: string;
  quotedCostUsd: number;
  maxSpendUsd: number;
  dailySpendUsedUsd: number;
  dailySpendCapUsd: number;
  allowedProviders: string[];
  humanApprovalThresholdUsd: number;
  asset: "USDC";
  network: string;
  routingMode: RoutingMode;
  taskRiskLevel: RiskLevel;
  policyContext: {
    promptHash: string;
    quoteId: string;
    routeTraceSummary: string;
  };
};

export type WalletPolicyResult = {
  result: "approved" | "blocked" | "requires_human_approval";
  reason?: string;
  policyId: string;
  policyHash: string;
  walletAddress?: string;
  policySource: "cobo_pact_preflight" | "local_policy_guard";
  policyAuthority: "cobo_agentic_wallet" | "local_demo";
  evidence: {
    source: string;
    live: boolean;
    coboPactId?: string;
    spendCapUsd: number;
    providerAllowlistHash: string;
  };
};

export type WalletAuthorization = {
  operationId: string;
  paymentReference: string;
  status: "authorized" | "pending_approval" | "settled" | "blocked" | "failed";
  proofType: "on_chain" | "cobo_operation";
  txHash?: string | null;
  explorerUrl?: string | null;
};

export type RouteInferenceRequest = {
  prompt: string;
  routing_mode: RoutingMode;
  max_spend_usd: number;
  allowed_providers: string[];
  require_receipt?: boolean;
  idempotency_key?: string;
  scenario?: "approved" | "blocked" | "budget_declined" | "local" | "simple_zai" | "custom";
};

export type RouteInferenceResponse = {
  status: "completed" | "blocked" | "requires_human_approval" | "failed" | "paid_failed";
  task_id: string;
  broker_decision: {
    task_type: string;
    triage_source: TriageResult["triage_source"];
    triage_model: string;
    selected_provider: string | null;
    selected_model: string | null;
    reason: string;
    estimated_cost_usd: number;
    actual_cost_usd: number;
    triage_cost_usd: number;
    routing_mode: RoutingMode;
    quote_id: string;
    route_trace: RouteDecision[];
  };
  wallet_policy: WalletPolicyResult & {
    max_spend_usd: number;
    approved_spend_usd: number;
    provider_allowlisted: boolean;
    human_approval_required: boolean;
  };
  payment: {
    wallet_provider: "cobo_agentic_wallet";
    operation_id: string | null;
    payment_reference: string | null;
    tx_hash: string | null;
    explorer_url: string | null;
    proof_type: "on_chain" | "cobo_operation";
    status: WalletAuthorization["status"] | "not_created";
    refund_status: "not_required" | "manual_reconciliation_required";
  };
  provider_invoice: {
    provider_request_id: string | null;
    provider_invoice_id: string | null;
    simulated: boolean;
  };
  answer: {
    summary: string;
    steps: string[];
  } | null;
  receipt: {
    receipt_id: string;
    prompt_hash: string;
    policy_hash: string;
    quote_id: string;
    idempotency_key?: string;
    timestamp: string;
    log_path: string;
    receipt_path: string;
    archive_path: string;
    execution_mode: "live" | "demo";
  };
};
