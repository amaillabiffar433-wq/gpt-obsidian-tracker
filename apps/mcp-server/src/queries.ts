import { dateKey } from "../../../packages/shared/src/index";
import { aggregate } from "../../../packages/obsidian-writer/src/stats";
import type { Store } from "../../collector/src/database";
export const toolNames = [
  "tracker_today",
  "tracker_day",
  "tracker_week",
  "tracker_sessions",
  "tracker_search",
  "tracker_topics",
  "tracker_weak_points",
  "tracker_stats",
] as const;
export function query(
  store: Store,
  timezone: string,
  name: string,
  args: { date?: string; query?: string; category?: string; limit?: number },
) {
  const days = aggregate(store, timezone, true, args.category),
    today = args.date ?? dateKey(Date.now(), timezone);
  const sessions = store
    .sessions()
    .filter(
      (s) =>
        !s.isTest &&
        s.status !== "ignored" &&
        (!args.category || s.category === args.category),
    );
  const dayResult = (day: string) => {
    const d = days[day];
    return {
      date: day,
      effectiveMinutes: d?.minutes ?? 0,
      sessions: d?.sessions ?? 0,
      categories: d?.categories ?? {},
      weakPoints: d?.weakPoints ?? [],
      nextActions: d?.nextActions ?? [],
    };
  };
  if (name === "tracker_today" || name === "tracker_day")
    return dayResult(today);
  if (name === "tracker_week") {
    const d = new Date(today + "T12:00:00Z"),
      weekday = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - weekday);
    const result = [];
    for (let i = 0; i < 7; i++) {
      result.push(dayResult(d.toISOString().slice(0, 10)));
      d.setUTCDate(d.getUTCDate() + 1);
    }
    const categories: Record<string, number> = Object.create(null) as Record<
      string,
      number
    >;
    for (const x of result)
      for (const [key, n] of Object.entries(x.categories))
        categories[key] = (categories[key] ?? 0) + n;
    return {
      effectiveMinutes: result.reduce((s, x) => s + x.effectiveMinutes, 0),
      categories,
      days: result,
    };
  }
  if (name === "tracker_sessions")
    return sessions.slice(0, args.limit ?? 20).map((s) => ({
      id: s.id,
      title: s.conversationTitle,
      startedAt: s.startedAt,
      effectiveMinutes: s.activeSeconds / 60,
      category: s.category,
      topics: s.topics,
      status: s.status,
    }));
  if (name === "tracker_topics")
    return [...new Set(sessions.flatMap((s) => s.topics))];
  if (name === "tracker_weak_points")
    return sessions
      .flatMap((s) =>
        (store.summary(s.id)?.weakPoints ?? []).map((text) => ({
          sessionId: s.id,
          category: s.category,
          text,
        })),
      )
      .slice(0, args.limit ?? 50);
  if (name === "tracker_search") {
    const q = (args.query ?? "").toLowerCase();
    return sessions
      .filter((s) =>
        (
          s.conversationTitle +
          " " +
          JSON.stringify(store.summary(s.id) ?? {}) +
          " " +
          store
            .messages(s.id)
            .map((m) => m.content)
            .join(" ")
        )
          .toLowerCase()
          .includes(q),
      )
      .slice(0, args.limit ?? 20)
      .map((s) => ({
        id: s.id,
        title: s.conversationTitle,
        category: s.category,
        summary: store.summary(s.id) ?? null,
      }));
  }
  return {
    effectiveMinutes: Object.values(days).reduce(
      (sum, d) => sum + d.minutes,
      0,
    ),
    sessions: sessions.length,
    days,
  };
}
