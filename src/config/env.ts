import { readFile } from "node:fs/promises";

export async function loadEnv(path = ".env"): Promise<void> {
  try {
    const content = await readFile(path, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const equals = trimmed.indexOf("=");
      if (equals === -1) {
        continue;
      }
      const key = trimmed.slice(0, equals).trim();
      const value = trimmed.slice(equals + 1).trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env is optional; the demo runs with cached triage and demo wallet policy.
  }
}
