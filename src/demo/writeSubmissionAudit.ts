import { access, readFile, writeFile } from "node:fs/promises";
import type { RouteInferenceResponse } from "../types.js";
import { loadEnv } from "../config/env.js";

type AuditRow = {
  requirement: string;
  status: "done" | "demo-ready" | "missing";
  evidence: string;
  next: string;
};

const demoWalletAddress = "0xC0B0000000000000000000000000000000000000";

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

function statusIcon(status: AuditRow["status"]): string {
  if (status === "done") return "DONE";
  if (status === "demo-ready") return "DEMO";
  return "MISSING";
}

function receiptEvidence(receipt: RouteInferenceResponse | null): string {
  if (!receipt) return "Receipt missing or invalid.";
  return [
    `status=${receipt.status}`,
    `receipt=${receipt.receipt.receipt_path}`,
    `policy=${receipt.wallet_policy.result}`,
    `operation=${receipt.payment.operation_id || "none"}`,
    `payment=${receipt.payment.payment_reference || "none"}`,
    `simulated=${receipt.provider_invoice.simulated}`
  ].join("; ");
}

await loadEnv();

const approved = await readReceipt("receipts/coborouter_demo_approved_001.json");
const blocked = await readReceipt("receipts/coborouter_demo_blocked_001.json");
const packet = await readFile("docs/APPLICATION_PACKET.md", "utf8").catch(() => "");
const secretScan = await readFile("docs/SECRET_SCAN.md", "utf8").catch(() => "");
const coboApiKey = process.env.AGENT_WALLET_API_KEY || process.env.COBO_API_KEY;
const coboWalletId = process.env.AGENT_WALLET_WALLET_ID || process.env.COBO_WALLET_ID;

const packetTodos = (packet.match(/TODO:/g) || []).length;

const files = [
  "README.md",
  "SPEC.md",
  "IMPLEMENTATION_PLAN.md",
  ".github/workflows/verify.yml",
  "docs/PROJECT_PROPOSAL.md",
  "docs/SECURITY_BOUNDARIES.md",
  "docs/SUBMISSION.md",
  "docs/APPLICATION_PACKET.md",
  "docs/screenshots/blocked.png",
  "docs/screenshots/approved.png",
  "docs/DEMO_VIDEO_SCRIPT.md",
  "docs/REPO_PUBLICATION_CHECKLIST.md",
  "docs/FINAL_SUBMISSION_RUNBOOK.md",
  "docs/ARTIFACT_INDEX.md",
  "docs/LIVE_INTEGRATION.md",
  "docs/LIVE_PROOF_CAPTURE_CHECKLIST.md",
  "docs/SECRET_SCAN.md",
  "submission/artifact-manifest.json",
  "submission/FINAL_BLOCKERS.md",
  "submission/final-env-template.env",
  "submission/bundle/README.md",
  "submission/bundle/bundle-manifest.json",
  "submission/coborouter-submission-bundle.tgz",
  "submission/bundle-archive.json",
  "fixtures/defi-yield-options.json",
  "src/demo/timelineUi.tsx",
  "src/wallet/coboAdapter.ts",
  "src/broker/routeInference.ts",
  "src/broker/toolSchema.ts"
];

const missingFiles = [];
for (const file of files) {
  if (!(await exists(file))) missingFiles.push(file);
}

const rows: AuditRow[] = [
  {
    requirement: "Runnable local demo with blocked and approved paths",
    status: approved?.status === "completed" && blocked?.status === "blocked" ? "done" : "missing",
    evidence: `approved: ${receiptEvidence(approved)} | blocked: ${receiptEvidence(blocked)}`,
    next: approved && blocked ? "Keep receipts current with npm run smoke before recording." : "Run npm run smoke and fix receipt generation."
  },
  {
    requirement: "Cobo policy is central and visible",
    status:
      approved?.wallet_policy.result === "approved" &&
      blocked?.wallet_policy.result === "blocked" &&
      approved.payment.operation_id &&
      approved.payment.payment_reference
        ? "demo-ready"
        : "missing",
    evidence: approved ? `policy=${approved.wallet_policy.policyId}; proof=${approved.payment.proof_type}; operation=${approved.payment.operation_id}` : "approved receipt missing",
    next:
      process.env.COBO_API_KEY && process.env.COBO_WALLET_ID
        ? "Capture live operation screenshot/record."
        : "Set live Cobo credentials, enable COBO_ADAPTER_MODE=live, rerun approved path."
  },
  {
    requirement: "Live Cobo Agentic Wallet credential/proof gate",
    status:
      process.env.COBO_ADAPTER_MODE === "live" &&
      coboApiKey &&
      coboWalletId &&
      process.env.COBO_WALLET_ADDRESS &&
      process.env.COBO_WALLET_ADDRESS !== demoWalletAddress
        ? "done"
        : "missing",
    evidence:
      coboApiKey && coboWalletId
        ? `adapter=${process.env.COBO_ADAPTER_MODE || "demo"}; CAW key/wallet present; wallet=${process.env.COBO_WALLET_ADDRESS || "missing"}`
        : "CAW API key/wallet ID not present in environment",
    next: "Set COBO_ADAPTER_MODE=live, populate CAW env vars, run live gate, and attach pact/operation record."
  },
  {
    requirement: "Live GLM/Z.AI primary provider proof",
    status: approved && !approved.provider_invoice.simulated && process.env.ZAI_API_KEY ? "done" : "missing",
    evidence: approved ? `triage=${approved.broker_decision.triage_source}; provider_request=${approved.provider_invoice.provider_request_id}; simulated=${approved.provider_invoice.simulated}` : "approved receipt missing",
    next: "Set ZAI_API_KEY, confirm ZAI_MODEL, rerun npm run demo:approved, and verify provider_invoice.simulated is false."
  },
  {
    requirement: "Submission documents and security packet",
    status: missingFiles.length === 0 ? "done" : "missing",
    evidence: missingFiles.length === 0 ? `${files.length} required local artifacts present` : `missing: ${missingFiles.join(", ")}`,
    next: missingFiles.length === 0 ? "Keep docs synchronized with final evidence." : "Create missing required artifacts."
  },
  {
    requirement: "Public repo secret hygiene",
    status: secretScan.includes("Status: **PASS**") ? "done" : "missing",
    evidence: secretScan.includes("Status: **PASS**") ? "docs/SECRET_SCAN.md reports PASS." : "secret scan report missing or failing",
    next: "Run npm run secret:scan and clear findings before publishing the repository."
  },
  {
    requirement: "Flow screenshots captured",
    status: (await exists("docs/screenshots/blocked.png")) && (await exists("docs/screenshots/approved.png")) ? "done" : "missing",
    evidence:
      (await exists("docs/screenshots/blocked.png")) && (await exists("docs/screenshots/approved.png"))
        ? "docs/screenshots/blocked.png and docs/screenshots/approved.png"
        : "one or both screenshot files are missing",
    next: "Run npm run capture:screenshots after npm run smoke."
  },
  {
    requirement: "Application form fields prepared",
    status: packetTodos === 0 ? "done" : "missing",
    evidence: packetTodos === 0 ? "docs/APPLICATION_PACKET.md has no TODO fields." : `${packetTodos} TODO fields remain in docs/APPLICATION_PACKET.md`,
    next: "Set submission env vars, rerun npm run packet:application, and use docs/APPLICATION_PACKET.md for the form."
  },
  {
    requirement: "Demo video script ready",
    status: (await exists("docs/DEMO_VIDEO_SCRIPT.md")) ? "done" : "missing",
    evidence: "docs/DEMO_VIDEO_SCRIPT.md",
    next: "Record 3-5 minute video with blocked Cobo policy in the first 30 seconds."
  }
];

const table = rows
  .map((row) => `| ${statusIcon(row.status)} | ${row.requirement} | ${row.evidence.replace(/\|/g, "\\|")} | ${row.next.replace(/\|/g, "\\|")} |`)
  .join("\n");

const remaining = rows.filter((row) => row.status === "missing");
const report = `# Submission Readiness Audit

Generated from the current repo, receipts, and environment.

| Status | Requirement | Evidence | Next action |
| --- | --- | --- | --- |
${table}

## Current Verdict

${remaining.length === 0 ? "All tracked submission gates are satisfied." : `${remaining.length} tracked submission gates still need evidence before final application submission.`}

## Strict Final Gate

Run this before submitting:

\`\`\`bash
npm run submit:final
\`\`\`

Strict verification intentionally fails on demo-mode Cobo/Z.AI proof, blank application fields, or simulated primary-provider receipts. The final pipeline continues after failures so the summary shows every remaining blocker.
`;

await writeFile("docs/SUBMISSION_READINESS.md", report, "utf8");
console.log("Wrote docs/SUBMISSION_READINESS.md");
