import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DocsCatalog, parseDocsLibrary } from "./docs.js";
import { createHttpApp } from "./http.js";

const LLMS_FULL = `# Principal store (/docs/lib/auth/principal-store)

The signed-in user's data.

## Pitfalls [#pitfalls]

Load it once.
`;

const fakeFetch = (async () => new Response(LLMS_FULL)) as unknown as typeof fetch;
const app = createHttpApp(new DocsCatalog([parseDocsLibrary("lib=https://docs.example/docs/lib/")], fakeFetch));

let id = 0;
async function rpc(method: string, params?: unknown) {
  const res = await app.request("/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  });
  assert.equal(res.status, 200);
  return ((await res.json()) as { result: { tools?: { name: string }[]; content?: { text: string }[]; isError?: boolean } }).result;
}

describe("docs MCP server", () => {
  test("lists the docs tools only", async () => {
    assert.deepEqual((await rpc("tools/list")).tools?.map((t) => t.name), ["docs_search", "docs_read", "docs_index"]);
  });

  test("searches and reads a section", async () => {
    const hits = JSON.parse((await rpc("tools/call", { name: "docs_search", arguments: { query: "load once" } })).content?.[0].text ?? "[]");
    assert.equal(hits[0].url, "https://docs.example/docs/lib/auth/principal-store/#pitfalls");
    const read = await rpc("tools/call", { name: "docs_read", arguments: { page: hits[0].url } });
    assert.match(read.content?.[0].text ?? "", /## Pitfalls\n\nLoad it once\./);
    const missing = await rpc("tools/call", { name: "docs_read", arguments: { page: "auth/principal-store", section: "nope" } });
    assert.equal(missing.isError, true);
    assert.match(missing.content?.[0].text ?? "", /Its sections: pitfalls/);
  });
});
