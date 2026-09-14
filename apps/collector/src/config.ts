import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { configSchema, type Config } from "../../../packages/shared/src/index";

const defaultRoot =
  process.env.TRACKER_ROOT ??
  (process.platform === "win32" ? "D:/Projects/GPT-Obsidian-Tracker" : process.cwd());
export const PROJECT_ROOT = path.resolve(defaultRoot);
export function loadConfig(root = PROJECT_ROOT): Config {
  if (process.platform === "win32" && !/^d:[\\/]/i.test(root))
    throw new Error("PROJECT_MUST_BE_ON_D_DRIVE");
  dotenv.config({ path: path.join(root, ".env.local"), quiet: true });
  const base = JSON.parse(
    fs.readFileSync(path.join(root, "config/default.json"), "utf8"),
  ) as Config;
  const localPath = path.join(root, "config/local.json");
  const local = fs.existsSync(localPath)
    ? (JSON.parse(fs.readFileSync(localPath, "utf8")) as Partial<Config>)
    : {};
  const config = configSchema.parse({
    ...base,
    ...local,
    obsidian: { ...base.obsidian, ...local.obsidian },
    summary: { ...base.summary, ...local.summary },
  });
  if (process.platform === "win32" && !/^d:[\\/]/i.test(config.vaultPath))
    throw new Error("VAULT_MUST_BE_ON_D_DRIVE");
  new Intl.DateTimeFormat("en-CA", { timeZone: config.timezone });
  for (const dir of ["data", "logs", "backups", ".cache/tmp"])
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  process.env.TEMP = process.env.TMP = path.join(root, ".cache/tmp");
  return config;
}
