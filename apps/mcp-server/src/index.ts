import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Store } from "../../collector/src/database";
import { loadConfig, PROJECT_ROOT } from "../../collector/src/config";
import { query, toolNames } from "./queries";
const config = loadConfig();
const store = new Store(
  path.join(PROJECT_ROOT, "data/tracker.sqlite3"),
  path.join(PROJECT_ROOT, "apps/collector/migrations"),
  true,
);
const server = new McpServer({
  name: "gpt-obsidian-tracker",
  version: "0.1.0",
});
for (const name of toolNames)
  server.registerTool(
    name,
    {
      description:
        "只读查询本地 GPT 学习记录。未生成总结的内容不推断掌握程度。",
      inputSchema: {
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        query: z.string().max(200).optional(),
        category: z.string().max(100).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async (args) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(query(store, config.timezone, name, args)),
        },
      ],
    }),
  );
await server.connect(new StdioServerTransport());
