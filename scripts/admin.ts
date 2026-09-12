import fs from "node:fs";
import path from "node:path";
import { loadConfig, PROJECT_ROOT } from "../apps/collector/src/config";
import { Store } from "../apps/collector/src/database";
import { SafeFiles } from "../packages/obsidian-writer/src/safe-files";
const c = loadConfig(),
  [action, id] = process.argv.slice(2);
const token = fs
  .readFileSync(path.join(PROJECT_ROOT, "data/collector-token"), "utf8")
  .trim();
if (["sync", "pause", "resume", "shutdown"].includes(action)) {
  const result = await fetch(`http://127.0.0.1:${c.port}/control`, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, clientId: "" }),
  });
  if (!result.ok) throw new Error("COLLECTOR_REQUEST_FAILED");
  console.log(await result.text());
} else {
  // Offline administrative writes require the collector to be stopped.
  let running = false;
  try {
    await fetch(`http://127.0.0.1:${c.port}/health`, {
      signal: AbortSignal.timeout(1000),
    });
    running = true;
  } catch {
    /* offline */
  }
  if (running && ["ignore", "restore", "undo"].includes(action))
    throw new Error("STOP_COLLECTOR_BEFORE_OFFLINE_WRITE");
  const store = new Store(
    path.join(PROJECT_ROOT, "data/tracker.sqlite3"),
    path.join(PROJECT_ROOT, "apps/collector/migrations"),
  );
  if (action === "list")
    console.log(
      JSON.stringify(
        store
          .sessions()
          .map((s) => ({
            id: s.id,
            title: s.conversationTitle,
            status: s.status,
            minutes: s.activeSeconds / 60,
          })),
        null,
        2,
      ),
    );
  else if (action === "ignore" || action === "restore") {
    const s = store.session(id);
    if (!s) throw new Error("SESSION_NOT_FOUND");
    s.status = action === "ignore" ? "ignored" : "completed";
    store.save(s);
    console.log("会话状态已更新。下次启动会重新汇总；原始数据保留。");
  } else if (action === "undo")
    new SafeFiles(c.vaultPath, PROJECT_ROOT, store).undo(id);
  else if (action === "sync-records")
    console.log(
      JSON.stringify(
        store.db
          .prepare(
            "SELECT id,path,status,created_at FROM sync_records ORDER BY created_at DESC",
          )
          .all(),
        null,
        2,
      ),
    );
  else
    throw new Error(
      "Usage: admin list|ignore <id>|restore <id>|sync-records|undo <sync-id>|sync|pause|resume|shutdown",
    );
  store.close();
}
