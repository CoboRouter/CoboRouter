import { readFile } from "node:fs/promises";
import type { RouteInferenceRequest, TriageResult } from "../types.js";
import { deterministicTriage } from "./deterministicFallback.js";

const TRIAGE_TIMEOUT_MS = 10_000;
const capabilityKeys = [
  "reasoning",
  "coding",
  "long_context",
  "latency_sensitivity",
  "privacy_sensitivity",
  "web3_context",
  "structured_output"
] as const;

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return trimmed.slice(first, last + 1);
  }

  throw new Error("Z.AI triage response did not include a JSON object");
}

function numberScore(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(5, Math.round(parsed)));
}

function localOnlyTriage(maxSpendUsd: number): TriageResult {
  return {
    task_type: "private_local_summary",
    triage_source: "deterministic_fallback",
    triage_model: "local-privacy-gate",
    capabilities: {
      reasoning: 2,
      coding: 0,
      long_context: 1,
      latency_sensitivity: 4,
      privacy_sensitivity: 5,
      web3_context: 1,
      structured_output: 2
    },
    routing_preference: "cheapest_capable",
    max_spend_usd: maxSpendUsd,
    requires_wallet_payment: false,
    risk_level: "low",
    recommended_policy: {
      human_approval_required: false,
      allowed_provider_classes: ["local"]
    }
  };
}

function simpleTriage(maxSpendUsd: number, source: TriageResult["triage_source"] = "deterministic_fallback"): TriageResult {
  return {
    task_type: "simple_text_generation",
    triage_source: source,
    triage_model: source === "zai_live" ? process.env.ZAI_MODEL || "glm-5.1" : "deterministic-simple-gate",
    capabilities: {
      reasoning: 2,
      coding: 0,
      long_context: 1,
      latency_sensitivity: 5,
      privacy_sensitivity: 1,
      web3_context: 0,
      structured_output: 2
    },
    routing_preference: "cheapest_capable",
    max_spend_usd: maxSpendUsd,
    requires_wallet_payment: false,
    risk_level: "low",
    recommended_policy: {
      human_approval_required: false,
      allowed_provider_classes: ["zai_lightweight", "local"]
    }
  };
}

function shouldStayLocal(request: RouteInferenceRequest): boolean {
  const prompt = request.prompt.toLowerCase();
  return request.scenario === "local" || prompt.includes("local-only") || prompt.includes("private task") || prompt.includes("confidential");
}

function simplifyTriageForSimplePrompt(triage: TriageResult, prompt: string): TriageResult {
  const normalized = prompt.toLowerCase();
  const simple =
    normalized.length < 240 &&
    (normalized.includes("summarize") || normalized.includes("one sentence") || normalized.includes("rewrite") || normalized.includes("classify"));

  if (!simple) {
    return triage;
  }

  return {
    ...simpleTriage(triage.max_spend_usd, triage.triage_source),
    ...triage,
    task_type: "simple_text_generation",
    capabilities: {
      reasoning: Math.min(triage.capabilities.reasoning, 2),
      coding: Math.min(triage.capabilities.coding, 1),
      long_context: Math.min(triage.capabilities.long_context, 1),
      latency_sensitivity: Math.max(triage.capabilities.latency_sensitivity, 4),
      privacy_sensitivity: Math.min(triage.capabilities.privacy_sensitivity, 2),
      web3_context: Math.min(triage.capabilities.web3_context, 1),
      structured_output: Math.min(triage.capabilities.structured_output, 3)
    },
    requires_wallet_payment: false,
    risk_level: "low",
    recommended_policy: {
      human_approval_required: false,
      allowed_provider_classes: ["zai_lightweight", "local"]
    }
  };
}

async function readCachedTriage(scenario: RouteInferenceRequest["scenario"], maxSpendUsd: number): Promise<TriageResult> {
  const file = scenario === "blocked" ? "fixtures/cached-triage/blocked-path.json" : "fixtures/cached-triage/approved-path.json";
  const parsed = JSON.parse(await readFile(file, "utf8")) as TriageResult;
  return {
    ...parsed,
    max_spend_usd: maxSpendUsd,
    triage_source: "cached_zai_response"
  };
}

function parseTriageJson(raw: string, maxSpendUsd: number, prompt: string): TriageResult {
  const parsed = JSON.parse(extractJsonObject(raw)) as Partial<TriageResult>;
  const fallback = deterministicTriage(maxSpendUsd);
  const capabilities = capabilityKeys.reduce<TriageResult["capabilities"]>((result, key) => {
    result[key] = numberScore(parsed.capabilities?.[key], fallback.capabilities[key]);
    return result;
  }, {} as TriageResult["capabilities"]);
  const routingPreference =
    parsed.routing_preference === "fastest_capable" || parsed.routing_preference === "quality_first" || parsed.routing_preference === "cheapest_capable"
      ? parsed.routing_preference
      : fallback.routing_preference;
  const riskLevel = parsed.risk_level === "low" || parsed.risk_level === "high" || parsed.risk_level === "medium" ? parsed.risk_level : fallback.risk_level;

  return simplifyTriageForSimplePrompt({
    task_type: parsed.task_type || fallback.task_type,
    capabilities,
    routing_preference: routingPreference,
    max_spend_usd: maxSpendUsd,
    requires_wallet_payment: parsed.requires_wallet_payment ?? fallback.requires_wallet_payment,
    risk_level: riskLevel,
    recommended_policy: {
      human_approval_required: parsed.recommended_policy?.human_approval_required ?? fallback.recommended_policy.human_approval_required,
      allowed_provider_classes: parsed.recommended_policy?.allowed_provider_classes ?? fallback.recommended_policy.allowed_provider_classes
    },
    triage_source: "zai_live",
    triage_model: process.env.ZAI_MODEL || parsed.triage_model || "glm-5.1"
  }, prompt);
}

export async function triagePrompt(request: RouteInferenceRequest): Promise<TriageResult> {
  if (shouldStayLocal(request)) {
    return localOnlyTriage(request.max_spend_usd);
  }

  if (request.scenario === "simple_zai" && !process.env.ZAI_API_KEY) {
    return simpleTriage(request.max_spend_usd);
  }

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
        thinking: { type: "disabled" },
        enable_thinking: false,
        temperature: 0,
        max_tokens: 1200,
        messages: [
          {
            role: "system",
            content:
              [
                "Classify this autonomous agent task for inference routing.",
                "Return one valid compact JSON object only.",
                "Required fields: task_type, capabilities, routing_preference, requires_wallet_payment, risk_level, recommended_policy.",
                "capabilities must contain 0-5 scores for reasoning, coding, long_context, latency_sensitivity, privacy_sensitivity, web3_context, structured_output.",
                "Set coding below 3 unless the task explicitly asks to write, debug, review, or execute code.",
                "routing_preference must be cheapest_capable, fastest_capable, or quality_first.",
                "risk_level must be low, medium, or high."
              ].join(" ")
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

    const json = (await response.json()) as { choices?: Array<{ message?: { content?: string; reasoning_content?: string } }> };
    const content = json.choices?.[0]?.message?.content || json.choices?.[0]?.message?.reasoning_content;
    if (!content) {
      throw new Error("Z.AI triage response did not include content");
    }
    return parseTriageJson(content, request.max_spend_usd, request.prompt);
  } catch {
    return readCachedTriage(request.scenario, request.max_spend_usd).catch(() => deterministicTriage(request.max_spend_usd));
  } finally {
    clearTimeout(timeout);
  }
}
