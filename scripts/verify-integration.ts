import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { hash, Store } from "../apps/collector/src/database";
import { loadConfig, PROJECT_ROOT } from "../apps/collector/src/config";
const c = loadConfig();
const baseline = JSON.parse(
  fs
    .readFileSync(path.join(PROJECT_ROOT, "work/vault-baseline.json"), "utf8")
    .replace(/^\uFEFF/, ""),
) as { path: string; hash: string; size: number }[];
const allowed = [
  "首页/启动首页.md",
  "首页/学习热力图.md",
  "Obsidian配置/Dashboard/组件/60_学习热力图.md",
].map((p) => path.resolve(c.vaultPath, p));
const changed = baseline.filter(
  (x) =>
    !fs.existsSync(x.path) ||
    hash(fs.readFileSync(x.path)).toLowerCase() !== x.hash.toLowerCase(),
);
if (changed.some((x) => !allowed.includes(x.path)))
  throw Error("UNEXPECTED_VAULT_CHANGE");
const store = new Store(
  path.join(PROJECT_ROOT, "data/tracker.sqlite3"),
  path.join(PROJECT_ROOT, "apps/collector/migrations"),
  true,
);
const records = store.db
  .prepare("SELECT * FROM sync_records WHERE status='applied'")
  .all();
for (const row of records)
  if (
    row.backup_path &&
    hash(fs.readFileSync(String(row.backup_path))) !== row.before_hash
  )
    throw Error("BACKUP_HASH_MISMATCH");
const day = new Date().toLocaleDateString("en-CA");
const original = [
  { date: day, ai_minutes: 10, file: { path: "日常记录/test.md" } },
];
const automatic = [
  {
    date: day,
    ai_minutes: 7,
    file: { path: "学习记录/AI交互/每日汇总/test.md" },
  },
];
const outputs: string[] = [];
const element = {
  classList: { add: () => {} },
  createDiv: () => element,
  createSpan: (arg: { text?: string; attr?: Record<string, string> }) => {
    if (arg.text) outputs.push(arg.text);
    if (arg.attr?.title) outputs.push(arg.attr.title);
    return element;
  },
};
function pages(source: string) {
  const rows = source.includes("AI交互") ? automatic : original;
  return Object.assign(rows, {
    where: (filter: (x: (typeof rows)[number]) => boolean) =>
      rows.filter(filter),
  });
}
const dv = {
  pages,
  container: element,
  paragraph: (x: string) => outputs.push(x),
  el: (_tag: string, value: string) => outputs.push(value),
};
for (const relative of [
  "首页/学习热力图.md",
  "Obsidian配置/Dashboard/组件/60_学习热力图.md",
]) {
  outputs.length = 0;
  const text = fs
    .readFileSync(path.join(c.vaultPath, relative), "utf8")
    .split(/\r?\n/)
    .map((line) => line.replace(/^> ?/, ""))
    .join("\n");
  const script = text.match(/```dataviewjs\n([\s\S]*?)```/)?.[1];
  if (!script) throw Error("HEATMAP_CODE_NOT_FOUND");
  vm.runInNewContext(
    script,
    {
      dv,
      app: { vault: { getName: () => "test" } },
      console,
      Date,
      Map,
      Array,
      Number,
      String,
      encodeURIComponent,
    },
    { timeout: 10000 },
  );
  if (!outputs.some((x) => x.includes("17 分钟") || x.includes("17 分")))
    throw Error("HEATMAP_SUM_FAILED: " + relative);
}
const home = fs.readFileSync(
  path.join(c.vaultPath, "首页/启动首页.md"),
  "utf8",
);
const homeRecord = records.find(
  (r) => r.path === "首页/启动首页.md" && r.backup_path,
);
if (
  homeRecord &&
  !home.startsWith(fs.readFileSync(String(homeRecord.backup_path), "utf8"))
)
  throw Error("HOMEPAGE_ORIGINAL_PREFIX_CHANGED");
const result = {
  baselineFiles: baseline.length,
  unchangedFiles: baseline.length - changed.length,
  changed: changed.map((x) => x.path),
  backupHashesVerified: true,
  homepageOriginalPrefixPreserved: true,
  heatmapsReadActualIntegratedCode: true,
  fixtureManualMinutes: 10,
  fixtureAutoMinutes: 7,
  expectedMergedMinutes: 17,
  passed: true,
};
fs.writeFileSync(
  path.join(PROJECT_ROOT, "work/vault-verification.json"),
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
store.close();
