import providers from "../inference/providerRegistry.json" with { type: "json" };
import type { CapabilityKey, ProviderConfig, RouteDecision, RoutingMode, TriageResult } from "../types.js";

const registry = providers as ProviderConfig[];

const selectableForTriage = (provider: ProviderConfig, triage: TriageResult): boolean =>
  provider.allowlisted && (provider.requires_wallet_payment || !triage.requires_wallet_payment);

function tokenEstimate(prompt: string, triage: TriageResult): { inputTokens: number; outputTokens: number } {
  const promptTokens = Math.max(1, Math.ceil(prompt.length / 4));
  const reasoningLoad = Math.max(0, triage.capabilities.reasoning - 2);
  const codingLoad = Math.max(0, triage.capabilities.coding - 2);
  const web3Load = Math.max(0, triage.capabilities.web3_context - 2);
  const structuredLoad = Math.max(0, triage.capabilities.structured_output - 2);

  return {
    inputTokens: Math.ceil((promptTokens + 900 + reasoningLoad * 450 + web3Load * 350) * (triage.capabilities.long_context >= 5 ? 1.25 : 1)),
    outputTokens: Math.ceil(450 + reasoningLoad * 900 + codingLoad * 700 + web3Load * 650 + structuredLoad * 300)
  };
}

function estimateCost(provider: ProviderConfig, prompt: string, triage: TriageResult): { costUsd: number; inputTokens: number; outputTokens: number } {
  const { inputTokens, outputTokens } = tokenEstimate(prompt, triage);
  const costUsd = Number(
    (
      (inputTokens / 1000) * provider.cost_per_1k_input_usd +
      (outputTokens / 1000) * provider.cost_per_1k_output_usd
    ).toFixed(4)
  );
  return { costUsd, inputTokens, outputTokens };
}

function capabilityReason(provider: ProviderConfig, triage: TriageResult): string | null {
  const entries = Object.entries(triage.capabilities) as Array<[CapabilityKey, number]>;
  for (const [key, required] of entries) {
    if (required < 3) {
      continue;
    }
    const providerScore = provider.capabilities[key] ?? 0;
    if (providerScore < required) {
      return `${key} capability ${providerScore} below required ${required}`;
    }
  }
  return null;
}

export function quoteProviders(triage: TriageResult, allowedProviders: string[], prompt: string): RouteDecision[] {
  return registry
    .filter((provider) => allowedProviders.includes(provider.provider_id))
    .map((provider) => {
      const mismatch = capabilityReason(provider, triage);
      const selectable = selectableForTriage(provider, triage);
      const capable = !mismatch && selectable;
      const estimate = estimateCost(provider, prompt, triage);
      const reason = mismatch
        ? mismatch
        : selectable
          ? provider.requires_wallet_payment
            ? "capable paid provider"
            : "capable zero-spend provider"
          : "not selectable for this wallet/payment requirement";

      return {
        provider_id: provider.provider_id,
        model: provider.model,
        display_name: provider.display_name,
        estimated_input_tokens: estimate.inputTokens,
        estimated_output_tokens: estimate.outputTokens,
        estimated_cost_usd: estimate.costUsd,
        decision: "rejected",
        reason,
        capable,
        requires_wallet_payment: provider.requires_wallet_payment
      };
    });
}

export function selectRoute(trace: RouteDecision[], mode: RoutingMode, maxSpendUsd: number): RouteDecision | null {
  const eligible = trace.filter((entry) => entry.capable && entry.estimated_cost_usd <= maxSpendUsd);
  if (eligible.length === 0) {
    return null;
  }

  const sorted = [...eligible].sort((a, b) => {
    const providerA = registry.find((provider) => provider.provider_id === a.provider_id);
    const providerB = registry.find((provider) => provider.provider_id === b.provider_id);

    if (mode === "fastest_capable") {
      return (providerA?.avg_latency_ms ?? 999999) - (providerB?.avg_latency_ms ?? 999999) || a.estimated_cost_usd - b.estimated_cost_usd;
    }

    if (mode === "quality_first") {
      return (providerB?.quality_score ?? 0) - (providerA?.quality_score ?? 0) || a.estimated_cost_usd - b.estimated_cost_usd;
    }

    return a.estimated_cost_usd - b.estimated_cost_usd || (providerA?.avg_latency_ms ?? 999999) - (providerB?.avg_latency_ms ?? 999999);
  });

  const winner = sorted[0];
  return {
    ...winner,
    decision: "selected",
    reason: winner.requires_wallet_payment ? "cheapest capable paid provider under wallet budget" : "cheapest capable zero-spend provider"
  };
}

export function lowestCapablePaidQuote(trace: RouteDecision[]): RouteDecision | null {
  const capablePaid = trace.filter((entry) => entry.capable);
  if (capablePaid.length === 0) {
    return null;
  }
  return [...capablePaid].sort((a, b) => a.estimated_cost_usd - b.estimated_cost_usd)[0];
}

export function markSelected(trace: RouteDecision[], selected: RouteDecision | null, maxSpendUsd: number): RouteDecision[] {
  return trace.map((entry) => {
    if (selected && entry.provider_id === selected.provider_id) {
      return selected;
    }
    if (entry.capable && entry.estimated_cost_usd > maxSpendUsd) {
      return { ...entry, reason: "quote exceeds task budget" };
    }
    return entry;
  });
}

export function providerById(providerId: string): ProviderConfig | undefined {
  return registry.find((provider) => provider.provider_id === providerId);
}
