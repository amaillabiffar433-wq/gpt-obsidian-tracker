import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { parsePage } from "../packages/chatgpt-parser/src/index";
const html = (content = "解释偏导", assistant = "偏导固定其他变量") =>
  `<title>雅可比 - ChatGPT</title><main><article data-testid="conversation-turn-0"><div data-message-id="u1" data-message-author-role="user"><div class="whitespace-pre-wrap">${content}</div></div></article><article data-testid="conversation-turn-1"><div data-message-id="a1" data-message-author-role="assistant"><div class="markdown">${assistant}</div></div></article></main>`;
const parse = (markup = html(), url = "https://chatgpt.com/c/abc") =>
  parsePage(new JSDOM(markup).window.document, url, "new-test");
describe("semantic ChatGPT parser", () => {
  it("extracts both roles and title", () => {
    const p = parse();
    expect(p.messages.map((x) => x.role)).toEqual(["user", "assistant"]);
    expect(p.title).toBe("雅可比");
  });
  it("retains stable IDs across refresh", () =>
    expect(parse().messages.map((x) => x.id)).toEqual(
      parse().messages.map((x) => x.id),
    ));
  it("holds streaming assistant until finished", () => {
    expect(
      parse(html() + '<button data-testid="stop-button"></button>').messages,
    ).toHaveLength(1);
    expect(parse().messages).toHaveLength(2);
  });
  it("regenerated message with new ID remains a distinct revision", () => {
    expect(parse(html().replace("a1", "a2")).messages[1].id).not.toBe(
      parse().messages[1].id,
    );
  });
  it("edited user keeps ID and updates text", () => {
    const a = parse(),
      b = parse(html("重新解释"));
    expect(a.messages[0].id).toBe(b.messages[0].id);
    expect(b.messages[0].content).toBe("重新解释");
  });
  it("switches conversation ID on SPA URL", () =>
    expect(
      parse(html(), "https://chatgpt.com/c/next").messages.every(
        (m) => m.conversationId === "next",
      ),
    ).toBe(true));
  it("new blank conversation is valid with composer", () =>
    expect(
      parse('<div id="prompt-textarea"></div>', "https://chatgpt.com/").status,
    ).toBe("OK"));
  it("supports labelled turn fallback", () => {
    const p = parse(
      '<article data-testid="conversation-turn-1" data-turn="assistant"><div class="markdown">答案</div></article>',
    );
    expect(p.status).toBe("OK");
    expect(p.messages[0].content).toBe("答案");
  });
  it("uses semantic headings if turn role absent", () => {
    const p = parse(
      '<article data-testid="conversation-turn-1"><h6>ChatGPT said:</h6><div class="markdown">答案</div></article>',
    );
    expect(p.messages[0].role).toBe("assistant");
  });
  it("unknown roles fail closed", () =>
    expect(
      parse('<article data-testid="conversation-turn-0">unknown</article>')
        .messages,
    ).toEqual([]));
  it("missing stable ID fails closed", () =>
    expect(
      parse('<div data-message-author-role="user">hello</div>').status,
    ).toBe("PARSER_DEGRADED"));
  it("does not modify original DOM", () => {
    const d = new JSDOM(html() + "<button>unchanged</button>").window.document;
    const before = d.documentElement.outerHTML;
    parsePage(d, "https://chatgpt.com/c/abc");
    expect(d.documentElement.outerHTML).toBe(before);
  });
  it("local DOM reload preserves IDs", () => {
    const d = new JSDOM(html()).window.document;
    const before = parsePage(d, "https://chatgpt.com/c/abc");
    d.body.innerHTML = html();
    expect(
      parsePage(d, "https://chatgpt.com/c/abc").messages.map((x) => x.id),
    ).toEqual(before.messages.map((x) => x.id));
  });
  it("new follow-up is collected without renumbering previous messages", () =>
    expect(
      parse(
        html() +
          '<div data-message-id="u2" data-message-author-role="user">下一题</div>',
      ).messages,
    ).toHaveLength(3));
  it("rejects non-ChatGPT origins", () =>
    expect(parse(html(), "https://example.com/c/abc").status).toBe(
      "PARSER_DEGRADED",
    ));
});
