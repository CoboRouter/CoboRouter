import { readFile } from "node:fs/promises";
import type { RouteInferenceRequest, TriageResult } from "../types.js";
import { deterministicTriage } from "./deterministicFallback.js";

const TRIAGE_TIMEOUT_MS = 10_000;

async function readCachedTriage(scenario: RouteInferenceRequest["scenario"], maxSpendUsd: number): Promise<TriageResult> {
  const file = scenario === "blocked" ? "fixtures/cached-triage/blocked-path.json" : "fixtures/cached-triage/approved-path.json";
  const parsed = JSON.parse(await readFile(file, "utf8")) as TriageResult;
  return {
    ...parsed,
    max_spend_usd: maxSpendUsd,
    triage_source: "cached_zai_response"
  };
}

function parseTriageJson(raw: string, maxSpendUsd: number): TriageResult {
  const parsed = JSON.parse(raw) as TriageResult;
  return {
    ...parsed,
    max_spend_usd: maxSpendUsd,
    triage_source: "zai_live",
    triage_model: process.env.ZAI_MODEL || parsed.triage_model || "glm-5.1"
  };
}

export async function triagePrompt(request: RouteInferenceRequest): Promise<TriageResult> {
  if (!process.env.ZAI_API_KEY) {
    return readCachedTriage(request.scenario, request.max_spend_usd).catch(() => deterministicTriage(request.max_spend_usd));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRIAGE_TIMEOUT_MS);

  try {
    const model = process.env.ZAI_MODEL || "glm-5.1";
    const response = await fetch("https://api.z.ai/api/paas/v4/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.ZAI_API_KEY}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Classify this agent task for inference routing. Return only JSON matching: task_type, capabilities, routing_preference, max_spend_usd, requires_wallet_payment, risk_level, recommended_policy."
          },
          {
            role: "user",
            content: request.prompt
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Z.AI triage failed: ${response.status}`);
    }

    const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Z.AI triage response did not include content");
    }
    return parseTriageJson(content, request.max_spend_usd);
  } catch {
    return readCachedTriage(request.scenario, request.max_spend_usd).catch(() => deterministicTriage(request.max_spend_usd));
  } finally {
    clearTimeout(timeout);
  }
}
