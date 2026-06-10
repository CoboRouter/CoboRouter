export type SubmissionArtifact = {
  path: string;
  purpose: string;
  submit: boolean;
};

export const submissionArtifacts: SubmissionArtifact[] = [
  { path: "README.md", purpose: "Main judge-facing project overview and run instructions.", submit: true },
  { path: "SPEC.md", purpose: "Implementation-ready product and technical specification.", submit: false },
  { path: "IMPLEMENTATION_PLAN.md", purpose: "Hackathon execution plan and deadline checklist.", submit: false },
  { path: ".github/workflows/verify.yml", purpose: "GitHub Actions local-demo verification workflow for reviewers.", submit: true },
  { path: "docs/APPLICATION_PACKET.md", purpose: "Copy-paste application form answers generated from current env and receipts.", submit: true },
  { path: "docs/PROJECT_PROPOSAL.md", purpose: "Problem, solution, users, implementation, completion, and follow-up plan.", submit: true },
  { path: "docs/SECURITY_BOUNDARIES.md", purpose: "Wallet, spend, provider, approval, and failure-handling boundaries.", submit: true },
  { path: "docs/LIVE_INTEGRATION.md", purpose: "Live Cobo Agentic Wallet and Z.AI credential/proof gate notes.", submit: true },
  { path: "docs/LIVE_PROOF_CAPTURE_CHECKLIST.md", purpose: "Final live Cobo/Z.AI proof capture checklist.", submit: true },
  { path: "docs/DEMO_VIDEO_SCRIPT.md", purpose: "3-5 minute recording script with blocked Cobo policy first.", submit: true },
  { path: "docs/REPO_PUBLICATION_CHECKLIST.md", purpose: "Public GitHub repo publishing and secret-safety checklist.", submit: true },
  { path: "docs/SECRET_SCAN.md", purpose: "Generated public-artifact credential scan report.", submit: true },
  { path: "docs/FINAL_SUBMISSION_RUNBOOK.md", purpose: "Submission-day operating checklist.", submit: true },
  { path: "docs/ARTIFACT_INDEX.md", purpose: "Generated map of judge-facing artifacts and supporting evidence.", submit: true },
  { path: "docs/SUBMISSION_READINESS.md", purpose: "Generated requirement-by-requirement readiness audit.", submit: true },
  { path: "docs/EVIDENCE_REPORT.md", purpose: "Generated receipt and route-trace evidence summary.", submit: true },
  { path: "submission/FINAL_BLOCKERS.md", purpose: "Generated final proof and application blocker punch list.", submit: true },
  { path: "submission/final-env-template.env", purpose: "Fill-in template for the final live Cobo/Z.AI submission run.", submit: true },
  { path: "docs/screenshots/blocked.png", purpose: "Blocked spend path screenshot.", submit: true },
  { path: "docs/screenshots/approved.png", purpose: "Approved spend and receipt screenshot.", submit: true },
  { path: "receipts/coborouter_demo_blocked_001.json", purpose: "Blocked-path receipt proving no spend/inference occurred.", submit: true },
  { path: "receipts/coborouter_demo_approved_001.json", purpose: "Approved-path receipt with route, wallet policy, operation, and answer.", submit: true },
  { path: "logs/demo-run.jsonl", purpose: "Append-only local demo event log.", submit: false },
  { path: "src/wallet/coboAdapter.ts", purpose: "Cobo Agentic Wallet policy/payment adapter boundary.", submit: true },
  { path: "src/broker/routeInference.ts", purpose: "End-to-end route_inference orchestration.", submit: true },
  { path: "src/broker/toolSchema.ts", purpose: "Tool schema exposed by the demo API.", submit: true },
  { path: "src/triage/zaiTriage.ts", purpose: "GLM/Z.AI triage and cached fallback boundary.", submit: true },
  { path: "src/inference/inferenceAdapter.ts", purpose: "Inference execution adapter and provider invoice boundary.", submit: true }
];
