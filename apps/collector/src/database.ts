import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  ChatMessage,
  StudySession,
  SessionSummary,
} from "../../../packages/shared/src/index";
export const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");

export class Store {
  readonly db: DatabaseSync;
  constructor(file: string, migrations: string, readOnly = false) {
    if (!readOnly) fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file, { readOnly });
    this.db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
    if (!readOnly) {
      this.db.exec("PRAGMA journal_mode=WAL;");
      this.migrate(migrations);
    }
  }
  private migrate(folder: string) {
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
    );
    for (const name of fs
      .readdirSync(folder)
      .filter((x) => x.endsWith(".sql"))
      .sort()) {
      if (
        this.db
          .prepare("SELECT 1 FROM schema_migrations WHERE version=?")
          .get(name)
      )
        continue;
      this.transaction(() => {
        this.db.exec(fs.readFileSync(path.join(folder, name), "utf8"));
        this.db
          .prepare("INSERT INTO schema_migrations VALUES(?,?)")
          .run(name, Date.now());
      });
    }
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  save(s: StudySession) {
    s.effectiveSeconds = s.activeSeconds;
    this.db
      .prepare(
        `INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,ended_at=excluded.ended_at,wall_clock_seconds=excluded.wall_clock_seconds,active_seconds=excluded.active_seconds,typing_seconds=excluded.typing_seconds,reading_seconds=excluded.reading_seconds,generating_seconds=excluded.generating_seconds,idle_seconds=excluded.idle_seconds,background_seconds=excluded.background_seconds,status=excluded.status,summary_status=excluded.summary_status,category=excluded.category,payload=excluded.payload`,
      )
      .run(
        s.id,
        s.clientId,
        s.conversationId,
        s.conversationTitle,
        s.startedAt,
        s.endedAt,
        s.wallClockSeconds,
        s.activeSeconds,
        s.typingSeconds,
        s.readingSeconds,
        s.generatingSeconds,
        s.idleSeconds,
        s.backgroundSeconds,
        s.status,
        s.summaryStatus,
        s.category,
        JSON.stringify(s),
      );
    this.db.prepare("DELETE FROM session_topics WHERE session_id=?").run(s.id);
    for (const topic of new Set(s.topics)) {
      this.db.prepare("INSERT OR IGNORE INTO topics VALUES(?)").run(topic);
      this.db
        .prepare("INSERT INTO session_topics VALUES(?,?)")
        .run(s.id, topic);
    }
  }
  session(id: string): StudySession | undefined {
    const row = this.db
      .prepare("SELECT payload FROM sessions WHERE id=?")
      .get(id);
    return row ? (JSON.parse(String(row.payload)) as StudySession) : undefined;
  }
  sessions(): StudySession[] {
    return this.db
      .prepare("SELECT payload FROM sessions ORDER BY started_at DESC")
      .all()
      .map((r) => JSON.parse(String(r.payload)) as StudySession);
  }
  messages(sessionId: string): ChatMessage[] {
    return this.db
      .prepare(
        "SELECT m.*,COALESCE(r.content,m.content) AS observed_content FROM messages m JOIN session_messages sm ON sm.message_id=m.id LEFT JOIN message_revisions r ON r.message_id=m.id AND r.hash=sm.revision_hash WHERE sm.session_id=? ORDER BY m.sequence",
      )
      .all(sessionId)
      .map((r) => ({
        id: String(r.source_id),
        conversationId: String(r.conversation_id),
        role: r.role as ChatMessage["role"],
        content: String(r.observed_content),
        createdAt: String(r.created_at),
        sequence: Number(r.sequence),
      }));
  }
  upsertMessage(sessionId: string, m: ChatMessage, observedAt: number) {
    const digest = hash(m.content);
    const old = this.db
      .prepare(
        "SELECT id,hash,content FROM messages WHERE conversation_id=? AND source_id=?",
      )
      .get(m.conversationId, m.id);
    const id = old ? String(old.id) : randomUUID();
    if (!old)
      this.db
        .prepare(
          "INSERT INTO messages(id,session_id,conversation_id,source_id,role,content,created_at,sequence,hash) VALUES(?,?,?,?,?,?,?,?,?)",
        )
        .run(
          id,
          sessionId,
          m.conversationId,
          m.id,
          m.role,
          m.content,
          m.createdAt,
          m.sequence,
          digest,
        );
    else if (old.hash !== digest) {
      this.db
        .prepare("INSERT OR IGNORE INTO message_revisions VALUES(?,?,?,?)")
        .run(id, String(old.hash), String(old.content), observedAt);
      this.db
        .prepare("UPDATE messages SET content=?,hash=?,sequence=? WHERE id=?")
        .run(m.content, digest, m.sequence, id);
    }
    this.db
      .prepare(
        "INSERT INTO session_messages(session_id,message_id,revision_hash) VALUES(?,?,?) ON CONFLICT(session_id,message_id) DO UPDATE SET revision_hash=excluded.revision_hash",
      )
      .run(sessionId, id, digest);
  }
  summary(id: string): SessionSummary | undefined {
    const row = this.db
      .prepare("SELECT payload FROM summaries WHERE session_id=?")
      .get(id);
    return row
      ? (JSON.parse(String(row.payload)) as SessionSummary)
      : undefined;
  }
  saveSummary(id: string, summary: SessionSummary, provider: string) {
    this.db
      .prepare(
        "INSERT INTO summaries VALUES(?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET payload=excluded.payload,provider=excluded.provider,updated_at=excluded.updated_at",
      )
      .run(id, JSON.stringify(summary), provider, Date.now());
  }
  setting<T>(key: string, fallback: T): T {
    const row = this.db
      .prepare("SELECT value FROM settings WHERE key=?")
      .get(key);
    return row ? (JSON.parse(String(row.value)) as T) : fallback;
  }
  setSetting(key: string, value: unknown) {
    this.db
      .prepare(
        "INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, JSON.stringify(value));
  }
  close() {
    this.db.close();
  }
}
