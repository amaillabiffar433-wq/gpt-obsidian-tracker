import fs from "node:fs";
import path from "node:path";
import { loadConfig, PROJECT_ROOT } from "../apps/collector/src/config";
loadConfig();
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(
  PROJECT_ROOT,
  ".cache/browsers",
);
const { chromium } = await import("playwright");
const extension = path.join(PROJECT_ROOT, "apps/extension/dist");
const context = await chromium.launchPersistentContext(
  path.join(PROJECT_ROOT, "data/acceptance-browser"),
  {
    channel: "chromium",
    headless: false,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      "--remote-debugging-port=9331",
    ],
    viewport: null,
  },
);
const page = context.pages()[0] ?? (await context.newPage());
try {
  await page.goto("https://chatgpt.com/", {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
} catch {
  /* keep browser accessible for user */
}
fs.writeFileSync(
  path.join(PROJECT_ROOT, "work/live-browser.json"),
  JSON.stringify({
    url: page.url(),
    title: await page.title(),
    at: new Date().toISOString(),
    profile: "data/acceptance-browser",
    debugPort: 9331,
  }),
);
await page
  .screenshot({ path: path.join(PROJECT_ROOT, "work/live-browser.png") })
  .catch(() => {});
console.log(
  "ChatGPT 验收浏览器已打开；请用户登录并正常对话。不会自动发送提示词。",
);
await new Promise<void>((resolve) => context.on("close", () => resolve()));
