import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { sampleSchema } from "../../../packages/shared/src/index";
import type { TrackerService } from "./service";
import type { Logger } from "./logger";

export function createApi(
  service: TrackerService,
  token: string,
  logger: Logger,
) {
  return http.createServer(async (req, res) => {
    const send = (status: number, value: unknown) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(value));
    };
    try {
      if (!/^127\.0\.0\.1:\d+$/.test(req.headers.host ?? ""))
        return send(403, { error: "HOST_REJECTED" });
      const origin = req.headers.origin;
      if (origin && !/^chrome-extension:\/\/[a-p]{32}$/.test(origin))
        return send(403, { error: "ORIGIN_REJECTED" });
      if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
      }
      if (req.method === "OPTIONS") {
        res.setHeader(
          "Access-Control-Allow-Headers",
          "authorization,content-type",
        );
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
        res.writeHead(204);
        return res.end();
      }
      const supplied = Buffer.from(
        (req.headers.authorization ?? "").replace(/^Bearer /, ""),
      );
      const expected = Buffer.from(token);
      if (
        supplied.length !== expected.length ||
        !timingSafeEqual(supplied, expected)
      )
        return send(401, { error: "UNAUTHORIZED" });
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (req.method === "GET" && url.pathname === "/health")
        return send(200, { ok: true, version: "0.1.0" });
      if (req.method === "GET" && url.pathname === "/status")
        return send(
          200,
          service.status(url.searchParams.get("clientId") ?? ""),
        );
      if (req.method !== "POST") return send(404, { error: "NOT_FOUND" });
      if (!req.headers["content-type"]?.startsWith("application/json"))
        return send(415, { error: "JSON_REQUIRED" });
      let size = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        const bytes = Buffer.from(chunk as Uint8Array);
        size += bytes.length;
        if (size > 4 * 1024 * 1024) {
          send(413, { error: "PAYLOAD_TOO_LARGE" });
          req.destroy();
          return;
        }
        chunks.push(bytes);
      }
      const input: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (url.pathname === "/events")
        return send(200, service.ingest(sampleSchema.parse(input)));
      if (url.pathname === "/control") {
        const action = z
          .object({
            action: z.enum([
              "pause",
              "resume",
              "ignore",
              "finish",
              "sync",
              "shutdown",
            ]),
            clientId: z.string().max(200).default(""),
          })
          .parse(input);
        if (action.action === "shutdown") {
          await service.shutdown();
          send(200, { ok: true });
          process.emit("SIGTERM");
          return;
        }
        return send(200, await service.control(action.action, action.clientId));
      }
      send(404, { error: "NOT_FOUND" });
    } catch (error) {
      const bad = error instanceof z.ZodError || error instanceof SyntaxError;
      logger.log("collector", bad ? "INVALID_REQUEST" : "REQUEST_FAILED");
      if (!res.headersSent)
        send(bad ? 400 : 500, {
          error: bad ? "INVALID_REQUEST" : "INTERNAL_ERROR",
        });
    }
  });
}
