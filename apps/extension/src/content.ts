import { parsePage } from "../../../packages/chatgpt-parser/src/index";
import type { ActivitySample } from "../../../packages/shared/src/index";
let lastInteraction = 0,
  lastKeyboard = 0,
  lastAssistantFinished = 0,
  wasGenerating = false;
let inFlight = false,
  lastSent = 0,
  pending = false;
let urgentPending = false;
let conversation = "",
  seen = new Map<string, string>();
const ephemeralId = "new-" + crypto.randomUUID();
let paused = false;
void chrome.storage.local.get("paused").then((x) => {
  paused = !!x.paused;
});
chrome.storage.onChanged.addListener((changes) => {
  if (changes.paused) {
    paused = !!changes.paused.newValue;
    seen.clear();
  }
});
function interact(event: Event) {
  if (!event.isTrusted) return;
  lastInteraction = Date.now();
  if (event.type === "keydown" || event.type === "input")
    lastKeyboard = lastInteraction;
  schedule();
}
for (const name of ["keydown", "input", "pointerdown", "pointermove", "scroll"])
  document.addEventListener(name, interact, { capture: true, passive: true });
function schedule() {
  if (pending) return;
  pending = true;
  setTimeout(() => {
    pending = false;
    void sample();
  }, 800);
}
async function sample(kind: ActivitySample["kind"] = "sample", urgent = false) {
  if (inFlight) {
    if (urgent) urgentPending = true;
    return;
  }
  if (!urgent && kind === "sample" && Date.now() - lastSent < 900) return;
  inFlight = true;
  try {
    const page = parsePage(document, location.href, ephemeralId);
    if (page.conversationId !== conversation) {
      conversation = page.conversationId;
      seen = new Map();
      wasGenerating = false;
      lastAssistantFinished = 0;
    }
    if (wasGenerating && !page.generating) lastAssistantFinished = Date.now();
    wasGenerating = page.generating;
    const changed = paused
      ? []
      : page.messages.filter((m) => seen.get(m.id) !== m.content);
    const at = Date.now();
    const result = (await chrome.runtime.sendMessage({
      type: "sample",
      sample: {
        eventId: crypto.randomUUID(),
        clientId: "worker-assigned",
        conversationId: conversation,
        title: page.title,
        url: location.href,
        at,
        visible: !document.hidden,
        focused: document.hasFocus(),
        generating: page.generating,
        lastInteraction,
        lastKeyboard,
        lastAssistantFinished,
        parserStatus: page.status,
        messages: changed,
        kind,
      } satisfies ActivitySample,
    })) as {
      error?: string;
      paused?: boolean;
      ignored?: boolean;
      recording?: boolean;
    };
    lastSent = at;
    if (!result.error && !result.paused && !result.ignored && result.recording)
      for (const m of changed) seen.set(m.id, m.content);
    if (!result.recording) seen.clear();
  } catch {
    /* Parser/runtime isolation. Next heartbeat retries with current DOM. */
  } finally {
    inFlight = false;
    if (urgentPending) {
      urgentPending = false;
      void sample("sample", true);
    }
  }
}
new MutationObserver(schedule).observe(document.documentElement, {
  childList: true,
  subtree: true,
  characterData: true,
  attributes: true,
  attributeFilter: [
    "data-is-streaming",
    "aria-busy",
    "data-message-author-role",
  ],
});
document.addEventListener("visibilitychange", () => {
  void sample("sample", true);
});
window.addEventListener("blur", () => {
  void sample("sample", true);
});
window.addEventListener("focus", () => {
  void sample("sample", true);
});
window.addEventListener("pagehide", () => {
  void sample("leave", true);
});
window.addEventListener("popstate", schedule);
setInterval(() => {
  void sample();
}, 5000);
void sample();
