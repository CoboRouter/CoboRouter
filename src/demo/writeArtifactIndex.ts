import { mkdir, stat, writeFile } from "node:fs/promises";
import { submissionArtifacts, type SubmissionArtifact } from "./submissionArtifacts.js";

async function artifactRow(artifact: SubmissionArtifact) {
  try {
    const details = await stat(artifact.path);
    return {
      ...artifact,
      exists: true,
      bytes: details.size,
      updatedAt: details.mtime.toISOString()
    };
  } catch {
    return {
      ...artifact,
      exists: false,
      bytes: 0,
      updatedAt: null
    };
  }
}

const generatedAt = new Date().toISOString();

function renderIndex(rows: Awaited<ReturnType<typeof artifactRow>>[]): string {
  const missing = rows.filter((row) => !row.exists);
  const table = rows
    .map((row) => {
      const status = row.exists ? "READY" : "MISSING";
      const submit = row.submit ? "yes" : "supporting";
      const size = row.exists ? `${row.bytes}` : "n/a";
      const updated = row.updatedAt || "n/a";
      return `| ${status} | \`${row.path}\` | ${submit} | ${size} | ${updated} | ${row.purpose.replace(/\|/g, "\\|")} |`;
    })
    .join("\n");

  return `# Artifact Index — CoboRouter

Generated at: ${generatedAt}

Use this as the quick map from hackathon submission requirement to local evidence file.

## Submission Bundle

Prioritize files marked \`yes\` in the Submit column when linking or attaching evidence.

| Status | Artifact | Submit | Bytes | Updated At | Purpose |
| --- | --- | --- | ---: | --- | --- |
${table}

## Current Missing Artifacts

${missing.length === 0 ? "- None." : missing.map((row) => `- \`${row.path}\``).join("\n")}

## Regenerate

\`\`\`bash
npm run submit:prep
\`\`\`

For final submission with live Cobo/Z.AI proof:

\`\`\`bash
npm run submit:final
\`\`\`
`;
}

await mkdir("submission", { recursive: true });
await writeFile("docs/ARTIFACT_INDEX.md", renderIndex(await Promise.all(submissionArtifacts.map(artifactRow))), "utf8");

const rows = await Promise.all(submissionArtifacts.map(artifactRow));
await writeFile("docs/ARTIFACT_INDEX.md", renderIndex(rows), "utf8");
await writeFile(
  "submission/artifact-manifest.json",
  JSON.stringify({ generatedAt, artifacts: rows }, null, 2),
  "utf8"
);

console.log("Wrote docs/ARTIFACT_INDEX.md");
console.log("Wrote submission/artifact-manifest.json");
