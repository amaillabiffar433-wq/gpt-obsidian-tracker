import type { ActivitySample } from "../../../packages/shared/src/index";
declare const __COLLECTOR_TOKEN__: string;
declare const __COLLECTOR_PORT__: number;
const base = `http://127.0.0.1:${__COLLECTOR_PORT__}`;
let retryAt = 0,
  failures = 0;
async function clientId(tabId: number) {
  const stored = await chrome.storage.local.get("browserId");
  let id = stored.browserId as string | undefined;
  if (!id) {
    id = crypto.randomUUID();
    await chrome.storage.local.set({ browserId: id });
  }
  return `${id}:${tabId}`;
}
async function api(
  endpoint: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  if (Date.now() < retryAt) throw new Error("BACKOFF");
  try {
    const result = await fetch(base + endpoint, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${__COLLECTOR_TOKEN__}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (!result.ok) throw new Error("COLLECTOR_UNAVAILABLE");
    failures = 0;
    retryAt = 0;
    await chrome.storage.session.remove(["retryAt", "failures"]);
    return (await result.json()) as Record<string, unknown>;
  } catch (error) {
    failures++;
    retryAt = Date.now() + Math.min(60000, 1000 * 2 ** Math.min(failures, 6));
    await chrome.storage.session.set({ retryAt, failures });
    throw error;
  }
}
const restored = chrome.storage.session
  .get(["retryAt", "failures"])
  .then((x) => {
    retryAt = Number(x.retryAt ?? 0);
    failures = Number(x.failures ?? 0);
  });
function badge(text: "REC" | "PAUSE" | "OFF", tabId?: number) {
  void chrome.action.setBadgeText({ text, tabId });
  void chrome.action.setBadgeBackgroundColor({
    color: text === "REC" ? "#326747" : "#666666",
    tabId,
  });
}
chrome.runtime.onMessage.addListener(
  (
    message: { type: string; sample?: ActivitySample; action?: string },
    sender,
    respond,
  ) => {
    void (async () => {
      await restored;
      const tab =
        sender.tab ??
        (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
      if (!tab?.id) throw new Error("NO_TAB");
      const id = await clientId(tab.id);
      if (
        message.type === "sample" &&
        message.sample &&
        sender.tab &&
        /^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(sender.url ?? "")
      ) {
        const window = await chrome.windows.get(tab.windowId);
        const s = message.sample;
        const result = await api("/events", {
          ...s,
          clientId: id,
          visible: s.visible && !!tab.active,
          focused: s.focused && window.focused,
        });
        const localPause = await chrome.storage.local.get("paused");
        if (!!localPause.paused !== !!result.paused)
          await chrome.storage.local.set({ paused: !!result.paused });
        badge(
          result.paused || result.ignored || s.parserStatus !== "OK"
            ? "PAUSE"
            : result.recording
              ? "REC"
              : "OFF",
          tab.id,
        );
        return result;
      }
      if (sender.tab && !sender.url?.startsWith(chrome.runtime.getURL("")))
        throw new Error("INVALID_SENDER");
      if (message.type === "control") {
        const result = await api("/control", {
          action: message.action,
          clientId: id,
        });
        if (message.action === "pause" || message.action === "resume") {
          const paused = message.action === "pause";
          await chrome.storage.local.set({ paused });
          const tabs = await chrome.tabs.query({});
          for (const t of tabs) if (t.id) badge(paused ? "PAUSE" : "OFF", t.id);
        }
        return result;
      }
      if (message.type === "status")
        return api("/status?clientId=" + encodeURIComponent(id));
      throw new Error("INVALID_MESSAGE");
    })()
      .then(respond)
      .catch(() => {
        badge("OFF", sender.tab?.id);
        respond({ connected: false, error: "COLLECTOR_OFF" });
      });
    return true;
  },
);
chrome.tabs.onRemoved.addListener((tabId) => {
  void (async () => {
    await restored;
    await api("/control", {
      action: "finish",
      clientId: await clientId(tabId),
    });
  })().catch(() => {});
});
chrome.runtime.onInstalled.addListener(() => {
  badge("OFF");
  void chrome.alarms.create("health", { periodInMinutes: 1 });
});
chrome.alarms.onAlarm.addListener(() => {
  void (async () => {
    await restored;
    await api("/health");
  })().catch(() => {
    badge("OFF");
  });
});
