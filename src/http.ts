import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import type { DocsCatalog } from "./docs.js";
import { log } from "./logger.js";
import { createDocsMcpServer } from "./server.js";

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/**
 * MCP over Streamable HTTP on `/mcp`, stateless: one server and one transport per request. A request
 * from a web page of another origin is refused (DNS rebinding protection the MCP specification asks
 * of local servers); MCP clients send no Origin.
 */
export function createHttpApp(docs: DocsCatalog) {
  const app = new Hono();
  app.get("/", (c) => c.text("sinequa-docs MCP server: POST /mcp\n"));
  app.all("/mcp", async (c) => {
    const origin = c.req.header("origin");
    if (origin && !LOCAL_ORIGIN.test(origin)) return c.json({ error: "origin not allowed" }, 403);
    const server = createDocsMcpServer(docs);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    const response = await transport.handleRequest(c.req.raw);
    if (response.status >= 400) {
      const error = ((await response.clone().json().catch(() => ({}))) as { error?: { message?: string } }).error?.message;
      log.warn(`mcp: ${response.status} — ${error ?? response.statusText} (protocol ${c.req.header("mcp-protocol-version") ?? "none"})`);
    }
    return response;
  });
  return app;
}
