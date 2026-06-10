import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";

type Finding = {
  path: string;
  line: number;
  key: string;
  reason: string;
};

const ignoredDirectories = new Set([".git", "node_modules", ".omc", ".omx", "dist"]);
const ignoredPaths = [/^submission\/bundle\//, /^logs\//];
const ignoredExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".tgz", ".zip", ".gz", ".pdf"]);
const scannedExtensions = new Set(["", ".env", ".example", ".json", ".js", ".jsx", ".md", ".mjs", ".ts", ".tsx", ".txt", ".yaml", ".yml"]);

const secretAssignmentPattern =
  /^\s*(?:export\s+)?([A-Z0-9_]*(?:API_KEY|PRIVATE_KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|PACT_API_KEY)[A-Z0-9_]*)\s*=\s*(.+?)\s*$/i;
const jsonSecretPattern =
  /^\s*"([^"]*(?:apiKey|api_key|privateKey|private_key|secret|token|password|credential)[^"]*)"\s*:\s*"([^"]+)"/i;
const tokenPatterns: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/, reason: "OpenAI-style API key" },
  { pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/, reason: "GitHub token" },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/, reason: "AWS access key" },
  { pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/, reason: "Slack token" }
];

function normalizePath(path: string): string {
  return path.replace(/^\.\//, "").replaceAll("\\", "/");
}

function isIgnoredPath(path: string): boolean {
  const normalized = normalizePath(path);
  if (normalized === ".env" || normalized.startsWith(".env.")) {
    return true;
  }
  return ignoredPaths.some((pattern) => pattern.test(normalized));
}

function shouldScanFile(path: string): boolean {
  const normalized = normalizePath(path);
  if (isIgnoredPath(normalized)) {
    return false;
  }
  const extension = extname(normalized);
  if (ignoredExtensions.has(extension)) {
    return false;
  }
  return scannedExtensions.has(extension);
}

function looksPlaceholder(value: string): boolean {
  const cleaned = value.trim().replace(/^["']|["']$/g, "");
  return (
    cleaned === "" ||
    cleaned === "TODO" ||
    cleaned.startsWith("TODO:") ||
    cleaned.includes("<") ||
    cleaned.includes("your_") ||
    cleaned.includes("example") ||
    cleaned.includes("placeholder") ||
    cleaned.includes("demo") ||
    cleaned === "ZAI_API_KEY" ||
    cleaned === "COBO_API_KEY" ||
    cleaned === "AGENT_WALLET_API_KEY"
  );
}

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      continue;
    }
    const path = join(directory, entry.name);
    const normalized = normalizePath(path);
    if (isIgnoredPath(normalized)) {
      continue;
    }
    if (entry.isDirectory()) {
      files.push(...(await walk(path)));
      continue;
    }
    if (entry.isFile() && shouldScanFile(normalized)) {
      const info = await stat(path);
      if (info.size <= 1_000_000) {
        files.push(normalized);
      }
    }
  }
  return files;
}

function scanContent(path: string, content: string): Finding[] {
  const findings: Finding[] = [];
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    const assignment = line.match(secretAssignmentPattern);
    if (assignment && !looksPlaceholder(assignment[2])) {
      findings.push({
        path,
        line: index + 1,
        key: assignment[1],
        reason: "non-empty sensitive environment assignment"
      });
    }

    const jsonSecret = line.match(jsonSecretPattern);
    if (jsonSecret && !looksPlaceholder(jsonSecret[2])) {
      findings.push({
        path,
        line: index + 1,
        key: jsonSecret[1],
        reason: "non-empty sensitive JSON value"
      });
    }

    for (const tokenPattern of tokenPatterns) {
      if (tokenPattern.pattern.test(line)) {
        findings.push({
          path,
          line: index + 1,
          key: "literal_token",
          reason: tokenPattern.reason
        });
      }
    }
  });
  return findings;
}

const files = await walk(".");
const findings: Finding[] = [];
for (const file of files) {
  const content = await readFile(file, "utf8");
  findings.push(...scanContent(file, content));
}

const reportPath = "docs/SECRET_SCAN.md";
const status = findings.length === 0 ? "PASS" : "FAIL";
const findingLines: string[] =
  findings.length === 0
    ? ["- No likely committed credential values found in public text artifacts."]
    : findings.map((finding) => `- ${finding.path}:${finding.line} — ${finding.key}: ${finding.reason}; value redacted.`);

const report = `# Secret Scan — CoboRouter

Status: **${status}**

Scope:

- Scans public text files in this workspace.
- Skips local-only ignored state such as \`.env\`, \`.omc/\`, \`.omx/\`, \`logs/\`, \`node_modules/\`, binary screenshots, and submission archives.
- Reports credential-looking values with the value redacted.

Findings:

${findingLines.join("\n")}
`;

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, report);

console.log(`Secret scan ${status.toLowerCase()}: ${findings.length} finding(s).`);
console.log(`Wrote ${reportPath}`);

if (findings.length > 0) {
  process.exitCode = 1;
}
