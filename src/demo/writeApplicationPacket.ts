import { readFile, writeFile } from "node:fs/promises";
import type { RouteInferenceResponse } from "../types.js";
import { loadEnv } from "../config/env.js";

type PacketField = {
  label: string;
  value: string;
  required: boolean;
};

const demoWalletAddress = "0xC0B0000000000000000000000000000000000000";

async function readReceipt(path: string): Promise<RouteInferenceResponse | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as RouteInferenceResponse;
  } catch {
    return null;
  }
}

function env(name: string): string {
  return process.env[name] || "";
}

function firstValue(...values: Array<string | null | undefined>): string {
  return values.find((value) => value && value.trim().length > 0)?.trim() || "";
}

function todo(label: string): string {
  return `TODO: ${label}`;
}

function field(label: string, value: string, required = true): PacketField {
  return {
    label,
    value: value || (required ? todo(label) : "Not hosted; local demo runs with `npm run dev`."),
    required
  };
}

function isMissing(field: PacketField): boolean {
  return field.required && field.value.startsWith("TODO:");
}

function receiptLine(receipt: RouteInferenceResponse | null): string {
  if (!receipt) return "TODO: rerun npm run smoke";
  return `${receipt.receipt.receipt_path} (${receipt.status}, quote ${receipt.receipt.quote_id})`;
}

function proofLine(receipt: RouteInferenceResponse | null): string {
  if (!receipt) return "TODO: rerun npm run smoke";
  const liveCobo = receipt.wallet_policy.walletAddress !== demoWalletAddress && receipt.wallet_policy.policyId !== "cobo_policy_demo";
  const proof = [
    `proof_type=${receipt.payment.proof_type}`,
    `operation_id=${receipt.payment.operation_id || "none"}`,
    `payment_reference=${receipt.payment.payment_reference || "none"}`,
    receipt.payment.tx_hash ? `tx_hash=${receipt.payment.tx_hash}` : null,
    receipt.payment.explorer_url ? `explorer_url=${receipt.payment.explorer_url}` : null
  ]
    .filter(Boolean)
    .join("; ");

  return liveCobo ? proof : `DEMO-MODE: ${proof}. Replace with live CAW operation before final submission.`;
}

function walletLine(receipt: RouteInferenceResponse | null): string {
  const wallet = firstValue(env("COBO_WALLET_ADDRESS"), receipt?.wallet_policy.walletAddress);
  if (!wallet || wallet === demoWalletAddress) {
    return "TODO: live Agent Wallet address / wallet ID";
  }
  return wallet;
}

function policyLine(receipt: RouteInferenceResponse | null): string {
  const policyId = firstValue(env("COBO_POLICY_ID"), receipt?.wallet_policy.policyId);
  const policyHash = receipt?.wallet_policy.policyHash;
  if (!policyId || policyId === "cobo_policy_demo") {
    return "TODO: live policy ID / policy hash";
  }
  return `${policyId}${policyHash ? ` / ${policyHash}` : ""}`;
}

await loadEnv();

const approved = await readReceipt("receipts/coborouter_demo_approved_001.json");
const blocked = await readReceipt("receipts/coborouter_demo_blocked_001.json");

const fields: PacketField[] = [
  field("Project name", "CoboRouter"),
  field(
    "One-line introduction",
    "Agents ask for outcomes, not models; CoboRouter procures inference through a policy-bound Cobo Agentic Wallet and returns an answer with routing, cost, wallet-policy, and payment proof."
  ),
  field("Track", "Cobo Track - Agentic Economy x Cobo Agentic Wallet"),
  field("GitHub repo", env("SUBMISSION_REPO_URL")),
  field("Demo video", env("SUBMISSION_DEMO_VIDEO_URL")),
  field("Demo link", env("SUBMISSION_DEMO_URL"), false),
  field("Blocked path screenshot", "docs/screenshots/blocked.png"),
  field("Approved path screenshot", "docs/screenshots/approved.png"),
  field("Approved receipt", receiptLine(approved)),
  field("Blocked receipt", receiptLine(blocked)),
  field("Cobo operation proof", proofLine(approved)),
  field("Agent wallet address / wallet ID", walletLine(approved)),
  field("Policy ID / hash", policyLine(approved)),
  field("Transaction hash / explorer URL", firstValue(approved?.payment.explorer_url, approved?.payment.tx_hash, "Not available; proof type is Cobo operation proof."), false),
  field("Team member", env("SUBMISSION_TEAM_MEMBER")),
  field("Team role", env("SUBMISSION_TEAM_ROLE")),
  field("Contact", env("SUBMISSION_CONTACT")),
  field("Prize wallet address", env("SUBMISSION_PRIZE_WALLET"))
];

const missing = fields.filter(isMissing);
const approvedLiveProvider = approved ? !approved.provider_invoice.simulated : false;
const approvedLiveCobo = approved ? approved.wallet_policy.walletAddress !== demoWalletAddress && approved.wallet_policy.policyId !== "cobo_policy_demo" : false;

const report = `# Application Packet — CoboRouter

Generated from current receipts and environment variables.

## Official Submission Context

- Hackathon: AI x Web3 Agentic Builders Hackathon.
- Track: Cobo Track - Agentic Economy x Cobo Agentic Wallet.
- Deadline: June 13, 2026, 12:00 UTC+8.
- Application form: https://docs.google.com/forms/d/e/1FAIpQLSdPXXZBoos9CsP2vA_rmD6blm7a-cvAsJ6XdVvLCjepY0sNrg/viewform
- Final runbook: docs/FINAL_SUBMISSION_RUNBOOK.md

## Copy-Paste Fields

${fields.map((item) => `**${item.label}:** ${item.value}`).join("\n\n")}

## Problem

Autonomous agents need paid compute, models, APIs, and data, but most demos still hardcode providers or rely on human-owned API keys. Agents need a wallet-native way to procure resources within explicit spend and permission boundaries.

## Solution

CoboRouter lets an agent submit a task and budget. The broker triages required capabilities, compares provider quotes, asks Cobo Agentic Wallet policy to approve or block spend, executes inference through an approved provider, and returns a receipt tying together the prompt hash, route, wallet decision, payment proof, and final answer.

## Core Demo Flow

The demo opens with an attempted overspend that Cobo policy blocks. It then re-runs with an approved cap, shows GLM/Z.AI triage, quote comparison, Cobo approval/payment proof, model output, and final receipt.

## APIs / SDKs / AI Tools Used

- Cobo Agentic Wallet via \`@cobo/agentic-wallet\` live adapter and Cobo-compatible demo adapter.
- Z.AI / GLM chat completions for live triage/inference when \`ZAI_API_KEY\` is present.
- Cached GLM/Z.AI triage fixtures for reliable stage rehearsal.
- Node.js / TypeScript demo app.

## Completion Status

- Local runnable blocked path: ${blocked?.status === "blocked" ? "ready" : "missing"}
- Local runnable approved path: ${approved?.status === "completed" ? "ready" : "missing"}
- Screenshots: docs/screenshots/blocked.png and docs/screenshots/approved.png
- Live Cobo proof: ${approvedLiveCobo ? "present" : "missing"}
- Live Z.AI provider proof: ${approvedLiveProvider ? "present" : "missing"}
- Blank required application fields: ${missing.length}

## Missing Before Final Submit

${missing.length === 0 ? "- None from generated packet fields." : missing.map((item) => `- ${item.label}`).join("\n")}

${approvedLiveCobo ? "" : "- Replace demo Cobo receipt with live CAW pact/operation or transfer settlement proof."}
${approvedLiveProvider ? "" : "- Rerun approved path with \`ZAI_API_KEY\` so provider proof is not simulated."}

## Final Commands

\`\`\`bash
npm run submit:final
\`\`\`
`;

await writeFile("docs/APPLICATION_PACKET.md", report, "utf8");
console.log("Wrote docs/APPLICATION_PACKET.md");
