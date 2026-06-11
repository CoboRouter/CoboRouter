import providers from "../inference/providerRegistry.json" with { type: "json" };
import type { ProviderCatalogItem, ProviderConfig } from "../types.js";

const registry = providers as ProviderConfig[];
const defaultPricingTimestamp = "2026-06-11T00:00:00.000Z";

function providerType(provider: ProviderConfig): ProviderCatalogItem["provider_type"] {
  return provider.provider_id === "local_baseline" ? "local" : "zai_api";
}

function pricingSource(provider: ProviderConfig): ProviderCatalogItem["pricing_source"] {
  if (provider.provider_id === "local_baseline") return "local";
  if (provider.cost_per_1k_input_usd === 0 && provider.cost_per_1k_output_usd === 0) return "operator_override";
  return "registry";
}

function settlement(provider: ProviderConfig): ProviderCatalogItem["settlement"] {
  if (provider.provider_id === "local_baseline") return "local_no_payment";
  return provider.requires_wallet_payment ? "cobo_wallet_transfer" : "zai_api_key";
}

function refundPolicy(provider: ProviderConfig): string {
  if (provider.provider_id === "local_baseline") return "No external provider spend is created.";
  if (!provider.requires_wallet_payment) return "No Cobo payment is created; provider API failures are retried or returned as no-charge errors.";
  return "CoboRouter authorizes before inference, settles after provider completion, and marks settlement failures for manual reconciliation.";
}

export function providerCatalog(): ProviderCatalogItem[] {
  return registry.map((provider) => ({
    provider_id: provider.provider_id,
    display_name: provider.display_name,
    model: provider.model,
    provider_type: provider.provider_type ?? providerType(provider),
    capabilities: provider.capabilities,
    cost_per_1k_input_usd: provider.cost_per_1k_input_usd,
    cost_per_1k_output_usd: provider.cost_per_1k_output_usd,
    avg_latency_ms: provider.avg_latency_ms,
    quality_score: provider.quality_score,
    allowlisted: provider.allowlisted,
    requires_wallet_payment: provider.requires_wallet_payment,
    payment_asset: provider.payment_asset,
    payment_network: provider.payment_network,
    pricing_source: provider.pricing_source ?? pricingSource(provider),
    pricing_updated_at: provider.pricing_updated_at ?? defaultPricingTimestamp,
    settlement: provider.settlement ?? settlement(provider),
    sla: provider.sla ?? {
      dispute_window_hours: provider.requires_wallet_payment ? 24 : 0,
      refund_policy: refundPolicy(provider)
    }
  }));
}
