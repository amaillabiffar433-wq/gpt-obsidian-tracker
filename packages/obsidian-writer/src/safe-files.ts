import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Store, hash } from "../../../apps/collector/src/database";

export const START = "<!-- GPT_TRACKER_START -->",
  END = "<!-- GPT_TRACKER_END -->";
export function machineBlock(old: string, content: string): string {
  const starts = old.split(START).length - 1,
    ends = old.split(END).length - 1;
  const newline = old.includes("\r\n") ? "\r\n" : "\n";
  const body = newline + content.replace(/\r?\n/g, newline).trim() + newline;
  if (!starts && !ends)
    return (
      old +
      (old.endsWith("\n") ? "" : "\n") +
      newline +
      START +
      body +
      END +
      newline
    );
  if (starts !== 1 || ends !== 1 || old.indexOf(END) < old.indexOf(START))
    throw new Error("AMBIGUOUS_MACHINE_BLOCK");
  return (
    old.slice(0, old.indexOf(START) + START.length) +
    body +
    old.slice(old.indexOf(END))
  );
}
export function safeName(name: string): string {
  const cleaned = Array.from(name)
    .map((ch) =>
      ch.charCodeAt(0) < 32 || '<>:"/\\|?*[]#^'.includes(ch) ? "-" : ch,
    )
    .join("")
    .replace(/[. ]+$/, "")
    .slice(0, 70);
  return /^(CON|PRN|AUX|NUL|COM\d|LPT\d)(\.|$)/i.test(cleaned)
    ? "_" + cleaned
    : cleaned || "未命名";
}
export class SafeFiles {
  constructor(
    readonly vault: string,
    readonly root: string,
    readonly store: Store,
  ) {}
  resolve(relative: string): string {
    if (/^[A-Za-z]:[\\/]/.test(relative) || relative.startsWith("\\\\"))
      throw new Error("PATH_OUTSIDE_VAULT");
    const base = path.resolve(this.vault),
      full = path.resolve(base, relative),
      rel = path.relative(base, full);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel))
      throw new Error("PATH_OUTSIDE_VAULT");
    let current = base;
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink())
      throw new Error("SYMLINK_REJECTED");
    for (const part of rel.split(path.sep)) {
      current = path.join(current, part);
      if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink())
        throw new Error("SYMLINK_REJECTED");
    }
    return full;
  }
  read(relative: string) {
    const full = this.resolve(relative);
    return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
  }
  write(relative: string, next: string, expected: string | null): boolean {
    const full = this.resolve(relative),
      before = fs.existsSync(full) ? fs.readFileSync(full) : null;
    if ((before?.toString("utf8") ?? null) !== expected)
      throw new Error("FILE_EDIT_CONFLICT");
    if (expected === next) return false;
    const id = randomUUID(),
      backup = before ? path.join(this.root, "backups", id + ".bak") : null;
    fs.mkdirSync(path.join(this.root, "backups"), { recursive: true });
    if (before && backup) {
      fs.writeFileSync(backup, before, { flag: "wx" });
      if (hash(fs.readFileSync(backup)) !== hash(before))
        throw new Error("BACKUP_MISMATCH");
    }
    fs.mkdirSync(path.dirname(full), { recursive: true });
    const temp = path.join(path.dirname(full), ".gpt-tracker-" + id + ".tmp");
    this.store.db
      .prepare(
        "INSERT INTO sync_records(id,path,before_hash,after_hash,backup_path,status,created_at) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        id,
        relative,
        before ? hash(before) : null,
        hash(next),
        backup,
        "prepared",
        Date.now(),
      );
    try {
      const fd = fs.openSync(temp, "wx");
      try {
        fs.writeFileSync(fd, next, "utf8");
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      const live = fs.existsSync(full) ? fs.readFileSync(full) : null;
      if ((live ? hash(live) : null) !== (before ? hash(before) : null))
        throw new Error("FILE_EDIT_CONFLICT");
      if (!before) {
        fs.linkSync(temp, full);
        fs.unlinkSync(temp);
      } else fs.renameSync(temp, full);
      this.store.db
        .prepare("UPDATE sync_records SET status='applied' WHERE id=?")
        .run(id);
      return true;
    } catch (error) {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
      throw error;
    }
  }
  recover() {
    for (const row of this.store.db
      .prepare("SELECT * FROM sync_records WHERE status='prepared'")
      .all()) {
      const file = this.resolve(String(row.path));
      const current = fs.existsSync(file) ? hash(fs.readFileSync(file)) : null;
      const status =
        current === row.after_hash
          ? "applied"
          : current === row.before_hash
            ? "not-applied"
            : "conflict";
      this.store.db
        .prepare("UPDATE sync_records SET status=? WHERE id=?")
        .run(status, String(row.id));
    }
  }
  undo(id: string) {
    const row = this.store.db
      .prepare("SELECT * FROM sync_records WHERE id=? AND status='applied'")
      .get(id);
    if (!row) throw new Error("SYNC_RECORD_NOT_FOUND");
    const full = this.resolve(String(row.path));
    if (!fs.existsSync(full) || hash(fs.readFileSync(full)) !== row.after_hash)
      throw new Error("FILE_EDIT_CONFLICT");
    if (row.backup_path) {
      const bytes = fs.readFileSync(String(row.backup_path));
      if (hash(bytes) !== row.before_hash) throw new Error("BACKUP_MISMATCH");
      const temp = full + ".restore-" + randomUUID();
      fs.writeFileSync(temp, bytes, { flag: "wx" });
      fs.renameSync(temp, full);
    } else {
      const archive = path.join(this.root, "backups", "undo-" + id + ".md");
      fs.copyFileSync(full, archive, fs.constants.COPYFILE_EXCL);
      if (hash(fs.readFileSync(archive)) !== row.after_hash)
        throw new Error("BACKUP_MISMATCH");
      fs.unlinkSync(full);
    }
    this.store.db
      .prepare("UPDATE sync_records SET status='reverted' WHERE id=?")
      .run(id);
  }
}
