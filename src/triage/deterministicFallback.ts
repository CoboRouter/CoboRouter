import type { TriageResult } from "../types.js";

export function deterministicTriage(maxSpendUsd: number): TriageResult {
  return {
    task_type: "web3_tool_use",
    triage_source: "deterministic_fallback",
    triage_model: "local-rule-fallback",
    capabilities: {
      reasoning: 4,
      coding: 1,
      long_context: 2,
      latency_sensitivity: 2,
      privacy_sensitivity: 3,
      web3_context: 4,
      structured_output: 4
    },
    routing_preference: "cheapest_capable",
    max_spend_usd: maxSpendUsd,
    requires_wallet_payment: true,
    risk_level: "medium",
    recommended_policy: {
      human_approval_required: false,
      allowed_provider_classes: ["zai", "trusted_api", "local"]
    }
  };
}
