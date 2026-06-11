import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { demoRequest } from "../broker/routeInference.js";
import { loadEnv } from "../config/env.js";
import type { RouteInferenceResponse } from "../types.js";

await loadEnv();

const port = Number(process.env.E2E_PORT || 4200 + Math.floor(Math.random() * 1000));
const baseUrl = `http://localhost:${port}`;

type Assertion = {
  name: string;
  pass: boolean;
  detail: string;
};

function assert(name: string, pass: boolean, detail: string): Assertion {
  return { name, pass, detail };
}

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/tool-schema`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await sleep(250);
  }
  throw new Error(`CoboRouter server did not become ready at ${baseUrl}`);
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) {
    throw new Error(`GET ${path} failed: HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`POST ${path} failed: HTTP ${response.status}; ${text}`);
  }
  return JSON.parse(text) as T;
}

const server = spawn("npm", ["run", "dev"], {
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});

const stderr: string[] = [];
server.stderr.on("data", (chunk) => stderr.push(chunk.toString()));

try {
  await waitForServer();

  const schema = await getJson<{ name?: string; input_schema?: { required?: string[] } }>("/api/tool-schema");
  const blocked = await postJson<RouteInferenceResponse>("/api/route-inference", demoRequest("blocked"));
  const approved = await postJson<RouteInferenceResponse>("/api/route-inference", demoRequest("approved"));
  const budgetDeclined = await postJson<RouteInferenceResponse>("/api/route-inference", demoRequest("budget_declined"));
  const local = await postJson<RouteInferenceResponse>("/api/route-inference", demoRequest("local"));
  const simpleZai = await postJson<RouteInferenceResponse>("/api/route-inference", demoRequest("simple_zai"));
  const providerDenied = await postJson<RouteInferenceResponse>("/api/route-inference", demoRequest("provider_not_allowlisted"));
  const humanApproval = await postJson<RouteInferenceResponse>("/api/route-inference", demoRequest("human_approval"));
  const settlementFailure = await postJson<RouteInferenceResponse>("/api/route-inference", demoRequest("settlement_failure"));

  const assertions: Assertion[] = [
    assert("tool schema is discoverable", schema.name === "route_inference", `name=${schema.name || "missing"}`),
    assert(
      "tool schema requires agent inputs",
      ["prompt", "routing_mode", "max_spend_usd", "allowed_providers"].every((key) => schema.input_schema?.required?.includes(key)),
      `required=${schema.input_schema?.required?.join(",") || "missing"}`
    ),
    assert("blocked path blocks spend", blocked.status === "blocked", `status=${blocked.status}`),
    assert("blocked path creates no payment", blocked.payment.status === "not_created" && !blocked.payment.operation_id, `payment=${blocked.payment.status}`),
    assert("approved path completes", approved.status === "completed", `status=${approved.status}`),
    assert(
      "approved path uses live Z.AI triage when key is configured",
      !process.env.ZAI_API_KEY || approved.broker_decision.triage_source === "zai_live",
      `triage=${approved.broker_decision.triage_source}`
    ),
    assert("approved path selects wallet-paid provider", approved.broker_decision.selected_provider === "zai", `provider=${approved.broker_decision.selected_provider}`),
    assert("approved path selects GLM-5.1", approved.broker_decision.selected_model === "glm-5.1", `model=${approved.broker_decision.selected_model}`),
    assert("approved path uses real Z.AI invoice when key is configured", !process.env.ZAI_API_KEY || approved.provider_invoice.simulated === false, `simulated=${approved.provider_invoice.simulated}`),
    assert(
      "approved path has Cobo proof reference",
      Boolean(approved.payment.operation_id && approved.payment.payment_reference),
      `operation=${approved.payment.operation_id || "missing"} payment=${approved.payment.payment_reference || "missing"}`
    ),
    assert(
      "transfer settlement returns on-chain proof",
      process.env.COBO_SETTLEMENT_MODE !== "transfer" ||
        Boolean(approved.payment.tx_hash && approved.payment.explorer_url && approved.payment.status === "settled"),
      `status=${approved.payment.status} tx=${approved.payment.tx_hash || "missing"}`
    ),
    assert(
      "approved path has non-demo wallet when live env is configured",
      process.env.COBO_ADAPTER_MODE !== "live" || approved.wallet_policy.policyId !== "cobo_policy_demo",
      `policy=${approved.wallet_policy.policyId}`
    ),
    assert("approved path writes receipt", approved.receipt.receipt_path.endsWith(".json"), approved.receipt.receipt_path),
    assert("budget edge blocks because quote exceeds wallet budget", budgetDeclined.status === "blocked" && budgetDeclined.wallet_policy.reason === "quote_exceeds_task_budget", `status=${budgetDeclined.status} reason=${budgetDeclined.wallet_policy.reason}`),
    assert("budget edge creates no Cobo payment", budgetDeclined.payment.status === "not_created" && !budgetDeclined.payment.tx_hash, `payment=${budgetDeclined.payment.status}`),
    assert("local edge selects local model", local.status === "completed" && local.broker_decision.selected_provider === "local_baseline", `status=${local.status} provider=${local.broker_decision.selected_provider}`),
    assert("local edge creates no payment", local.payment.status === "not_created" && local.provider_invoice.simulated === true, `payment=${local.payment.status} simulated=${local.provider_invoice.simulated}`),
    assert("simple Z.AI edge selects non-GLM-5.1 model", simpleZai.status === "completed" && simpleZai.broker_decision.selected_provider === "zai_flash" && simpleZai.broker_decision.selected_model === "glm-4.7-flash", `status=${simpleZai.status} provider=${simpleZai.broker_decision.selected_provider} model=${simpleZai.broker_decision.selected_model}`),
    assert("simple Z.AI edge uses live API when key is configured", !process.env.ZAI_API_KEY || simpleZai.provider_invoice.simulated === false, `simulated=${simpleZai.provider_invoice.simulated}`),
    assert("provider allowlist edge blocks selected provider", providerDenied.status === "blocked" && providerDenied.wallet_policy.reason === "provider_not_allowlisted", `status=${providerDenied.status} reason=${providerDenied.wallet_policy.reason}`),
    assert("provider allowlist edge creates no payment", providerDenied.payment.status === "not_created" && !providerDenied.provider_invoice.provider_request_id, `payment=${providerDenied.payment.status}`),
    assert("human approval edge pauses before spend", humanApproval.status === "requires_human_approval" && humanApproval.wallet_policy.reason === "human_approval_threshold_exceeded", `status=${humanApproval.status} reason=${humanApproval.wallet_policy.reason}`),
    assert("human approval edge creates no payment", humanApproval.payment.status === "not_created" && !humanApproval.provider_invoice.provider_request_id, `payment=${humanApproval.payment.status}`),
    assert("settlement failure edge fails safely", settlementFailure.status === "paid_failed" && settlementFailure.payment.status === "failed", `status=${settlementFailure.status} payment=${settlementFailure.payment.status}`),
    assert("settlement failure edge skips inference", !settlementFailure.answer && !settlementFailure.provider_invoice.provider_request_id, `answer=${Boolean(settlementFailure.answer)} provider=${settlementFailure.provider_invoice.provider_request_id || "none"}`)
  ];

  let failures = 0;
  for (const item of assertions) {
    if (!item.pass) failures += 1;
    console.log(`${item.pass ? "PASS" : "FAIL"} ${item.name}: ${item.detail}`);
  }

  console.log(`\nAgent E2E summary: ${assertions.length - failures} passed, ${failures} failed.`);
  if (failures > 0) {
    process.exitCode = 1;
  }
} finally {
  server.kill("SIGTERM");
  if (process.exitCode) {
    console.error(stderr.join(""));
  }
}
