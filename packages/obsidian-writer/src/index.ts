import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import {
  dateKey,
  VERSION,
  type Config,
  type StudySession,
  type SessionSummary,
  type DailyStats,
} from "../../shared/src/index";
import { Store } from "../../../apps/collector/src/database";
import { SafeFiles, machineBlock, safeName, START, END } from "./safe-files";
import { aggregate } from "./stats";

function frontmatter(text: string): Record<string, unknown> {
  const match = text.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  return match ? ((YAML.parse(match[1]) as Record<string, unknown>) ?? {}) : {};
}
const md = (value: string) =>
  value
    .replace(/[\r\n]+/g, " ")
    .replace(/[<>]/g, "")
    .replace(/\[\[/g, "［［")
    .replace(/\]\]/g, "］］");
const bullet = (items: string[], task = false) =>
  items.length
    ? items.map((x) => `- ${task ? "[ ] " : ""}${md(x)}`).join("\n")
    : "暂无足够证据。";
const mins = (n: number) => Number((n / 60).toFixed(2));
export class ObsidianWriter {
  readonly files: SafeFiles;
  constructor(
    readonly store: Store,
    readonly config: Config,
    root: string,
  ) {
    this.files = new SafeFiles(config.vaultPath, root, store);
    this.files.recover();
  }
  importOverrides(s: StudySession) {
    if (!s.notePath) return;
    const text = this.files.read(s.notePath);
    if (!text) return;
    const data = frontmatter(text);
    const emitted = this.store.setting<Record<string, unknown>>(
      "emitted:" + s.id,
      {},
    );
    if (
      data.category !== undefined &&
      JSON.stringify(data.category) !== JSON.stringify(emitted.category) &&
      typeof data.category === "string"
    ) {
      s.category = data.category;
      this.store.setSetting("manual-category:" + s.id, true);
    }
    if (
      data.topics !== undefined &&
      JSON.stringify(data.topics) !== JSON.stringify(emitted.topics) &&
      Array.isArray(data.topics) &&
      data.topics.every((x) => typeof x === "string")
    ) {
      s.topics = data.topics as string[];
      this.store.setSetting("manual-topics:" + s.id, true);
    }
    this.store.save(s);
  }
  writeSession(s: StudySession, summary?: SessionSummary) {
    this.importOverrides(s);
    const day = dateKey(s.startedAt, this.config.timezone);
    const relative =
      s.notePath ??
      `${this.config.obsidian.sessionFolder}/${day}-${safeName(s.conversationTitle)}-${s.id}.md`;
    const old = this.files.read(relative);
    const fm = old ? frontmatter(old) : {};
    if (old && fm.session_id !== s.id) throw new Error("NOTE_ID_CONFLICT");
    const time = (at: number) =>
      new Intl.DateTimeFormat("zh-CN", {
        timeZone: this.config.timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(at);
    const data = {
      ...fm,
      type: "ai-study-session",
      source: "chatgpt",
      session_id: s.id,
      date: day,
      started: time(s.startedAt),
      ended: time(s.endedAt),
      effective_minutes: mins(s.activeSeconds),
      wall_clock_minutes: mins(s.wallClockSeconds),
      category: s.category,
      topics: s.topics,
      mastery_score: fm.mastery_score ?? null,
      conversation_id: s.conversationId,
      conversation_url: s.conversationUrl,
      summary_status: s.summaryStatus,
      status: s.status,
      weak_points: summary?.weakPoints ?? [],
      tracker_version: VERSION,
    };
    const generated = `## 本次学习\n\n${summary ? bullet(summary.summary) : "总结待处理；时间和对话已保存在本地。"}\n\n## 已掌握\n\n${bullet(summary?.mastered ?? [])}\n\n## 需要注意\n\n${bullet(summary?.weakPoints ?? [])}\n\n## 重要结论\n\n${bullet(summary?.importantNotes ?? [])}\n\n## 下一次\n\n${bullet(summary?.nextActions ?? [], true)}\n\n## 成果\n\n${bullet(summary?.artifacts ?? [])}\n\n## 学习信息\n\n| 项目 | 数据 |\n|---|---:|\n| 有效学习 | ${mins(s.activeSeconds)} min |\n| 总跨度 | ${mins(s.wallClockSeconds)} min |\n| 输入 / 阅读 / 生成 | ${mins(s.typingSeconds)} / ${mins(s.readingSeconds)} / ${mins(s.generatingSeconds)} min |\n| 空闲 / 后台 | ${mins(s.idleSeconds)} / ${mins(s.backgroundSeconds)} min |\n\n## 原始对话\n\n[在 ChatGPT 查看](${s.conversationUrl.startsWith("https://chatgpt.com/") || s.conversationUrl.startsWith("https://chat.openai.com/") ? s.conversationUrl : "https://chatgpt.com/"})；原文仅保存在本地 SQLite。`;
    let body = old
      ? old.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "")
      : `\n# ${md(s.conversationTitle)}\n`;
    const previousBody = this.store.setting<string | null>(
      "body:" + s.id,
      null,
    );
    const currentBlock =
      body.includes(START) && body.includes(END)
        ? body
            .slice(body.indexOf(START) + START.length, body.indexOf(END))
            .trim()
        : null;
    const bodyConflict =
      old && previousBody !== null && currentBlock !== previousBody;
    if (bodyConflict) {
      this.store.setSetting("body-conflict:" + s.id, true);
    } else {
      body = machineBlock(body, generated);
    }
    const next = "---\n" + YAML.stringify(data) + "---\n" + body;
    this.files.write(relative, next, old);
    if (!bodyConflict) this.store.setSetting("body:" + s.id, generated);
    s.notePath = relative;
    this.store.save(s);
    this.store.setSetting("emitted:" + s.id, data);
  }
  sync() {
    if (!fs.existsSync(path.join(this.config.vaultPath, ".obsidian")))
      throw new Error("VAULT_NOT_FOUND");
    for (const s of this.store
      .sessions()
      .filter((x) => x.status !== "recording" && !x.isTest)) {
      if (s.status === "ignored" && !s.notePath) continue;
      this.writeSession(s, this.store.summary(s.id));
    }
    const days = aggregate(this.store, this.config.timezone);
    const prior = this.store.db
      .prepare("SELECT date FROM daily_stats")
      .all()
      .map((r) => String(r.date));
    for (const day of new Set([...prior, ...Object.keys(days)])) {
      const stats = days[day] ?? {
        minutes: 0,
        sessions: 0,
        categories: {},
        topics: [],
        sessionIds: [],
        weakPoints: [],
        nextActions: [],
        mastered: [],
      };
      this.writeDay(day, stats);
      this.store.db
        .prepare(
          "INSERT INTO daily_stats VALUES(?,?,?) ON CONFLICT(date) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at",
        )
        .run(day, JSON.stringify(stats), Date.now());
    }
    const statsPath = `${this.config.obsidian.dataFolder}/daily-stats.json`;
    const old = this.files.read(statsPath);
    this.files.write(statsPath, JSON.stringify(days, null, 2) + "\n", old);
    return {
      days: Object.keys(days).length,
      sessions: this.store.sessions().filter((x) => x.notePath).length,
    };
  }
  private writeDay(day: string, s: DailyStats) {
    const relative = `${this.config.obsidian.dailyFolder}/${day}.md`,
      old = this.files.read(relative);
    if (old && frontmatter(old).type !== "ai-learning-day")
      throw new Error("DAILY_NOTE_CONFLICT");
    const categoryFields = Object.fromEntries(
      Object.entries(s.categories).filter(
        ([name]) =>
          ![
            "type",
            "date",
            "ai_minutes",
            "ai_sessions",
            "categories",
            "topics",
          ].includes(name),
      ),
    );
    const oldData = old ? frontmatter(old) : {};
    const priorCategories = oldData.categories;
    if (
      priorCategories &&
      typeof priorCategories === "object" &&
      !Array.isArray(priorCategories)
    ) {
      for (const key of Object.keys(priorCategories)) {
        if (
          ![
            "type",
            "date",
            "ai_minutes",
            "ai_sessions",
            "categories",
            "topics",
          ].includes(key)
        )
          delete oldData[key];
      }
    }
    for (const key of [
      "type",
      "date",
      "ai_minutes",
      "ai_sessions",
      "categories",
      "topics",
    ])
      delete oldData[key];
    const data = {
      ...oldData,
      ...categoryFields,
      type: "ai-learning-day",
      date: day,
      ai_minutes: s.minutes,
      ai_sessions: s.sessions,
      categories: s.categories,
      topics: s.topics,
    };
    const body = `## 今日\n\n有效学习：**${Number(s.minutes.toFixed(2))} min**\n\n| 方向 | 时间 |\n|---|---:|\n${Object.entries(
      s.categories,
    )
      .map(
        ([c, m]) =>
          `| ${md(c).replace(/\|/g, "／")} | ${Number(m.toFixed(2))} min |`,
      )
      .join("\n")}\n\n## 今日完成\n\n${
      s.sessionIds
        .map((id) => this.store.session(id)?.notePath)
        .filter(Boolean)
        .map((p) => `- [[${p!.replace(/\.md$/, "")}]]`)
        .join("\n") || "暂无记录。"
    }\n\n## 今日掌握\n\n${bullet(s.mastered)}\n\n## 需要继续\n\n${bullet(s.nextActions, true)}`;
    const oldBody = old
      ? old.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
      : `\n# ${day} AI 学习\n`;
    const checked = new Set(
      (oldBody.match(/^- \[[xX]\] .+$/gm) ?? []).map((line) =>
        line.slice(6).trim(),
      ),
    );
    const nextBody = body.replace(
      /^- \[ \] (.+)$/gm,
      (line: string, task: string) =>
        checked.has(task.trim()) ? "- [x] " + task : line,
    );
    this.files.write(
      relative,
      "---\n" +
        YAML.stringify(data) +
        "---\n" +
        machineBlock(oldBody, nextBody),
      old,
    );
    const folder = this.files.resolve(this.config.obsidian.dailyNoteFolder);
    const names = fs.existsSync(folder)
      ? fs
          .readdirSync(folder)
          .filter(
            (n) =>
              n.endsWith(".md") &&
              (n === day + ".md" || n.startsWith(day + " ")),
          )
      : [];
    if (names.length > 1) throw new Error("AMBIGUOUS_DAILY_NOTE");
    const weekday = new Intl.DateTimeFormat("zh-CN", {
      weekday: "long",
      timeZone: this.config.timezone,
    }).format(new Date(day + "T12:00:00+08:00"));
    const name =
      names[0] ??
      `${day}${this.config.obsidian.dailyNoteWeekday ? " " + weekday : ""}.md`;
    const dailyPath = `${this.config.obsidian.dailyNoteFolder}/${name}`,
      dailyOld = this.files.read(dailyPath);
    const dailyBody = `## 🤖 AI 学习\n\n今日有效时间：${Number(s.minutes.toFixed(2))} min\n\n${Object.entries(
      s.categories,
    )
      .map(([c, m]) => `- ${md(c)}：${Number(m.toFixed(2))} min`)
      .join(
        "\n",
      )}\n\n[[${relative.replace(/\.md$/, "")}]]\n\n自动分钟来自上述每日汇总；保留本笔记手工分钟字段。`;
    this.files.write(
      dailyPath,
      machineBlock(
        dailyOld ?? `---\ndate: ${day}\n---\n\n# ${day}\n`,
        dailyBody,
      ),
      dailyOld,
    );
  }
}
