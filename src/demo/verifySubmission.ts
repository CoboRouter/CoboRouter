import { access, readFile } from "node:fs/promises";
import type { RouteInferenceResponse } from "../types.js";
import { loadEnv } from "../config/env.js";

const strictMode = process.argv.includes("--strict");
const demoWalletAddress = "0xC0B0000000000000000000000000000000000000";

type Check = {
  name: string;
  status: "pass" | "warn" | "fail";
  detail: string;
};

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readReceipt(path: string): Promise<RouteInferenceResponse | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as RouteInferenceResponse;
  } catch {
    return null;
  }
}

async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

function gateWarn(status: "pass" | "warn" | "fail"): "pass" | "warn" | "fail" {
  return strictMode && status === "warn" ? "fail" : status;
}

function checkReceipt(receipt: RouteInferenceResponse | null, expectedStatus: RouteInferenceResponse["status"], name: string): Check[] {
  if (!receipt) {
    return [{ name, status: "fail", detail: "receipt file missing or invalid JSON" }];
  }

  const checks: Check[] = [
    {
      name: `${name}: status`,
      status: receipt.status === expectedStatus ? "pass" : "fail",
      detail: `expected ${expectedStatus}, got ${receipt.status}`
    },
    {
      name: `${name}: policy hash`,
      status: receipt.wallet_policy.policyHash.startsWith("sha256:") ? "pass" : "fail",
      detail: receipt.wallet_policy.policyHash
    },
    {
      name: `${name}: wallet reference`,
      status: receipt.wallet_policy.walletAddress ? "pass" : "fail",
      detail: receipt.wallet_policy.walletAddress || "missing"
    },
    {
      name: `${name}: route trace`,
      status: receipt.broker_decision.route_trace.length > 0 ? "pass" : "fail",
      detail: `${receipt.broker_decision.route_trace.length} route entries`
    },
    {
      name: `${name}: dynamic token quotes`,
      status: receipt.broker_decision.route_trace.every((entry) => entry.estimated_input_tokens > 0 && entry.estimated_output_tokens > 0) ? "pass" : "fail",
      detail: "each route trace entry includes prompt-derived input/output token estimates"
    },
    {
      name: `${name}: immutable archive`,
      status: receipt.receipt.archive_path?.startsWith(`receipts/archive/${receipt.receipt.receipt_id}/`) ? "pass" : "fail",
      detail: receipt.receipt.archive_path || "missing"
    },
    {
      name: `${name}: execution boundary`,
      status: receipt.receipt.execution_mode === "live" || receipt.receipt.execution_mode === "demo" ? "pass" : "fail",
      detail: receipt.receipt.execution_mode || "missing"
    },
    {
      name: `${name}: policy authority`,
      status: receipt.wallet_policy.policyAuthority === "cobo_agentic_wallet" || receipt.wallet_policy.policyAuthority === "local_demo" ? "pass" : "fail",
      detail: `${receipt.wallet_policy.policyAuthority || "missing"} via ${receipt.wallet_policy.policySource || "missing"}`
    }
  ];

  if (expectedStatus === "completed") {
    checks.push(
      {
        name: `${name}: selected provider is wallet-paid`,
        status: receipt.broker_decision.selected_provider === "zai" ? "pass" : "fail",
        detail: receipt.broker_decision.selected_provider || "missing"
      },
      {
        name: `${name}: Cobo operation proof`,
        status: receipt.payment.operation_id && receipt.payment.payment_reference ? "pass" : "fail",
        detail: `operation=${receipt.payment.operation_id || "missing"}, payment=${receipt.payment.payment_reference || "missing"}`
      },
      {
        name: `${name}: live provider invoice`,
        status: gateWarn(receipt.provider_invoice.simulated ? "warn" : "pass"),
        detail: receipt.provider_invoice.simulated
          ? "demo/cached mode: set ZAI_API_KEY and rerun approved path for live provider proof"
          : receipt.provider_invoice.provider_request_id || "live provider request present"
      },
      {
        name: `${name}: Cobo proof reference`,
        status: gateWarn(receipt.wallet_policy.walletAddress === demoWalletAddress || receipt.wallet_policy.policyId === "cobo_policy_demo" ? "warn" : "pass"),
        detail:
          receipt.wallet_policy.walletAddress === demoWalletAddress || receipt.wallet_policy.policyId === "cobo_policy_demo"
            ? "demo wallet/policy reference; set live Cobo env and rerun receipts before final submission"
            : `wallet=${receipt.wallet_policy.walletAddress}, policy=${receipt.wallet_policy.policyId}`
      },
      {
        name: `${name}: receipt brand`,
        status: receipt.receipt.receipt_id.startsWith("coborouter_demo_") ? "pass" : "fail",
        detail: receipt.receipt.receipt_id
      }
    );
  }

  if (expectedStatus === "blocked") {
    checks.push(
      {
        name: `${name}: no spend created`,
        status: receipt.payment.status === "not_created" && !receipt.payment.operation_id ? "pass" : "fail",
        detail: `payment status=${receipt.payment.status}`
      },
      {
        name: `${name}: block reason`,
        status: receipt.wallet_policy.reason ? "pass" : "fail",
        detail: receipt.wallet_policy.reason || "missing"
      },
      {
        name: `${name}: receipt brand`,
        status: receipt.receipt.receipt_id.startsWith("coborouter_demo_") || receipt.receipt.receipt_id.startsWith("coborouter_edge_") ? "pass" : "fail",
        detail: receipt.receipt.receipt_id
      }
    );
  }

  if (expectedStatus === "requires_human_approval") {
    checks.push(
      {
        name: `${name}: no spend before human approval`,
        status: receipt.payment.status === "not_created" && !receipt.payment.operation_id ? "pass" : "fail",
        detail: `payment status=${receipt.payment.status}`
      },
      {
        name: `${name}: approval reason`,
        status: receipt.wallet_policy.reason === "human_approval_threshold_exceeded" ? "pass" : "fail",
        detail: receipt.wallet_policy.reason || "missing"
      }
    );
  }

  if (expectedStatus === "paid_failed") {
    checks.push(
      {
        name: `${name}: settlement failed safely`,
        status: receipt.payment.status === "failed" && receipt.payment.refund_status === "manual_reconciliation_required" ? "pass" : "fail",
        detail: `payment=${receipt.payment.status}, refund=${receipt.payment.refund_status}`
      },
      {
        name: `${name}: no inference after failed settlement`,
        status: receipt.answer === null && !receipt.provider_invoice.provider_request_id ? "pass" : "fail",
        detail: receipt.answer ? "answer unexpectedly present" : "no answer/provider invoice"
      }
    );
  }

  return checks;
}

await loadEnv();

const productFiles = [
  "README.md",
  ".github/workflows/verify.yml",
  "agent/coborouter.route_inference.tool.json",
  "docs/brand/coborouter-icon.svg",
  "docs/brand/coborouter-hero.svg",
  "docs/screenshots/blocked.png",
  "docs/screenshots/approved.png",
  "src/wallet/coboAdapter.ts",
  "src/wallet/policy.ts",
  "src/broker/routeInference.ts",
  "src/broker/toolSchema.ts",
  "src/broker/routingPolicy.ts",
  "src/inference/inferenceAdapter.ts",
  "src/inference/providerRegistry.json",
  "src/receipts/receiptGenerator.ts",
  "src/demo/timelineUi.tsx",
  "src/demo/verifyReceipt.ts",
  "fixtures/defi-yield-options.json",
  "fixtures/cached-triage/approved-path.json",
  "fixtures/cached-triage/blocked-path.json",
  "receipts/coborouter_demo_approved_001.json",
  "receipts/coborouter_demo_blocked_001.json",
  "receipts/coborouter_edge_provider_not_allowlisted_001.json",
  "receipts/coborouter_edge_human_approval_001.json",
  "receipts/coborouter_edge_settlement_failure_001.json"
];

const generatedFiles = [
  "docs/SECRET_SCAN.md",
  "docs/ARTIFACT_INDEX.md",
  "docs/EVIDENCE_REPORT.md",
  "docs/APPLICATION_PACKET.md",
  "docs/SUBMISSION_READINESS.md",
  "submission/artifact-manifest.json",
  "submission/FINAL_BLOCKERS.md",
  "submission/final-env-template.env",
  "submission/bundle-archive.json"
];

const checks: Check[] = [];
for (const file of productFiles) {
  checks.push({
    name: `file: ${file}`,
    status: (await exists(file)) ? "pass" : "fail",
    detail: file
  });
}

for (const file of generatedFiles) {
  const fileExists = await exists(file);
  checks.push({
    name: `generated artifact: ${file}`,
    status: fileExists ? "pass" : gateWarn("warn"),
    detail: fileExists ? file : "not generated yet; run npm run ci:local or the specific packet command before final packaging"
  });
}

const approved = await readReceipt("receipts/coborouter_demo_approved_001.json");
const blocked = await readReceipt("receipts/coborouter_demo_blocked_001.json");
const providerDenied = await readReceipt("receipts/coborouter_edge_provider_not_allowlisted_001.json");
const humanApproval = await readReceipt("receipts/coborouter_edge_human_approval_001.json");
const settlementFailure = await readReceipt("receipts/coborouter_edge_settlement_failure_001.json");
checks.push(...checkReceipt(approved, "completed", "approved receipt"));
checks.push(...checkReceipt(blocked, "blocked", "blocked receipt"));
checks.push(...checkReceipt(providerDenied, "blocked", "provider-denied receipt"));
checks.push(...checkReceipt(humanApproval, "requires_human_approval", "human-approval receipt"));
checks.push(...checkReceipt(settlementFailure, "paid_failed", "settlement-failure receipt"));

checks.push({
  name: "Z.AI live key",
  status: gateWarn(process.env.ZAI_API_KEY ? "pass" : "warn"),
  detail: process.env.ZAI_API_KEY ? "ZAI_API_KEY present" : "missing; demo uses cached GLM/Z.AI triage and deterministic answer"
});

checks.push({
  name: "Cobo live credentials",
  status: gateWarn((process.env.AGENT_WALLET_API_KEY || process.env.COBO_API_KEY) && (process.env.AGENT_WALLET_WALLET_ID || process.env.COBO_WALLET_ID) ? "pass" : "warn"),
  detail:
    (process.env.AGENT_WALLET_API_KEY || process.env.COBO_API_KEY) && (process.env.AGENT_WALLET_WALLET_ID || process.env.COBO_WALLET_ID)
      ? "Cobo credential env vars present"
      : "missing; demo uses Cobo-compatible policy adapter"
});

checks.push({
  name: "Cobo live adapter mode",
  status: gateWarn(process.env.COBO_ADAPTER_MODE === "live" ? "pass" : "warn"),
  detail: process.env.COBO_ADAPTER_MODE === "live" ? "COBO_ADAPTER_MODE=live" : "COBO_ADAPTER_MODE is not live"
});

checks.push({
  name: "Cobo wallet reference is non-demo",
  status: gateWarn(process.env.COBO_WALLET_ADDRESS && process.env.COBO_WALLET_ADDRESS !== demoWalletAddress ? "pass" : "warn"),
  detail:
    process.env.COBO_WALLET_ADDRESS && process.env.COBO_WALLET_ADDRESS !== demoWalletAddress
      ? process.env.COBO_WALLET_ADDRESS
      : "demo wallet reference still active"
});

const submissionText = await readText("docs/SUBMISSION.md");
const packetText = await readText("docs/APPLICATION_PACKET.md");
const secretScanText = await readText("docs/SECRET_SCAN.md");
const linkLines = submissionText
  .split(/\r?\n/)
  .filter((line) => /^- (GitHub repo|Demo video|Demo link|Approved receipt|Blocked receipt|Cobo operation proof|Agent wallet address \/ wallet ID|Policy ID \/ hash):\s*$/.test(line));
const packetTodos = (packetText.match(/TODO:/g) || []).length;
const gitignoreText = await readText(".gitignore");

const teamLines = submissionText
  .split(/\r?\n/)
  .filter((line) => /^- (Member|Role|Contact|Prize wallet address):\s*$/.test(line));
checks.push({
  name: "application packet generated",
  status: packetText.includes("# Application Packet") ? "pass" : "fail",
  detail: packetText.includes("# Application Packet") ? "docs/APPLICATION_PACKET.md" : "missing or invalid packet"
});

checks.push({
  name: "secret scan generated",
  status: secretScanText.includes("Status: **PASS**") ? "pass" : "fail",
  detail: secretScanText.includes("Status: **PASS**")
    ? "docs/SECRET_SCAN.md reports no likely committed credential values"
    : "run npm run secret:scan and clear any findings before publishing"
});

checks.push({
  name: "application packet fields filled",
  status: gateWarn(packetTodos === 0 ? "pass" : "warn"),
  detail: packetTodos === 0 ? "no TODO fields in generated packet" : `${packetTodos} TODO markers remain in docs/APPLICATION_PACKET.md`
});

checks.push({
  name: "legacy submission placeholders",
  status: linkLines.length === 0 && teamLines.length === 0 ? "pass" : "warn",
  detail:
    linkLines.length === 0 && teamLines.length === 0
      ? "docs/SUBMISSION.md has no blank legacy placeholders"
      : `${linkLines.length + teamLines.length} legacy blank placeholders remain; generated packet is authoritative`
});

const gitignoreRequirements = [
  ".env",
  ".env.*",
  "!.env.example",
  "node_modules/",
  ".omc/",
  ".omx/",
  "logs/*.jsonl",
  "submission/bundle/",
  "submission/*.tgz"
];
const missingGitignore = gitignoreRequirements.filter((entry) => !gitignoreText.split(/\r?\n/).includes(entry));
checks.push({
  name: "public repo ignore hygiene",
  status: missingGitignore.length === 0 ? "pass" : "fail",
  detail: missingGitignore.length === 0 ? "secrets, local state, dependencies, and bulky generated outputs are ignored" : `missing .gitignore entries: ${missingGitignore.join(", ")}`
});

let failed = 0;
let warned = 0;
for (const check of checks) {
  if (check.status === "fail") failed += 1;
  if (check.status === "warn") warned += 1;
  const icon = check.status === "pass" ? "PASS" : check.status === "warn" ? "WARN" : "FAIL";
  console.log(`${icon} ${check.name}: ${check.detail}`);
}

console.log(`\nMode: ${strictMode ? "strict final-submission gate" : "local demo gate"}`);
console.log(`Summary: ${checks.length - failed - warned} passed, ${warned} warnings, ${failed} failures.`);

if (failed > 0) {
  process.exitCode = 1;
}
