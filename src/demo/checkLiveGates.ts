import { loadEnv } from "../config/env.js";

type Gate = {
  name: string;
  status: "pass" | "warn" | "fail";
  detail: string;
};

const strictMode = process.argv.includes("--strict");

function gated(status: Gate["status"]): Gate["status"] {
  return strictMode && status === "warn" ? "fail" : status;
}

async function checkZai(): Promise<Gate> {
  const apiKey = process.env.ZAI_API_KEY;
  const model = process.env.ZAI_MODEL || "glm-5.1";

  if (!apiKey) {
    return {
      name: "Z.AI model call",
      status: gated("warn"),
      detail: "ZAI_API_KEY missing; cached GLM/Z.AI triage remains available for local demo mode"
    };
  }

  try {
    const response = await fetch("https://api.z.ai/api/paas/v4/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content:
              "Return JSON only: {\"task_type\":\"fast_chat\",\"capabilities\":{\"reasoning\":1,\"coding\":0,\"long_context\":0,\"latency_sensitivity\":1,\"privacy_sensitivity\":0,\"web3_context\":0,\"structured_output\":2}}"
          }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        name: "Z.AI model call",
        status: "fail",
        detail: `model=${model}; HTTP ${response.status}${body ? `; ${body.slice(0, 240)}` : ""}`
      };
    }

    return {
      name: "Z.AI model call",
      status: "pass",
      detail: `model=${model}; chat completion succeeded`
    };
  } catch (error) {
    return {
      name: "Z.AI model call",
      status: "fail",
      detail: error instanceof Error ? error.message : "unknown error"
    };
  }
}

function checkCoboEnv(): Gate[] {
  const apiKey = process.env.AGENT_WALLET_API_KEY || process.env.COBO_API_KEY;
  const apiUrl = process.env.AGENT_WALLET_API_URL || process.env.COBO_AGENT_WALLET_API_URL;
  const walletId = process.env.AGENT_WALLET_WALLET_ID || process.env.COBO_WALLET_ID;
  const missing = [
    apiKey ? null : "AGENT_WALLET_API_KEY or COBO_API_KEY",
    walletId ? null : "AGENT_WALLET_WALLET_ID or COBO_WALLET_ID",
    process.env.COBO_POLICY_ID ? null : "COBO_POLICY_ID",
    process.env.COBO_DEMO_NETWORK ? null : "COBO_DEMO_NETWORK",
    process.env.COBO_PAYMENT_ASSET ? null : "COBO_PAYMENT_ASSET"
  ].filter(Boolean);
  const demoWallet = process.env.COBO_WALLET_ADDRESS === "0xC0B0000000000000000000000000000000000000";
  const transferMode = process.env.COBO_SETTLEMENT_MODE === "transfer";
  const transferMissing = transferMode
    ? ["COBO_PROVIDER_SETTLEMENT_ADDRESS", "COBO_SETTLEMENT_TOKEN_ID"].filter((key) => !process.env[key])
    : [];

  return [
    {
      name: "Cobo adapter mode",
      status: gated(process.env.COBO_ADAPTER_MODE === "live" ? "pass" : "warn"),
      detail: process.env.COBO_ADAPTER_MODE === "live" ? "live mode selected" : "demo mode selected; set COBO_ADAPTER_MODE=live for final proof"
    },
    {
      name: "Cobo credential env",
      status: gated(missing.length === 0 ? "pass" : "warn"),
      detail: missing.length === 0 ? `required Cobo env vars present${apiUrl ? `; api=${apiUrl}` : ""}` : `missing: ${missing.join(", ")}`
    },
    {
      name: "Cobo wallet reference",
      status: gated(process.env.COBO_WALLET_ADDRESS && !demoWallet ? "pass" : "warn"),
      detail:
        process.env.COBO_WALLET_ADDRESS && !demoWallet
          ? process.env.COBO_WALLET_ADDRESS
          : "missing or still using the demo wallet address"
    },
    {
      name: "Cobo proof type",
      status: process.env.COBO_PROOF_TYPE === "on_chain" || process.env.COBO_PROOF_TYPE === "cobo_operation" ? "pass" : gated("warn"),
      detail: process.env.COBO_PROOF_TYPE || "missing; expected on_chain or cobo_operation"
    },
    {
      name: "Cobo settlement mode",
      status: gated(process.env.COBO_SETTLEMENT_MODE === "transfer" || process.env.COBO_LIVE_PACT_ID ? "pass" : "warn"),
      detail:
        process.env.COBO_SETTLEMENT_MODE === "transfer"
          ? "transfer settlement configured"
          : process.env.COBO_LIVE_PACT_ID
            ? "preapproved pact configured"
            : "no transfer settlement or preapproved pact configured"
    },
    {
      name: "Cobo transfer settlement config",
      status: gated(!transferMode || transferMissing.length === 0 ? "pass" : "warn"),
      detail: !transferMode ? "not required unless COBO_SETTLEMENT_MODE=transfer" : transferMissing.length === 0 ? "provider settlement address and token ID present" : `missing: ${transferMissing.join(", ")}`
    }
  ];
}

await loadEnv();

const gates: Gate[] = [...checkCoboEnv(), await checkZai()];
let failed = 0;
let warned = 0;

for (const gate of gates) {
  if (gate.status === "fail") failed += 1;
  if (gate.status === "warn") warned += 1;
  const label = gate.status === "pass" ? "PASS" : gate.status === "warn" ? "WARN" : "FAIL";
  console.log(`${label} ${gate.name}: ${gate.detail}`);
}

console.log(`\nMode: ${strictMode ? "strict live gate" : "local live-readiness gate"}`);
console.log(`Summary: ${gates.length - failed - warned} passed, ${warned} warnings, ${failed} failures.`);

if (failed > 0) {
  process.exitCode = 1;
}
