import http from "node:http";
import { readFile } from "node:fs/promises";
import { demoRequest, routeInference } from "../broker/routeInference.js";
import { routeInferenceToolSchema } from "../broker/toolSchema.js";
import { loadEnv } from "../config/env.js";
import { timelineHtml } from "./timelineUi.js";
import type { RouteInferenceRequest } from "../types.js";

await loadEnv();
const port = Number(process.env.PORT || 4173);
const maxBodyChars = 128_000;
const maxPromptChars = 12_000;
const rateWindowMs = 60_000;
const maxRequestsPerWindow = 60;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
const idempotencyHashes = new Map<string, string>();
const apiKey = process.env.COBOROUTER_API_KEY;

function rateLimitKey(req: http.IncomingMessage): string {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "local").split(",")[0].trim();
}

function withinRateLimit(req: http.IncomingMessage): boolean {
  const now = Date.now();
  const key = rateLimitKey(req);
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + rateWindowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= maxRequestsPerWindow;
}

function isAuthorized(req: http.IncomingMessage): boolean {
  if (!apiKey) return true;
  const bearer = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const headerKey = String(req.headers["x-coborouter-api-key"] || "");
  return bearer === apiKey || headerKey === apiKey;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > maxBodyChars) {
        reject(new Error("request_body_too_large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(timelineHtml());
      return;
    }

    if ((req.method === "GET" || req.method === "HEAD") && (url.pathname === "/favicon.svg" || url.pathname === "/favicon.ico")) {
      const icon = await readFile("docs/brand/coborouter-icon.svg", "utf8");
      res.writeHead(200, { "content-type": "image/svg+xml; charset=utf-8" });
      res.end(req.method === "HEAD" ? undefined : icon);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/tool-schema") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(routeInferenceToolSchema, null, 2));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/route-inference") {
      if (!isAuthorized(req)) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized", detail: "set a valid bearer token or x-coborouter-api-key" }));
        return;
      }

      if (!withinRateLimit(req)) {
        res.writeHead(429, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "rate_limited", detail: `limit ${maxRequestsPerWindow} requests per minute` }));
        return;
      }

      const body = JSON.parse(await readBody(req)) as RouteInferenceRequest;
      if (typeof body.prompt !== "string" || body.prompt.length === 0 || body.prompt.length > maxPromptChars) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_prompt", detail: `prompt must be 1-${maxPromptChars} characters` }));
        return;
      }

      if (body.idempotency_key) {
        const requestHash = `${body.idempotency_key}:${body.prompt}:${body.max_spend_usd}:${body.routing_mode}`;
        const previousHash = idempotencyHashes.get(body.idempotency_key);
        if (previousHash && previousHash !== requestHash) {
          res.writeHead(409, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "idempotency_conflict", detail: "same idempotency_key was already used for a different request" }));
          return;
        }
        idempotencyHashes.set(body.idempotency_key, requestHash);
      }

      const response = await routeInference(body);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(response));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/demo/blocked") {
      const response = await routeInference(demoRequest("blocked"));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(response));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/demo/approved") {
      const response = await routeInference(demoRequest("approved"));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(response));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/demo/budget-declined") {
      const response = await routeInference(demoRequest("budget_declined"));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(response));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/demo/local") {
      const response = await routeInference(demoRequest("local"));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(response));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/demo/simple-zai") {
      const response = await routeInference(demoRequest("simple_zai"));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(response));
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
  } catch (error) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : "unknown_error" }));
  }
});

server.listen(port, () => {
  console.log(`CoboRouter demo running at http://localhost:${port}`);
});
