import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type DocsCatalog, renderPage } from "./docs.js";

const json = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });
const markdown = (value: string) => ({ content: [{ type: "text" as const, text: value }] });

/** The MCP server: three tools over the published documentation of the libraries. */
export function createDocsMcpServer(docs: DocsCatalog): McpServer {
  const server = new McpServer({ name: "sinequa-docs", version: "0.1.0" });
  const names = docs.libraries.map((l) => l.name) as [string, ...string[]];
  const library = z.enum(names);
  const libraries = docs.libraries.map((l) => `${l.name} (${l.site}${l.prefix}/)`).join(", ");

  server.registerTool(
    "docs_search",
    {
      title: "Search the library docs",
      description: `Full-text search in the published documentation of ${libraries}. Returns the best sections (two per page at most) with their URL and path; read one with docs_read.`,
      inputSchema: {
        query: z.string().describe("Words or identifiers, e.g. 'suggest queries autocomplete' or 'createAtomicClient'"),
        library: library.optional().describe("Restrict to one library; all by default"),
        limit: z.number().int().min(1).max(25).optional(),
      },
    },
    async ({ query, library: name, limit = 8 }) => json(await docs.search(query, name, limit)),
  );

  server.registerTool(
    "docs_read",
    {
      title: "Read a documentation page",
      description:
        "A documentation page as Markdown, from its path or URL (as returned by docs_search or docs_index). A '#anchor' or 'section' returns that section only.",
      inputSchema: {
        page: z.string().describe("Path ('/docs/core/client'), path relative to a library ('auth/sign-in') or URL, optionally with '#anchor'"),
        section: z.string().optional().describe("Anchor or heading of one section"),
        library: library.optional().describe("Library the path belongs to, when two have the same path"),
      },
    },
    async ({ page: ref, section, library: name }) => {
      const found = await docs.find(ref, name);
      if (!found.page) return { ...markdown(`No page at "${ref}". List the pages with docs_index.`), isError: true };
      const wanted = section ?? found.section;
      const body = renderPage(found.page, wanted);
      if (body) return markdown(body);
      const anchors = found.page.sections.flatMap((s) => (s.anchor ? [s.anchor] : []));
      return { ...markdown(`No section "${wanted}" in ${found.page.url}. Its sections: ${anchors.join(", ")}`), isError: true };
    },
  );

  server.registerTool(
    "docs_index",
    {
      title: "List the documentation pages",
      description: `Table of contents of ${libraries}: title, path and one-line description of each page.`,
      inputSchema: { library: library.optional().describe("One library; all by default") },
    },
    async ({ library: name }) =>
      json((await docs.pages(name)).map((p) => ({ library: p.library, title: p.title, path: p.path, description: p.description }))),
  );

  return server;
}
