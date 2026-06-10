import { sha256 } from "../utils/hash.js";

export function policyHash(policyId: string, dailyCapUsd: number, approvalThresholdUsd: number, allowedProviders: string[]): string {
  return sha256(JSON.stringify({ policyId, dailyCapUsd, approvalThresholdUsd, allowedProviders: [...allowedProviders].sort() }));
}
