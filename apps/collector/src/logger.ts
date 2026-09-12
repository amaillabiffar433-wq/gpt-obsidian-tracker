import fs from "node:fs";
import path from "node:path";
export class Logger {
  constructor(private root: string) {
    fs.mkdirSync(path.join(root, "logs"), { recursive: true });
    for (const name of ["collector", "extension", "obsidian", "summary"]) {
      fs.closeSync(fs.openSync(path.join(root, "logs", name + ".log"), "a"));
    }
  }
  log(
    channel: "collector" | "extension" | "obsidian" | "summary",
    code: string,
    details: Record<string, string | number | boolean> = {},
  ) {
    const file = path.join(this.root, "logs", channel + ".log");
    if (fs.existsSync(file) && fs.statSync(file).size > 2 * 1024 * 1024) {
      for (let i = 3; i >= 1; i--) {
        const src = i === 1 ? file : file + "." + (i - 1);
        const dst = file + "." + i;
        if (fs.existsSync(dst)) fs.unlinkSync(dst);
        if (fs.existsSync(src)) fs.renameSync(src, dst);
      }
    }
    fs.appendFileSync(
      file,
      JSON.stringify({ at: new Date().toISOString(), code, ...details }) + "\n",
      "utf8",
    );
  }
}
