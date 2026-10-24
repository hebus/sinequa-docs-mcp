#!/usr/bin/env node
import { serve } from "@hono/node-server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { DocsCatalog } from "./docs.js";
import { createHttpApp } from "./http.js";
import { log } from "./logger.js";
import { createDocsMcpServer } from "./server.js";

const config = loadConfig();
const docs = new DocsCatalog(config.libraries);
docs.warm();

if (config.transport === "stdio") {
  // The MCP client starts this process and talks over stdin/stdout: nothing else may write to stdout.
  await createDocsMcpServer(docs).connect(new StdioServerTransport());
} else {
  serve({ fetch: createHttpApp(docs).fetch, port: config.port, hostname: config.host }, () =>
    log.info(`sinequa-docs MCP server on http://${config.host}:${config.port}/mcp`),
  );
}
