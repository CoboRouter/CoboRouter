import http from "node:http";
import { demoRequest, routeInference } from "../broker/routeInference.js";
import { routeInferenceToolSchema } from "../broker/toolSchema.js";
import { loadEnv } from "../config/env.js";
import { timelineHtml } from "./timelineUi.js";
import type { RouteInferenceRequest } from "../types.js";

await loadEnv();
const port = Number(process.env.PORT || 4173);

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
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

    if (req.method === "GET" && url.pathname === "/api/tool-schema") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(routeInferenceToolSchema, null, 2));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/route-inference") {
      const body = JSON.parse(await readBody(req)) as RouteInferenceRequest;
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
