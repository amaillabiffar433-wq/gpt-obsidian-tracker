import { describe, it, expect, afterEach, vi } from "vitest";
import type { AddressInfo } from "node:net";
import { sample, setup, T } from "./helpers";
import { TrackerService } from "../apps/collector/src/service";
import { Logger } from "../apps/collector/src/logger";
import { createApi } from "../apps/collector/src/server";
import {
  NoneProvider,
  OpenAICompatibleProvider,
  classify,
  filteredText,
} from "../packages/summary-engine/src/index";
import { query, toolNames } from "../apps/mcp-server/src/queries";
const opened: ReturnType<typeof setup>[] = [];
const fresh = () => {
  const x = setup();
  opened.push(x);
  return x;
};
afterEach(() => {
  for (const x of opened.splice(0)) x.close();
  vi.restoreAllMocks();
});
describe("providers and read-only MCP", () => {
  it("none provider makes no network requests", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    expect(await new NoneProvider().summarize()).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
  it("classifies study topics locally", () => {
    expect(classify("高等数学偏导与雅可比", [])).toEqual({
      category: "高等数学",
      topics: ["偏导", "雅可比"],
    });
    expect(classify("数学建模 Q3 滚动调度", []).category).toBe("数学建模");
  });
  it("filters minimal payload instead of sending full conversation", () => {
    const msgs = Array.from({ length: 30 }, (_, i) => ({
      id: String(i),
      conversationId: "x",
      role: "user" as const,
      content: "secret-" + i + "-" + "x".repeat(2000),
      createdAt: new Date(T).toISOString(),
      sequence: i,
    }));
    const text = filteredText(msgs, false, 16000);
    expect(text.length).toBeLessThanOrEqual(16000);
    expect(text).not.toContain("secret-0-");
  });
  it("does not upload when explicitly disabled despite key", async () => {
    const x = fresh();
    const spy = vi.fn();
    const p = new OpenAICompatibleProvider(
      { ...x.config.summary, enabled: false },
      "key",
      spy,
    );
    const s = x.engine.ingest(sample())!;
    await p.summarize({ session: s, messages: [] });
    expect(spy).not.toHaveBeenCalled();
  });
  it("validates AI JSON before accepting it", async () => {
    const x = fresh();
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"mastered":"everything"}' } }],
        }),
        { status: 200 },
      ),
    );
    const p = new OpenAICompatibleProvider(
      { ...x.config.summary, enabled: true, model: "configured-model" },
      "test-key",
      fetcher,
    );
    await expect(
      p.summarize({ session: x.engine.ingest(sample())!, messages: [] }),
    ).rejects.toThrow();
  });
  it("accepts a validated structured summary", async () => {
    const x = fresh(),
      result = {
        title: "测试",
        category: "高等数学",
        topics: [],
        summary: [],
        mastered: [],
        weakPoints: [],
        importantNotes: [],
        nextActions: [],
        artifacts: [],
      };
    const p = new OpenAICompatibleProvider(
      { ...x.config.summary, enabled: true, model: "configured-model" },
      "test-key",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(result) } }],
          }),
        ),
      ),
    );
    expect(
      await p.summarize({ session: x.engine.ingest(sample())!, messages: [] }),
    ).toEqual(result);
  });
  it("MCP exposes eight queries and does not mutate data", () => {
    const x = fresh();
    x.engine.ingest(sample());
    x.engine.finish("test-client", T + 10000);
    const before = x.store.db.prepare("SELECT total_changes() n").get()?.n;
    for (const tool of toolNames)
      expect(
        query(x.store, x.config.timezone, tool, {
          date: "2026-09-12",
          query: "雅可比",
        }),
      ).toBeDefined();
    expect(toolNames).toHaveLength(8);
    expect(x.store.db.prepare("SELECT total_changes() n").get()?.n).toBe(
      before,
    );
  });
});
describe("collector API", () => {
  it("empty homepage navigation never creates a study note", async () => {
    const x = fresh(),
      svc = new TrackerService(x.store, x.config, x.dir, new Logger(x.dir));
    x.engine.ingest(sample());
    x.engine.finish("test-client", T + 5000);
    await svc.sync();
    expect(x.store.sessions()[0].status).toBe("ignored");
    expect(x.store.sessions()[0].notePath).toBeNull();
  });
  it("category filtering applies to daily MCP totals", () => {
    const x = fresh();
    x.engine.ingest(sample());
    x.engine.finish("test-client", T + 10000);
    const result = query(x.store, x.config.timezone, "tracker_day", {
      date: "2026-09-12",
      category: "IELTS",
    }) as { effectiveMinutes: number };
    expect(result.effectiveMinutes).toBe(0);
  });
  it("records, pauses, completes and synchronizes over authenticated HTTP", async () => {
    const x = fresh(),
      svc = new TrackerService(x.store, x.config, x.dir, new Logger(x.dir));
    const api = createApi(svc, "test-token", new Logger(x.dir));
    await new Promise<void>((r) => api.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
    try {
      const headers = {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      };
      const now = Date.now();
      let response = await fetch(base + "/events", {
        method: "POST",
        headers,
        body: JSON.stringify(
          sample(now, {
            lastInteraction: now,
            messages: [
              {
                id: "u1",
                conversationId: "test-conversation",
                role: "user",
                content: "学习偏导",
                createdAt: new Date(now).toISOString(),
                sequence: 0,
              },
            ],
          }),
        ),
      });
      expect(response.status).toBe(200);
      expect(x.store.sessions()).toHaveLength(1);
      response = await fetch(base + "/control", {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "finish", clientId: "test-client" }),
      });
      expect(response.status).toBe(200);
      expect(x.store.sessions()[0].status).toBe("completed");
      expect(x.store.sessions()[0].notePath).toBeTruthy();
    } finally {
      await new Promise<void>((r) => api.close(() => r()));
    }
  });
  it("rejects unauthenticated, web-origin and malformed requests", async () => {
    const x = fresh(),
      svc = new TrackerService(x.store, x.config, x.dir, new Logger(x.dir)),
      api = createApi(svc, "secret", new Logger(x.dir));
    await new Promise<void>((r) => api.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
    try {
      expect((await fetch(base + "/health")).status).toBe(401);
      expect(
        (
          await fetch(base + "/health", {
            headers: {
              Authorization: "Bearer secret",
              Origin: "https://evil.example",
            },
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await fetch(base + "/events", {
            method: "POST",
            headers: {
              Authorization: "Bearer secret",
              "Content-Type": "application/json",
            },
            body: "{}",
          })
        ).status,
      ).toBe(400);
      expect(x.store.sessions()).toHaveLength(0);
    } finally {
      await new Promise<void>((r) => api.close(() => r()));
    }
  });
});
