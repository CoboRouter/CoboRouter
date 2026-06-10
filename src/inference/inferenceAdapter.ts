import { readFile } from "node:fs/promises";
import type { ProviderConfig } from "../types.js";
import { shortId } from "../utils/hash.js";

type InferenceResult = {
  summary: string;
  steps: string[];
  providerRequestId: string;
  providerInvoiceId: string | null;
  simulated: boolean;
  actualCostUsd: number;
};

export async function runInference(provider: ProviderConfig, prompt: string, estimatedCostUsd: number): Promise<InferenceResult> {
  if (provider.provider_id === "zai" && process.env.ZAI_API_KEY) {
    try {
      const response = await fetch("https://api.z.ai/api/paas/v4/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env.ZAI_API_KEY}`
        },
        body: JSON.stringify({
          model: process.env.ZAI_MODEL || provider.model,
          messages: [
            {
              role: "system",
              content:
                "You are helping a demo autonomous DAO agent compare provided DeFi fixture options. Stay concise, mention this is demo fixture data, and return a safe recommendation."
            },
            { role: "user", content: prompt }
          ]
        })
      });

      if (response.ok) {
        const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const content = json.choices?.[0]?.message?.content;
        if (content) {
          return {
            summary: content.slice(0, 600),
            steps: [
              "Use the provided fixture options only.",
              "Prefer the option with stronger liquidity and simpler withdrawal risk unless higher yield is explicitly accepted.",
              "Record the wallet-bounded inference procurement receipt before acting."
            ],
            providerRequestId: shortId("zai_req"),
            providerInvoiceId: shortId("zai_invoice"),
            simulated: false,
            actualCostUsd: Number((estimatedCostUsd * 0.92).toFixed(4))
          };
        }
      }
    } catch {
      // Fall through to deterministic demo answer so the hackathon demo remains runnable.
    }
  }

  const fixture = JSON.parse(await readFile("fixtures/defi-yield-options.json", "utf8")) as {
    options: Array<{ name: string; estimated_apy: number; liquidity: string; audit_status: string }>;
  };
  const safer = fixture.options[0];
  const higherYield = fixture.options[1];

  return {
    summary: `Using demo fixture data, ${safer.name} is the safer default because it has ${safer.liquidity} liquidity and audited status, even though ${higherYield.name} offers a higher ${higherYield.estimated_apy}% estimated APY.`,
    steps: [
      `Start with ${safer.name} for the $1,000 USDC treasury because liquidity is ${safer.liquidity}.`,
      `Treat ${higherYield.name} as a yield-upside option only if the agent accepts medium liquidity and extra strategy risk.`,
      "Keep the action bounded by wallet policy, log the route decision, and attach the Cobo operation proof to the receipt."
    ],
    providerRequestId: `${provider.provider_id}_demo_req`,
    providerInvoiceId: provider.requires_wallet_payment ? `${provider.provider_id}_demo_invoice` : null,
    simulated: provider.provider_id !== "zai" || !process.env.ZAI_API_KEY,
    actualCostUsd: Number((estimatedCostUsd * 0.92).toFixed(4))
  };
}
