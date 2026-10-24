// Starts a built server over stdio, as an MCP client would, and calls each tool once.
//   npx tsx eval/stdio-smoke.ts                                  dist/cli.js
//   npx tsx eval/stdio-smoke.ts <dir>/sinequa-docs-mcp.mjs       the bundle, run from its own folder
import { dirname, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const server = resolve(process.argv[2] ?? "dist/cli.js");
const client = new Client({ name: "smoke", version: "0" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [server], cwd: dirname(server), stderr: "inherit" }));
console.log((await client.listTools()).tools.map((t) => t.name).join(", "));
const text = (r: unknown) => ((r as { content: { text: string }[] }).content[0].text);
const hits = JSON.parse(text(await client.callTool({ name: "docs_search", arguments: { query: "close a sheet", library: "galactik", limit: 2 } })));
console.log(hits.map((h: { url: string }) => h.url));
console.log(text(await client.callTool({ name: "docs_read", arguments: { page: hits[0].url } })).slice(0, 300));
console.log(JSON.parse(text(await client.callTool({ name: "docs_index", arguments: {} }))).length, "pages");
await client.close();
