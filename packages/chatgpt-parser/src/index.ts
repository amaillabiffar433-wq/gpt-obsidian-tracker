import type { ChatMessage } from "../../shared/src/index";
export interface ParsedPage {
  conversationId: string;
  title: string;
  generating: boolean;
  messages: ChatMessage[];
  status: "OK" | "PARSER_DEGRADED";
}
const roleSelector =
  '[data-message-author-role="user"], [data-message-author-role="assistant"]';
export function parsePage(
  doc: Document,
  href: string,
  newId = "new",
): ParsedPage {
  const fallback: ParsedPage = {
    conversationId: newId,
    title: "ChatGPT",
    generating: false,
    messages: [],
    status: "PARSER_DEGRADED",
  };
  try {
    const url = new URL(href);
    if (!["chatgpt.com", "chat.openai.com"].includes(url.hostname))
      return fallback;
    const id = url.pathname.match(/\/c\/([\w-]+)/)?.[1] ?? newId;
    const generating = !!doc.querySelector(
      '[data-testid="stop-button"],button[aria-label="Stop generating"],button[aria-label="停止生成"],[data-is-streaming="true"]',
    );
    let nodes = [...doc.querySelectorAll<HTMLElement>(roleSelector)];
    if (!nodes.length)
      nodes = [
        ...doc.querySelectorAll<HTMLElement>(
          'article[data-testid^="conversation-turn-"], [role="article"][data-turn]',
        ),
      ];
    const messages: ChatMessage[] = [];
    let unsafe = false;
    for (const [index, node] of nodes.entries()) {
      const labelled =
        node.getAttribute("data-message-author-role") ??
        node.getAttribute("data-turn");
      const heading = node
        .querySelector("h5,h6,[data-role-label]")
        ?.textContent?.trim();
      const role =
        labelled === "user" || labelled === "assistant"
          ? labelled
          : /^(You said:|你说：|您说：)$/.test(heading ?? "")
            ? "user"
            : /^(ChatGPT said:|ChatGPT 说：)$/.test(heading ?? "")
              ? "assistant"
              : null;
      if (!role) {
        unsafe = true;
        continue;
      }
      const container = node.closest('[data-testid^="conversation-turn-"]');
      const stable =
        node.getAttribute("data-message-id") ??
        node
          .querySelector("[data-message-id]")
          ?.getAttribute("data-message-id") ??
        container?.getAttribute("data-testid") ??
        node.getAttribute("data-testid");
      if (!stable) {
        unsafe = true;
        continue;
      }
      if (role === "assistant" && generating && index === nodes.length - 1)
        continue;
      const body =
        node.querySelector<HTMLElement>(
          "[data-message-content],.markdown,.whitespace-pre-wrap",
        ) ?? (labelled ? node : null);
      if (!body) {
        unsafe = true;
        continue;
      }
      // Clone in memory only: never alter the live ChatGPT DOM.
      const clone = body.cloneNode(true) as HTMLElement;
      clone
        .querySelectorAll('button,script,style,[aria-hidden="true"]')
        .forEach((n) => n.remove());
      const content = (clone.textContent ?? "").trim();
      if (!content) continue;
      messages.push({
        id: `${role}:${stable}`,
        conversationId: id,
        role,
        content,
        createdAt: new Date().toISOString(),
        sequence: index,
      });
    }
    const newChat =
      !url.pathname.includes("/c/") &&
      !!doc.querySelector(
        '#prompt-textarea,[contenteditable="true"][role="textbox"],textarea',
      );
    const status =
      unsafe || (!nodes.length && !newChat) ? "PARSER_DEGRADED" : "OK";
    return {
      conversationId: id,
      title:
        doc.title.replace(/\s*[-–|]\s*ChatGPT\s*$/, "").trim() || "ChatGPT",
      generating,
      messages: status === "OK" ? messages : [],
      status,
    };
  } catch {
    return fallback;
  }
}
