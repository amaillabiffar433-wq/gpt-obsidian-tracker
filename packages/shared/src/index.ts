import { z } from "zod";

export const VERSION = "0.1.0";
export const categories = [
  "高等数学",
  "算法",
  "IELTS",
  "计算机网络",
  "Java",
  "统计学",
  "科研",
  "论文写作",
  "数学建模",
  "项目开发",
  "课程学习",
  "生活",
  "其他",
] as const;
export const messageSchema = z.object({
  id: z.string().min(1).max(200),
  conversationId: z.string().min(1).max(200),
  role: z.enum(["user", "assistant"]),
  content: z.string().max(200000),
  createdAt: z.string().datetime(),
  sequence: z.number().int().nonnegative(),
});
export type ChatMessage = z.infer<typeof messageSchema>;
export type ActivityState =
  "typing" | "reading" | "generating" | "idle" | "background";
export const sampleSchema = z.object({
  eventId: z.string().uuid(),
  clientId: z.string().min(1).max(200),
  conversationId: z.string().min(1).max(200),
  title: z.string().max(500),
  url: z.string().url().max(1000),
  at: z.number().int().nonnegative(),
  visible: z.boolean(),
  focused: z.boolean(),
  generating: z.boolean(),
  lastInteraction: z.number().nonnegative(),
  lastKeyboard: z.number().nonnegative(),
  lastAssistantFinished: z.number().nonnegative(),
  parserStatus: z.enum(["OK", "PARSER_DEGRADED"]),
  messages: z.array(messageSchema).max(500),
  kind: z.enum(["sample", "leave", "close"]).default("sample"),
});
export type ActivitySample = z.infer<typeof sampleSchema>;
export const summarySchema = z.object({
  title: z.string().min(1).max(300),
  category: z.enum(categories),
  topics: z.array(z.string().max(100)).max(30),
  summary: z.array(z.string().max(2000)).max(30),
  mastered: z.array(z.string().max(2000)).max(30),
  weakPoints: z.array(z.string().max(2000)).max(30),
  importantNotes: z.array(z.string().max(2000)).max(30),
  nextActions: z.array(z.string().max(2000)).max(30),
  artifacts: z.array(z.string().max(1000)).max(30),
});
export type SessionSummary = z.infer<typeof summarySchema>;
export interface Counters {
  wallClockSeconds: number;
  activeSeconds: number;
  typingSeconds: number;
  readingSeconds: number;
  generatingSeconds: number;
  idleSeconds: number;
  backgroundSeconds: number;
}
export interface StudySession extends Counters {
  id: string;
  clientId: string;
  conversationId: string;
  conversationTitle: string;
  conversationUrl: string;
  startedAt: number;
  endedAt: number;
  lastSample: ActivitySample;
  lastActiveAt: number;
  status: "recording" | "completed" | "ignored";
  category: string;
  topics: string[];
  summaryStatus: "pending" | "completed" | "failed";
  source: "chatgpt";
  effectiveSeconds: number;
  notePath: string | null;
  isTest: boolean;
}
export interface DailyStats {
  minutes: number;
  sessions: number;
  categories: Record<string, number>;
  topics: string[];
  sessionIds: string[];
  weakPoints: string[];
  nextActions: string[];
  mastered: string[];
}
export const configSchema = z.object({
  vaultPath: z.string(),
  port: z.number().int().min(1024).max(65535),
  timezone: z.string(),
  idleThresholdSeconds: z.number().positive(),
  readingGraceSeconds: z.number().positive(),
  sessionSplitMinutes: z.number().positive(),
  heartbeatStaleSeconds: z.number().min(5).max(120),
  obsidian: z.object({
    sessionFolder: z.string(),
    dailyFolder: z.string(),
    dataFolder: z.string(),
    dailyNoteFolder: z.string(),
    dailyNoteWeekday: z.boolean(),
  }),
  summary: z.object({
    enabled: z.boolean(),
    provider: z.enum(["none", "openai-compatible"]),
    sendFullConversation: z.boolean(),
    baseUrl: z.string().url(),
    model: z.string(),
    maxChars: z.number().int().min(100).max(100000),
  }),
});
export type Config = z.infer<typeof configSchema>;
export function dateKey(at: number, timezone = "Asia/Shanghai"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}
export const zeroCounters = (): Counters => ({
  wallClockSeconds: 0,
  activeSeconds: 0,
  typingSeconds: 0,
  readingSeconds: 0,
  generatingSeconds: 0,
  idleSeconds: 0,
  backgroundSeconds: 0,
});
