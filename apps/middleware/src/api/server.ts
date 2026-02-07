import http from "node:http";
import url from "node:url";
import fs from "node:fs";
import { RUNTIME_STATE } from "../state/runtimeState.js";
import { CONFIG } from "../config.js";

function json(res: http.ServerResponse, status: number, body: unknown) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(data);
}

function notFound(res: http.ServerResponse) {
  res.writeHead(404, { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" });
  res.end("Not found");
}

function readAuditTail(maxLines = 200): unknown[] {
  try {
    if (!fs.existsSync(CONFIG.auditPath)) return [];
    const txt = fs.readFileSync(CONFIG.auditPath, "utf-8");
    const lines = txt.trim().split("\n").slice(-maxLines);
    return lines.map((l) => {
      try { return JSON.parse(l); } catch { return { type: "parse_error", raw: l }; }
    });
  } catch (e) {
    return [{ type: "error", error: String(e) }];
  }
}

/**
 * Minimal API for the dashboard.
 *
 * Endpoints:
 * - GET /api/health
 * - GET /api/state
 * - GET /api/audit?lines=200
 */
export function startApiServer() {
  const server = http.createServer((req, res) => {
    const parsed = url.parse(req.url ?? "", true);
    const path = parsed.pathname ?? "/";

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      return res.end();
    }

    if (req.method !== "GET") return notFound(res);

    if (path === "/api/health") return json(res, 200, { ok: true, ts: new Date().toISOString() });
    if (path === "/api/state") return json(res, 200, RUNTIME_STATE);

    if (path === "/api/audit") {
      const lines = Math.max(1, Math.min(5000, Number(parsed.query.lines ?? 200)));
      return json(res, 200, { lines, items: readAuditTail(lines) });
    }

    return notFound(res);
  });

  server.listen(CONFIG.apiPort, () => {
    console.log(`[api] listening on http://localhost:${CONFIG.apiPort}`);
  });

  return server;
}
