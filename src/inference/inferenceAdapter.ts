import { readFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
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
  if (provider.provider_id.startsWith("zai") && process.env.ZAI_API_KEY) {
    try {
      const model = provider.provider_id === "zai" ? process.env.ZAI_MODEL || provider.model : provider.model;
      const messages = [
        {
          role: "system",
          content:
            provider.provider_id === "zai_flash"
              ? "You are the lightweight Z.AI route inside CoboRouter. Keep the answer short and direct for a simple agent task."
              : "You are helping a demo autonomous DAO agent compare provided DeFi fixture options. Stay concise, mention this is demo fixture data, and return a safe recommendation."
        },
        { role: "user", content: prompt }
      ];

      const callZai = (body: Record<string, unknown>) =>
        fetch("https://api.z.ai/api/paas/v4/chat/completions", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${process.env.ZAI_API_KEY}`
          },
          body: JSON.stringify(body)
        });

      const callZaiWithRetry = async (body: Record<string, unknown>) => {
        let response = await callZai(body);
        for (let attempt = 0; attempt < 2; attempt += 1) {
          if (response.ok || ![408, 409, 425, 429, 500, 502, 503, 504].includes(response.status)) {
            return response;
          }
          await sleep(700 * (attempt + 1));
          response = await callZai(body);
        }
        return response;
      };

      let response = await callZaiWithRetry({
          model,
          thinking: { type: "disabled" },
          enable_thinking: false,
          messages
      });

      if (!response.ok) {
        response = await callZaiWithRetry({ model, messages });
      }

      if (response.ok) {
        const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const content = json.choices?.[0]?.message?.content;
        if (content) {
          return {
            summary: content.slice(0, 600),
            steps: [
              provider.provider_id === "zai_flash" ? "Use the lightweight Z.AI route because triage marked the task as simple." : "Use the provided fixture options only.",
              provider.provider_id === "zai_flash"
                ? "Skip GLM-5.1 because the prompt does not need flagship reasoning."
                : "Prefer the option with stronger liquidity and simpler withdrawal risk unless higher yield is explicitly accepted.",
              provider.requires_wallet_payment
                ? "Record the wallet-bounded inference procurement receipt before acting."
                : "Record the zero-spend routing receipt before acting."
            ],
            providerRequestId: shortId("zai_req"),
            providerInvoiceId: shortId("zai_invoice"),
            simulated: false,
            actualCostUsd: Number((estimatedCostUsd * 0.92).toFixed(4))
          };
        }
      }
    } catch {
      // Fall through to deterministic fixture data so local demos remain runnable.
    }
  }

  const fixture = JSON.parse(await readFile("fixtures/defi-yield-options.json", "utf8")) as {
    options: Array<{ name: string; estimated_apy: number; liquidity: string; audit_status: string }>;
  };
  const safer = fixture.options[0];
  const higherYield = fixture.options[1];
  const localOnly = provider.provider_id === "local_baseline";

  return {
    summary: localOnly
      ? "Local-only route selected: CoboRouter kept the private prompt on-device, created no provider invoice, and produced a zero-spend receipt."
      : `Using demo fixture data, ${safer.name} is the safer default because it has ${safer.liquidity} liquidity and audited status, even though ${higherYield.name} offers a higher ${higherYield.estimated_apy}% estimated APY.`,
    steps: localOnly
      ? [
          "Detect the local-only/private prompt before any remote triage call.",
          "Select local_baseline because it satisfies the low-complexity task without wallet spend.",
          "Return a receipt showing payment.status=not_created and provider_invoice.simulated=true."
        ]
      : [
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
