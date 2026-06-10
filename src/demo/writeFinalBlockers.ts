import { readFile, writeFile } from "node:fs/promises";
import type { RouteInferenceResponse } from "../types.js";
import { loadEnv } from "../config/env.js";
import { finalEnvTemplate } from "./finalEnvTemplate.js";

type Blocker = {
  category: "live-proof" | "application" | "receipt";
  name: string;
  evidence: string;
  fix: string;
};

const demoWalletAddress = "0xC0B0000000000000000000000000000000000000";

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

function envPresent(...names: string[]): boolean {
  return names.some((name) => Boolean(process.env[name]));
}

function addIf(condition: boolean, blockers: Blocker[], blocker: Blocker): void {
  if (condition) blockers.push(blocker);
}

await loadEnv();

const approved = await readReceipt("receipts/coborouter_demo_approved_001.json");
const blocked = await readReceipt("receipts/coborouter_demo_blocked_001.json");
const packet = await readText("docs/APPLICATION_PACKET.md");
const packetTodoLines = packet
  .split(/\r?\n/)
  .filter((line) => line.includes("TODO:"))
  .map((line) => line.replace(/\*\*/g, "").trim());

const blockers: Blocker[] = [];

addIf(!approved || approved.status !== "completed", blockers, {
  category: "receipt",
  name: "Approved receipt missing or incomplete",
  evidence: approved ? `approved status=${approved.status}` : "receipts/coborouter_demo_approved_001.json missing or invalid",
  fix: "Run npm run demo:approved and confirm the approved receipt is completed."
});

addIf(!blocked || blocked.status !== "blocked", blockers, {
  category: "receipt",
  name: "Blocked receipt missing or incomplete",
  evidence: blocked ? `blocked status=${blocked.status}` : "receipts/coborouter_demo_blocked_001.json missing or invalid",
  fix: "Run npm run demo:blocked and confirm the blocked receipt has payment.status=not_created."
});

addIf(process.env.COBO_ADAPTER_MODE !== "live", blockers, {
  category: "live-proof",
  name: "Cobo adapter not in live mode",
  evidence: `COBO_ADAPTER_MODE=${process.env.COBO_ADAPTER_MODE || "unset"}`,
  fix: "Set COBO_ADAPTER_MODE=live before the final proof run."
});

addIf(!envPresent("AGENT_WALLET_API_KEY", "COBO_API_KEY"), blockers, {
  category: "live-proof",
  name: "Cobo API key missing",
  evidence: "AGENT_WALLET_API_KEY/COBO_API_KEY unset",
  fix: "Set AGENT_WALLET_API_KEY or COBO_API_KEY in .env."
});

addIf(!envPresent("AGENT_WALLET_WALLET_ID", "COBO_WALLET_ID"), blockers, {
  category: "live-proof",
  name: "Cobo wallet ID missing",
  evidence: "AGENT_WALLET_WALLET_ID/COBO_WALLET_ID unset",
  fix: "Set AGENT_WALLET_WALLET_ID or COBO_WALLET_ID in .env."
});

addIf(!process.env.COBO_POLICY_ID || process.env.COBO_POLICY_ID === "cobo_policy_demo", blockers, {
  category: "live-proof",
  name: "Live Cobo policy ID missing",
  evidence: `COBO_POLICY_ID=${process.env.COBO_POLICY_ID || "unset"}`,
  fix: "Set COBO_POLICY_ID to the live Agentic Wallet policy/pact ID used for the demo."
});

addIf(!process.env.COBO_WALLET_ADDRESS || process.env.COBO_WALLET_ADDRESS === demoWalletAddress, blockers, {
  category: "live-proof",
  name: "Live Cobo wallet reference missing",
  evidence: `COBO_WALLET_ADDRESS=${process.env.COBO_WALLET_ADDRESS || "unset"}`,
  fix: "Set COBO_WALLET_ADDRESS or include the live wallet ID/address in the application packet."
});

addIf(process.env.COBO_PROOF_TYPE !== "on_chain" && process.env.COBO_PROOF_TYPE !== "cobo_operation", blockers, {
  category: "live-proof",
  name: "Cobo proof type missing",
  evidence: `COBO_PROOF_TYPE=${process.env.COBO_PROOF_TYPE || "unset"}`,
  fix: "Set COBO_PROOF_TYPE=cobo_operation, or on_chain if tx hash/explorer evidence is available."
});

addIf(process.env.COBO_SETTLEMENT_MODE !== "transfer" && !process.env.COBO_LIVE_PACT_ID, blockers, {
  category: "live-proof",
  name: "Cobo settlement or preapproved pact missing",
  evidence: `COBO_SETTLEMENT_MODE=${process.env.COBO_SETTLEMENT_MODE || "unset"}; COBO_LIVE_PACT_ID=${process.env.COBO_LIVE_PACT_ID ? "set" : "unset"}`,
  fix: "Configure COBO_SETTLEMENT_MODE=transfer with provider settlement details, or set COBO_LIVE_PACT_ID/COBO_LIVE_PACT_API_KEY for a preapproved pact."
});

addIf(!process.env.ZAI_API_KEY, blockers, {
  category: "live-proof",
  name: "Z.AI API key missing",
  evidence: "ZAI_API_KEY unset; receipts use cached GLM/Z.AI triage and simulated provider invoice",
  fix: "Set ZAI_API_KEY, rerun npm run demo:approved, and confirm provider_invoice.simulated=false."
});

addIf(Boolean(approved?.provider_invoice.simulated), blockers, {
  category: "live-proof",
  name: "Approved receipt uses simulated provider invoice",
  evidence: `provider_invoice.simulated=${approved?.provider_invoice.simulated}`,
  fix: "Rerun the approved path with live Z.AI credentials."
});

addIf(Boolean(approved && (approved.wallet_policy.walletAddress === demoWalletAddress || approved.wallet_policy.policyId === "cobo_policy_demo")), blockers, {
  category: "live-proof",
  name: "Approved receipt uses demo Cobo wallet/policy",
  evidence: approved ? `wallet=${approved.wallet_policy.walletAddress}; policy=${approved.wallet_policy.policyId}` : "approved receipt missing",
  fix: "Rerun the approved path with live Cobo Agentic Wallet credentials and policy."
});

for (const line of packetTodoLines) {
  blockers.push({
    category: "application",
    name: "Application packet TODO",
    evidence: line,
    fix: "Set the matching SUBMISSION_* or live Cobo env var, then run npm run packet:application."
  });
}

const grouped = ["live-proof", "application", "receipt"] as const;
const sections = grouped
  .map((category) => {
    const items = blockers.filter((blocker) => blocker.category === category);
    if (items.length === 0) return `## ${category}\n\n- None.`;
    return `## ${category}\n\n${items
      .map(
        (blocker, index) => `${index + 1}. **${blocker.name}**\n   - Evidence: ${blocker.evidence}\n   - Fix: ${blocker.fix}`
      )
      .join("\n")}`;
  })
  .join("\n\n");

const report = `# Final Blockers — CoboRouter

Generated at: ${new Date().toISOString()}

This report is generated from the current environment, receipts, and application packet. It is the current punch list for turning the local demo pack into a final Cobo Track submission.

Total blockers: ${blockers.length}

${sections}

## Minimum Env Template

\`\`\`text
${finalEnvTemplate.trim()}
\`\`\`

Editable file: \`submission/final-env-template.env\`

## Final Verification Command

\`\`\`bash
npm run submit:final
\`\`\`
`;

await writeFile("submission/FINAL_BLOCKERS.md", report, "utf8");
console.log("Wrote submission/FINAL_BLOCKERS.md");
console.log(`Final blocker count: ${blockers.length}`);
