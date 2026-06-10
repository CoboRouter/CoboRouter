import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { demoRequest } from "../broker/routeInference.js";
import type { RouteInferenceResponse } from "../types.js";

const port = Number(process.env.E2E_PORT || 4193);
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
    assert("approved path selects wallet-paid provider", approved.broker_decision.selected_provider === "zai", `provider=${approved.broker_decision.selected_provider}`),
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
    assert("approved path writes receipt", approved.receipt.receipt_path.endsWith(".json"), approved.receipt.receipt_path)
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
