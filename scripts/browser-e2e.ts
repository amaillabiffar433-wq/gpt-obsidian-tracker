import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";
import { Store } from "../apps/collector/src/database";
import { loadConfig, PROJECT_ROOT } from "../apps/collector/src/config";
const c = loadConfig(),
  run = path.join(PROJECT_ROOT, "work", "browser-e2e-" + randomUUID());
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(path.join(run, "config"), { recursive: true });
fs.mkdirSync(path.join(run, "vault/.obsidian"), { recursive: true });
fs.mkdirSync(path.join(run, "data"), { recursive: true });
fs.cpSync(
  path.join(PROJECT_ROOT, "apps/collector/migrations"),
  path.join(run, "apps/collector/migrations"),
  { recursive: true },
);
fs.writeFileSync(
  path.join(run, "config/default.json"),
  JSON.stringify({ ...c, port: 17322, vaultPath: path.join(run, "vault") }),
);
const token = fs
  .readFileSync(path.join(PROJECT_ROOT, "data/collector-token"), "utf8")
  .trim();
fs.writeFileSync(path.join(run, "data/collector-token"), token);
const extension = path.join(run, "extension");
fs.mkdirSync(extension);
await build({
  entryPoints: [
    "apps/extension/src/content.ts",
    "apps/extension/src/background.ts",
    "apps/extension/src/popup.ts",
  ],
  outdir: extension,
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "chrome120",
  define: {
    __COLLECTOR_TOKEN__: JSON.stringify(token),
    __COLLECTOR_PORT__: "17322",
  },
});
for (const name of ["manifest.json", "popup.html", "popup.css"])
  fs.copyFileSync(
    path.join(PROJECT_ROOT, "apps/extension", name),
    path.join(extension, name),
  );
const log = fs.openSync(path.join(run, "collector-process.log"), "a");
let child = spawn(
  process.execPath,
  [path.join(PROJECT_ROOT, "dist/collector.js")],
  {
    cwd: PROJECT_ROOT,
    env: { ...process.env, TRACKER_ROOT: run },
    stdio: ["ignore", log, log],
    windowsHide: true,
  },
);
const api = async (route: string, body?: unknown) => {
  const r = await fetch("http://127.0.0.1:17322" + route, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw Error("HTTP " + r.status);
  return (await r.json()) as Record<string, unknown>;
};
async function ready() {
  for (let i = 0; i < 50; i++) {
    try {
      await api("/health");
      return;
    } catch {
      await sleep(200);
    }
  }
  throw Error("COLLECTOR_NOT_READY");
}
await ready();
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(
  PROJECT_ROOT,
  ".cache/browsers",
);
const { chromium } = await import("playwright");
const context = await chromium.launchPersistentContext(
  path.join(run, "browser-profile"),
  {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
    viewport: { width: 1000, height: 750 },
  },
);
const report: Record<string, unknown> = {
  kind: "synthetic-browser-extension-e2e",
  realChatGPT: false,
  run,
};
try {
  const fixture =
    '<!doctype html><html><head><title>自动化测试：偏导 - ChatGPT</title></head><body><main><article data-testid="conversation-turn-0"><div data-message-id="u1" data-message-author-role="user"><div class="whitespace-pre-wrap">测试：如何计算偏导？</div></div></article><article data-testid="conversation-turn-1"><div data-message-id="a1" data-message-author-role="assistant"><div class="markdown">测试说明：固定其他变量。</div></div></article><textarea id="prompt-textarea" aria-label="Test input"></textarea></main></body></html>';
  await context.route("https://chatgpt.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: fixture,
    }),
  );
  const page = await context.newPage();
  await page.goto("https://chatgpt.com/c/synthetic-e2e");
  await page.bringToFront();
  await page.locator("textarea").click();
  await page.keyboard.type("local test only");
  await sleep(11000);
  const store = new Store(
    path.join(run, "data/tracker.sqlite3"),
    path.join(run, "apps/collector/migrations"),
    true,
  );
  const session = store.sessions()[0];
  if (!session) throw Error("EXTENSION_DID_NOT_CREATE_SESSION");
  if (session.conversationTitle !== "自动化测试：偏导")
    throw Error("UNICODE_TITLE_CORRUPTED");
  const first = session.activeSeconds;
  report.foregroundSeconds = first;
  if (first < 5) throw Error("FOREGROUND_NOT_COUNTED");
  const messages = store.messages(session.id);
  if (messages.length !== 2) throw Error("MESSAGES_NOT_CAPTURED");
  report.messages = messages.length;
  const other = await context.newPage();
  await other.goto("about:blank");
  await other.bringToFront();
  await sleep(7000);
  const bg1 = store.session(session.id)!.activeSeconds;
  await sleep(7000);
  const bg2 = store.session(session.id)!.activeSeconds;
  report.backgroundDelta = bg2 - bg1;
  if (bg2 - bg1 > 0.1) throw Error("BACKGROUND_COUNTED");
  await page.bringToFront();
  await page.locator("textarea").click();
  await page.keyboard.type("resumed");
  await sleep(7000);
  const resumed = store.session(session.id)!.activeSeconds;
  report.resumedSeconds = resumed;
  if (resumed <= bg2) throw Error("RESUME_NOT_COUNTED");
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const extensionId = new URL(worker.url()).host;
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.getByText("Collector · Connected").waitFor();
  await popup.locator("body").screenshot({ path: path.join(run, "popup.png") });
  report.extensionId = extensionId;
  await api("/control", { action: "finish", clientId: session.clientId });
  const finished = store.session(session.id)!;
  report.effectiveSeconds = finished.activeSeconds;
  report.notePath = finished.notePath;
  if (
    !finished.notePath ||
    !fs.existsSync(path.join(run, "vault", finished.notePath))
  )
    throw Error("MARKDOWN_MISSING");
  const stats = JSON.parse(
    fs.readFileSync(
      path.join(run, "vault", c.obsidian.dataFolder, "daily-stats.json"),
      "utf8",
    ),
  ) as Record<string, { minutes: number }>;
  report.dailyStats = stats;
  const total = Object.values(stats).reduce((sum, x) => sum + x.minutes, 0);
  if (Math.abs(total - finished.activeSeconds / 60) > 0.001)
    throw Error("DAILY_MINUTES_MISMATCH");
  await context.close();
  store.close();
  await api("/control", { action: "shutdown" });
  await new Promise<void>((r) => child.once("exit", () => r()));
  child = spawn(
    process.execPath,
    [path.join(PROJECT_ROOT, "dist/collector.js")],
    {
      cwd: PROJECT_ROOT,
      env: { ...process.env, TRACKER_ROOT: run },
      stdio: ["ignore", log, log],
      windowsHide: true,
    },
  );
  await ready();
  const reopened = new Store(
    path.join(run, "data/tracker.sqlite3"),
    path.join(run, "apps/collector/migrations"),
    true,
  );
  report.restartPreserved =
    reopened.session(session.id)?.activeSeconds === finished.activeSeconds;
  if (!report.restartPreserved) throw Error("RESTART_DATA_LOSS");
  reopened.close();
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  await context.close().catch(() => {});
  await api("/control", { action: "shutdown" }).catch(() => {});
  child.kill();
  fs.closeSync(log);
  fs.writeFileSync(
    path.join(run, "report.json"),
    JSON.stringify(report, null, 2),
  );
  fs.writeFileSync(
    path.join(PROJECT_ROOT, "work/latest-browser-e2e.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
