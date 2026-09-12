import fs from "node:fs";
import path from "node:path";
import { Store } from "../apps/collector/src/database";
import { loadConfig, PROJECT_ROOT } from "../apps/collector/src/config";
loadConfig();
const store = new Store(
  path.join(PROJECT_ROOT, "data/tracker.sqlite3"),
  path.join(PROJECT_ROOT, "apps/collector/migrations"),
  true,
);
const result: Record<string, unknown> = {
  sessions: store.sessions().map((s) => ({
    id: s.id,
    status: s.status,
    title: s.conversationTitle,
    seconds: s.activeSeconds,
    note: s.notePath,
  })),
  messageCount: store.db.prepare("SELECT count(*) n FROM messages").get()?.n,
};
store.close();
try {
  const { chromium } = await import("playwright");
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9331");
  result.pages = await Promise.all(
    browser
      .contexts()
      .flatMap((c) => c.pages())
      .map(async (p) => ({
        url: p.url(),
        title: await p.title(),
        dom: await p.evaluate(() => ({
          hasLogin: [...document.querySelectorAll("button,a")].some((n) =>
            ["登录", "Log in"].includes(n.textContent?.trim() ?? ""),
          ),
          messageNodes: document.querySelectorAll("[data-message-author-role]")
            .length,
          composer: !!document.querySelector("#prompt-textarea"),
        })),
      })),
  );
} catch {
  result.browser = "not-connected";
}
fs.writeFileSync(
  path.join(PROJECT_ROOT, "work/live-status.json"),
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
process.exit(0);
