import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { RouteDecision, RouteInferenceResponse } from "../types.js";
import { sha256 } from "../utils/hash.js";

type Check = {
  name: string;
  pass: boolean;
  detail: string;
};

function check(name: string, pass: boolean, detail: string): Check {
  return { name, pass, detail };
}

async function readReceipt(path: string): Promise<RouteInferenceResponse> {
  return JSON.parse(await readFile(path, "utf8")) as RouteInferenceResponse;
}

function quoteForHash(receipt: RouteInferenceResponse): RouteDecision | null {
  return (
    receipt.broker_decision.route_trace.find((entry) => entry.decision === "selected") ??
    [...receipt.broker_decision.route_trace].filter((entry) => entry.capable).sort((a, b) => a.estimated_cost_usd - b.estimated_cost_usd)[0] ??
    null
  );
}

async function archiveMatches(receipt: RouteInferenceResponse, inputPath: string): Promise<boolean> {
  if (!existsSync(receipt.receipt.archive_path)) {
    return false;
  }
  if (inputPath === receipt.receipt.archive_path) {
    return true;
  }
  const current = await readFile(inputPath, "utf8");
  const archived = await readFile(receipt.receipt.archive_path, "utf8");
  return current === archived;
}

const path = process.argv[2];
if (!path) {
  console.error("Usage: npm run verify:receipt -- receipts/coborouter_demo_approved_001.json");
  process.exit(2);
}

let receipt: RouteInferenceResponse;
try {
  receipt = await readReceipt(path);
} catch (error) {
  console.error(`FAIL receipt JSON: ${error instanceof Error ? error.message : "invalid JSON"}`);
  process.exit(1);
}

const routeTraceHash = sha256(JSON.stringify(receipt.broker_decision.route_trace));
const quoteHash = sha256(
  JSON.stringify({
    quoteId: receipt.broker_decision.quote_id,
    quote: quoteForHash(receipt),
    routeTraceHash
  })
);

const checks: Check[] = [
  check("receipt id", receipt.receipt.receipt_id.startsWith("coborouter_"), receipt.receipt.receipt_id),
  check("status is known", ["completed", "blocked", "requires_human_approval", "failed", "paid_failed"].includes(receipt.status), receipt.status),
  check("prompt hash present", receipt.receipt.prompt_hash.startsWith("sha256:"), receipt.receipt.prompt_hash),
  check("policy hash present", receipt.receipt.policy_hash.startsWith("sha256:") && receipt.wallet_policy.policyHash === receipt.receipt.policy_hash, receipt.receipt.policy_hash),
  check("route trace hash", receipt.receipt.route_trace_hash === routeTraceHash, `${receipt.receipt.route_trace_hash} expected ${routeTraceHash}`),
  check("quote hash", receipt.receipt.quote_hash === quoteHash && receipt.broker_decision.quote_hash === quoteHash, `${receipt.receipt.quote_hash} expected ${quoteHash}`),
  check("route trace has quotes", receipt.broker_decision.route_trace.length > 0, `${receipt.broker_decision.route_trace.length} entries`),
  check(
    "token estimates present",
    receipt.broker_decision.route_trace.every((entry) => entry.estimated_input_tokens > 0 && entry.estimated_output_tokens > 0),
    "every quote includes input/output token estimates"
  ),
  check("policy authority recorded", Boolean(receipt.wallet_policy.policyAuthority && receipt.wallet_policy.policySource), `${receipt.wallet_policy.policyAuthority} / ${receipt.wallet_policy.policySource}`),
  check("archive path present", Boolean(receipt.receipt.archive_path), receipt.receipt.archive_path),
  check("archive copy matches", await archiveMatches(receipt, path), receipt.receipt.archive_path)
];

if (receipt.status === "completed") {
  checks.push(
    check("model selected", Boolean(receipt.broker_decision.selected_provider && receipt.broker_decision.selected_model), `${receipt.broker_decision.selected_provider || "none"} / ${receipt.broker_decision.selected_model || "none"}`),
    check("provider invoice reference", Boolean(receipt.provider_invoice.provider_request_id), receipt.provider_invoice.provider_request_id || "missing"),
    check("answer returned", Boolean(receipt.answer?.summary), receipt.answer?.summary.slice(0, 80) || "missing")
  );
}

if (receipt.payment.status === "settled") {
  checks.push(
    check("Cobo operation id", Boolean(receipt.payment.operation_id), receipt.payment.operation_id || "missing"),
    check("payment reference", Boolean(receipt.payment.payment_reference), receipt.payment.payment_reference || "missing"),
    check("tx hash", Boolean(receipt.payment.tx_hash), receipt.payment.tx_hash || "missing"),
    check("explorer URL", Boolean(receipt.payment.explorer_url), receipt.payment.explorer_url || "missing")
  );
}

if (receipt.status === "blocked" || receipt.status === "requires_human_approval") {
  checks.push(
    check("no payment created", receipt.payment.status === "not_created" && !receipt.payment.operation_id, receipt.payment.status),
    check("no provider invoice", !receipt.provider_invoice.provider_request_id && !receipt.provider_invoice.provider_invoice_id, receipt.provider_invoice.provider_request_id || "none"),
    check("no answer", receipt.answer === null, receipt.answer ? "answer unexpectedly present" : "no answer")
  );
}

if (receipt.status === "paid_failed") {
  checks.push(
    check("settlement failed safely", receipt.payment.status === "failed", receipt.payment.status),
    check("manual reconciliation marked", receipt.payment.refund_status === "manual_reconciliation_required", receipt.payment.refund_status),
    check("no inference after failed settlement", receipt.answer === null && !receipt.provider_invoice.provider_request_id, receipt.answer ? "answer unexpectedly present" : "no inference")
  );
}

let failures = 0;
for (const item of checks) {
  if (!item.pass) failures += 1;
  console.log(`${item.pass ? "PASS" : "FAIL"} ${item.name}: ${item.detail}`);
}

console.log(`\nReceipt verifier summary: ${checks.length - failures} passed, ${failures} failed.`);
if (failures > 0) {
  process.exitCode = 1;
}
