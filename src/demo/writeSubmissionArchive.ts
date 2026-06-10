import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";

const archivePath = "submission/coborouter-submission-bundle.tgz";
const metadataPath = "submission/bundle-archive.json";

function runTar(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("tar", ["-czf", "coborouter-submission-bundle.tgz", "bundle"], {
      cwd: "submission",
      stdio: "inherit"
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`tar exited with code ${code ?? "unknown"}`));
      }
    });
    child.on("error", reject);
  });
}

await runTar();

const data = await readFile(archivePath);
const details = await stat(archivePath);
const metadata = {
  generatedAt: new Date().toISOString(),
  archivePath,
  bytes: details.size,
  sha256: createHash("sha256").update(data).digest("hex"),
  sourceDirectory: "submission/bundle"
};

await writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf8");

console.log(`Wrote ${archivePath}`);
console.log(`Wrote ${metadataPath}`);
console.log(`Archive sha256=${metadata.sha256}`);
