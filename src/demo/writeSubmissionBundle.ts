import { copyFile, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { submissionArtifacts } from "./submissionArtifacts.js";

const bundleRoot = "submission/bundle";
const filesRoot = join(bundleRoot, "files");
const generatedAt = new Date().toISOString();
const submitArtifacts = submissionArtifacts.filter((artifact) => artifact.submit);

type BundleFile = {
  source: string;
  bundledPath: string;
  purpose: string;
  bytes: number;
  updatedAt: string;
};

await rm(bundleRoot, { recursive: true, force: true });
await mkdir(filesRoot, { recursive: true });

const bundled: BundleFile[] = [];
const missing: string[] = [];

for (const artifact of submitArtifacts) {
  const target = join(filesRoot, artifact.path);
  try {
    const details = await stat(artifact.path);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(artifact.path, target);
    bundled.push({
      source: artifact.path,
      bundledPath: target,
      purpose: artifact.purpose,
      bytes: details.size,
      updatedAt: details.mtime.toISOString()
    });
  } catch {
    missing.push(artifact.path);
  }
}

const table = bundled
  .map((file) => `| \`${file.source}\` | \`${file.bundledPath}\` | ${file.bytes} | ${file.purpose.replace(/\|/g, "\\|")} |`)
  .join("\n");

const readme = `# CoboRouter Submission Bundle

Generated at: ${generatedAt}

This directory contains the judge-facing files from the current local evidence pack. Files are copied under \`files/\` with their original paths preserved.

## Contents

| Source | Bundle Path | Bytes | Purpose |
| --- | --- | ---: | --- |
${table}

## Missing Files

${missing.length === 0 ? "- None." : missing.map((path) => `- \`${path}\``).join("\n")}

## Before Uploading Or Linking

- Confirm \`files/docs/APPLICATION_PACKET.md\` has no \`TODO:\` markers.
- Confirm \`files/receipts/coborouter_demo_approved_001.json\` contains live Cobo/Z.AI proof for final submission.
- Use \`files/docs/FINAL_SUBMISSION_RUNBOOK.md\` for the final checklist.
`;

await writeFile(join(bundleRoot, "README.md"), readme, "utf8");
await writeFile(
  join(bundleRoot, "bundle-manifest.json"),
  JSON.stringify({ generatedAt, files: bundled, missing }, null, 2),
  "utf8"
);

if (missing.length > 0) {
  console.error(`Submission bundle missing ${missing.length} file(s): ${missing.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`Wrote ${join(bundleRoot, "README.md")}`);
  console.log(`Wrote ${join(bundleRoot, "bundle-manifest.json")}`);
  console.log(`Copied ${bundled.length} submit artifacts to ${filesRoot}`);
}
