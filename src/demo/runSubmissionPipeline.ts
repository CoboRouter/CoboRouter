import { spawn } from "node:child_process";

type Stage = {
  name: string;
  script: string;
};

const mode = process.argv[2] === "final" ? "final" : "prep";

const prepStages: Stage[] = [
  { name: "TypeScript check", script: "check" },
  { name: "Secret scan", script: "secret:scan" },
  { name: "Blocked and approved demo receipts", script: "smoke" },
  { name: "Flow screenshots", script: "capture:screenshots" },
  { name: "Evidence report", script: "evidence" },
  { name: "Application packet", script: "packet:application" },
  { name: "Submission readiness audit", script: "audit:submission" },
  { name: "Final env template", script: "env:final-template" },
  { name: "Final blocker report", script: "blockers:final" },
  { name: "Artifact index", script: "artifact:index" },
  { name: "Submission bundle", script: "bundle:submission" },
  { name: "Submission archive", script: "bundle:archive" },
  { name: "Local submission verifier", script: "verify:submission" }
];

const finalStages: Stage[] = [
  { name: "TypeScript check", script: "check" },
  { name: "Secret scan", script: "secret:scan" },
  { name: "Strict live Cobo/Z.AI gate", script: "check:live:strict" },
  { name: "Blocked and approved demo receipts", script: "smoke" },
  { name: "Flow screenshots", script: "capture:screenshots" },
  { name: "Evidence report", script: "evidence" },
  { name: "Application packet", script: "packet:application" },
  { name: "Submission readiness audit", script: "audit:submission" },
  { name: "Final env template", script: "env:final-template" },
  { name: "Final blocker report", script: "blockers:final" },
  { name: "Artifact index", script: "artifact:index" },
  { name: "Submission bundle", script: "bundle:submission" },
  { name: "Submission archive", script: "bundle:archive" },
  { name: "Strict submission verifier", script: "verify:submission:strict" }
];

const stages = mode === "final" ? finalStages : prepStages;

function runStage(stage: Stage): Promise<number> {
  return new Promise((resolve) => {
    console.log(`\n=== ${stage.name} (${stage.script}) ===`);
    const child = spawn("npm", ["run", stage.script], {
      stdio: "inherit",
      shell: process.platform === "win32"
    });

    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", (error) => {
      console.error(`Failed to start ${stage.script}: ${error.message}`);
      resolve(1);
    });
  });
}

const results: Array<Stage & { code: number }> = [];

for (const stage of stages) {
  const code = await runStage(stage);
  results.push({ ...stage, code });
}

const failed = results.filter((result) => result.code !== 0);

console.log(`\n=== ${mode === "final" ? "Final Submission" : "Submission Prep"} Summary ===`);
for (const result of results) {
  const status = result.code === 0 ? "PASS" : "FAIL";
  console.log(`${status} ${result.name}: npm run ${result.script}`);
}

if (failed.length > 0) {
  console.log(`\n${failed.length} gate(s) failed. Use the failed stage output above as the remaining blocker list.`);
  process.exitCode = 1;
} else {
  console.log("\nAll gates passed.");
}
