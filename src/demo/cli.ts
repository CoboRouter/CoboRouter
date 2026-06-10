import { demoRequest, routeInference } from "../broker/routeInference.js";
import { loadEnv } from "../config/env.js";

await loadEnv();
const scenario = process.argv[2] === "blocked" ? "blocked" : "approved";
const response = await routeInference(demoRequest(scenario));

console.log(JSON.stringify(response, null, 2));
console.log(`\nReceipt written to ${response.receipt.receipt_path}`);
