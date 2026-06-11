import { demoRequest, routeInference } from "../broker/routeInference.js";
import { loadEnv } from "../config/env.js";

await loadEnv();
const allowedScenarios = [
  "approved",
  "blocked",
  "budget_declined",
  "local",
  "simple_zai",
  "provider_not_allowlisted",
  "human_approval",
  "settlement_failure"
] as const;
const arg = process.argv[2] || "approved";
const scenario = allowedScenarios.includes(arg as (typeof allowedScenarios)[number]) ? (arg as (typeof allowedScenarios)[number]) : "approved";
const response = await routeInference(demoRequest(scenario));

console.log(JSON.stringify(response, null, 2));
console.log(`\nReceipt written to ${response.receipt.receipt_path}`);
