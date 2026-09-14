import { describe, it, expect, afterEach } from "vitest";
import { sample, setup, T } from "./helpers";
import { Store } from "../apps/collector/src/database";
import path from "node:path";
const opened: ReturnType<typeof setup>[] = [];
const migrations = path.resolve(process.cwd(), "apps/collector/migrations");
const fresh = () => {
  const x = setup();
  opened.push(x);
  return x;
};
afterEach(() => {
  for (const x of opened.splice(0)) x.close();
});
describe("session lifecycle and SQLite", () => {
  it("migrations are versioned and idempotent", () => {
    const x = fresh();
    const two = new Store(
      path.join(x.dir, "data/test.sqlite3"),
      migrations,
    );
    expect(
      two.db.prepare("SELECT count(*) n FROM schema_migrations").get()?.n,
    ).toBe(2);
    two.close();
  });
  it("duplicates are idempotent", () => {
    const x = fresh(),
      event = sample();
    x.engine.ingest(event);
    x.engine.ingest(event);
    expect(x.store.sessions()).toHaveLength(1);
    expect(
      x.store.db.prepare("SELECT count(*) n FROM activity_events").get()?.n,
    ).toBe(1);
  });
  it("deduplicates refreshed messages and saves edit revision", () => {
    const x = fresh();
    const m = {
      id: "user:u1",
      conversationId: "test-conversation",
      role: "user" as const,
      content: "old",
      createdAt: new Date(T).toISOString(),
      sequence: 0,
    };
    const s = x.engine.ingest(sample(T, { messages: [m] }))!;
    x.engine.ingest(sample(T + 5000, { messages: [m] }));
    x.engine.ingest(
      sample(T + 10000, { messages: [{ ...m, content: "new" }] }),
    );
    expect(x.store.messages(s.id)).toHaveLength(1);
    expect(x.store.messages(s.id)[0].content).toBe("new");
    expect(
      x.store.db.prepare("SELECT count(*) n FROM message_revisions").get()?.n,
    ).toBe(1);
  });
  it("short background interruption does not split", () => {
    const x = fresh();
    const s = x.engine.ingest(sample())!;
    x.engine.ingest(sample(T + 10000, { visible: false }));
    x.engine.ingest(sample(T + 190000, { lastInteraction: T + 190000 }));
    x.engine.ingest(sample(T + 195000, { lastInteraction: T + 190000 }));
    expect(x.store.sessions()).toHaveLength(1);
    expect(x.store.session(s.id)?.activeSeconds).toBe(15);
    expect(x.store.session(s.id)?.backgroundSeconds).toBe(180);
  });
  it("switching conversation completes old session", () => {
    const x = fresh();
    x.engine.ingest(sample());
    x.engine.ingest(sample(T + 5000, { conversationId: "new-conversation" }));
    expect(
      x.store.sessions().filter((s) => s.status === "completed"),
    ).toHaveLength(1);
    expect(x.store.sessions()).toHaveLength(2);
  });
  it("inactive 20 minutes splits without charging stale time", () => {
    const x = fresh();
    x.engine.ingest(sample());
    x.engine.tick(T + 1300000);
    const s = x.store.sessions()[0];
    expect(s.status).toBe("completed");
    expect(s.activeSeconds).toBe(30);
    expect(s.endedAt).toBe(T + 1230000);
  });
  it("pause stops message collection and time", () => {
    const x = fresh();
    x.engine.ingest(sample());
    x.engine.pause(T + 5000);
    x.engine.ingest(sample(T + 10000));
    x.engine.tick(T + 15000);
    expect(x.store.sessions()[0].activeSeconds).toBe(5);
  });
  it("ignores conversation until navigation", () => {
    const x = fresh();
    x.engine.ingest(sample());
    x.engine.finish("test-client", T + 5000, true);
    expect(x.engine.ingest(sample(T + 10000))).toBeUndefined();
    x.engine.ingest(sample(T + 15000, { conversationId: "next" }));
    expect(x.store.sessions()).toHaveLength(2);
  });
  it("recovers unfinished session without credit for collector downtime", () => {
    const x = fresh();
    const s = x.engine.ingest(sample())!;
    x.engine.ingest(sample(T + 5000));
    x.engine.recover(T + 120000);
    expect(x.store.session(s.id)?.activeSeconds).toBe(5);
    expect(x.store.session(s.id)?.status).toBe("recording");
  });
  it("cross-tab focus never counts two foreground sessions", () => {
    const x = fresh();
    x.engine.ingest(sample());
    x.engine.ingest(sample(T + 5000, { clientId: "other" }));
    x.engine.tick(T + 10000);
    expect(x.store.sessions().reduce((n, s) => n + s.activeSeconds, 0)).toBe(
      10,
    );
  });
  it("rejects out-of-order sample without going backwards", () => {
    const x = fresh();
    x.engine.ingest(sample());
    x.engine.ingest(sample(T + 10000));
    x.engine.ingest(sample(T + 5000));
    expect(x.store.sessions()[0].endedAt).toBe(T + 10000);
  });
  it("promotes new-conversation identity without splitting", () => {
    const x = fresh();
    x.engine.ingest(sample(T, { conversationId: "new-temp" }));
    x.engine.ingest(sample(T + 5000));
    expect(x.store.sessions()).toHaveLength(1);
    expect(x.store.sessions()[0].conversationId).toBe("test-conversation");
  });
  it("close event ends a session", () => {
    const x = fresh();
    x.engine.ingest(sample());
    x.engine.ingest(sample(T + 5000, { kind: "close" }));
    expect(x.store.sessions()[0].status).toBe("completed");
  });
  it("manual finish does not immediately create another session on heartbeat", () => {
    const x = fresh();
    x.engine.ingest(sample());
    x.engine.finish("test-client", T + 5000);
    expect(x.engine.ingest(sample(T + 10000))).toBeUndefined();
    expect(
      x.engine.ingest(sample(T + 15000, { lastInteraction: T + 15000 })),
    ).toBeDefined();
  });
  it("transaction failure rolls back", () => {
    const x = fresh();
    expect(() =>
      x.store.transaction(() => {
        x.store.setSetting("fail", 1);
        throw Error("test");
      }),
    ).toThrow();
    expect(x.store.setting("fail", null)).toBeNull();
  });
  it("editing a later session never rewrites earlier session evidence", () => {
    const x = fresh();
    const m = {
      id: "user:u1",
      conversationId: "test-conversation",
      role: "user" as const,
      content: "original",
      createdAt: new Date(T).toISOString(),
      sequence: 0,
    };
    const first = x.engine.ingest(sample(T, { messages: [m] }))!;
    x.engine.finish("test-client", T + 5000);
    const next = x.engine.ingest(
      sample(T + 10000, {
        lastInteraction: T + 10000,
        messages: [{ ...m, content: "edited later" }],
      }),
    )!;
    expect(x.store.messages(first.id)[0].content).toBe("original");
    expect(x.store.messages(next.id)[0].content).toBe("edited later");
  });
});
