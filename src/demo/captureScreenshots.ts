import { mkdir, access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const port = Number(process.env.SCREENSHOT_PORT || 4183);
const baseUrl = `http://localhost:${port}`;
const chromeCandidates = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "google-chrome",
  "chromium",
  "chromium-browser"
].filter(Boolean) as string[];

async function canAccess(path: string): Promise<boolean> {
  if (!path.startsWith("/")) return true;
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findChrome(): Promise<string> {
  for (const candidate of chromeCandidates) {
    if (await canAccess(candidate)) return candidate;
  }
  throw new Error("Could not find Chrome/Chromium. Set CHROME_PATH to a headless-capable browser binary.");
}

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/tool-schema`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await sleep(250);
  }
  throw new Error(`Server did not become ready at ${baseUrl}`);
}

async function capture(chrome: string, scenario: "blocked" | "approved"): Promise<void> {
  const out = `docs/screenshots/${scenario}.png`;
  const url = `${baseUrl}/?scenario=${scenario}`;
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--hide-scrollbars",
    "--window-size=1440,1400",
    "--virtual-time-budget=5000",
    `--screenshot=${out}`,
    url
  ];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(chrome, args, { stdio: "pipe" });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Chrome screenshot failed with code ${code}: ${stderr}`));
    });
  });
}

await mkdir("docs/screenshots", { recursive: true });
const chrome = await findChrome();
const server = spawn("npm", ["run", "dev"], {
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});

try {
  await waitForServer();
  await capture(chrome, "blocked");
  await capture(chrome, "approved");
  console.log("Wrote docs/screenshots/blocked.png");
  console.log("Wrote docs/screenshots/approved.png");
} finally {
  server.kill("SIGTERM");
}
