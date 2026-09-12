import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { build } from "esbuild";
import { loadConfig, PROJECT_ROOT } from "../apps/collector/src/config";
const config = loadConfig();
const tokenFile = path.join(PROJECT_ROOT, "data/collector-token");
if (!fs.existsSync(tokenFile))
  fs.writeFileSync(tokenFile, randomBytes(32).toString("hex"), { flag: "wx" });
const token = fs.readFileSync(tokenFile, "utf8").trim();
await build({
  entryPoints: {
    collector: "apps/collector/src/index.ts",
    "mcp-server": "apps/mcp-server/src/index.ts",
  },
  outdir: "dist",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  packages: "external",
  sourcemap: true,
});
await build({
  entryPoints: [
    "apps/extension/src/content.ts",
    "apps/extension/src/background.ts",
    "apps/extension/src/popup.ts",
  ],
  outdir: "apps/extension/dist",
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "chrome120",
  define: {
    __COLLECTOR_TOKEN__: JSON.stringify(token),
    __COLLECTOR_PORT__: String(config.port),
  },
});
for (const name of ["manifest.json", "popup.html", "popup.css"])
  fs.copyFileSync("apps/extension/" + name, "apps/extension/dist/" + name);
console.log("Collector、MCP 与 MV3 Extension 构建完成。");
