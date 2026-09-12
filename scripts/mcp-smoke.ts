import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs";
import path from "node:path";
import { PROJECT_ROOT } from "../apps/collector/src/config";
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(PROJECT_ROOT, "dist/mcp-server.js")],
  env: {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (pair): pair is [string, string] => typeof pair[1] === "string",
      ),
    ),
    TRACKER_ROOT: PROJECT_ROOT,
  },
  stderr: "pipe",
});
const client = new Client({ name: "tracker-smoke", version: "0.1.0" });
await client.connect(transport);
try {
  const list = await client.listTools();
  if (list.tools.length !== 8) throw Error("MCP_TOOLS_MISSING");
  const results = [];
  for (const t of list.tools) {
    const result = await client.callTool({ name: t.name, arguments: {} });
    if (result.isError) throw Error("MCP_TOOL_FAILED: " + t.name);
    results.push({ name: t.name, passed: true });
  }
  const report = {
    protocolHandshake: true,
    readOnlyTools: 8,
    results,
    passed: true,
  };
  fs.writeFileSync(
    path.join(PROJECT_ROOT, "work/mcp-smoke.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  await client.close();
}
