import providers from "../inference/providerRegistry.json" with { type: "json" };
import type { CapabilityKey, ProviderConfig, RouteDecision, RoutingMode, TriageResult } from "../types.js";

const registry = providers as ProviderConfig[];

const demoSelectable = (provider: ProviderConfig): boolean => provider.requires_wallet_payment && provider.allowlisted;

function estimateCost(provider: ProviderConfig): number {
  const estimatedInputTokens = 12000;
  const estimatedOutputTokens = 17000;
  return Number(
    (
      (estimatedInputTokens / 1000) * provider.cost_per_1k_input_usd +
      (estimatedOutputTokens / 1000) * provider.cost_per_1k_output_usd
    ).toFixed(4)
  );
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

export function quoteProviders(triage: TriageResult, allowedProviders: string[]): RouteDecision[] {
  return registry
    .filter((provider) => allowedProviders.includes(provider.provider_id))
    .map((provider) => {
      const mismatch = capabilityReason(provider, triage);
      const selectable = demoSelectable(provider);
      const capable = !mismatch && selectable;
      const reason = mismatch
        ? mismatch
        : selectable
          ? "capable paid provider"
          : "comparison-only local baseline for Cobo demo";

      return {
        provider_id: provider.provider_id,
        model: provider.model,
        display_name: provider.display_name,
        estimated_cost_usd: estimateCost(provider),
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

  return { ...sorted[0], decision: "selected", reason: "cheapest capable paid provider under wallet budget" };
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
