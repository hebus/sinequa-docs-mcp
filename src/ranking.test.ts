import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DEFAULT_LIBRARIES, loadConfig } from "./config.js";
import { DocsCatalog, indexTerms, parseDocsLibrary, parseLlmsFull, queryTerms, SearchIndex } from "./docs.js";
import { createHttpApp } from "./http.js";

const library = parseDocsLibrary("lib=https://docs.example/docs/");

const LLMS_FULL = `# The client (/docs/core/client)

Create a client and keep it.

## Creating one [#creating-one]

Call createAtomicClient once; createAtomicClient returns the client.

## Options [#options]

createAtomicClient takes a backend URL.

# Several apps (/docs/integration/multiple-apps)

Two applications share a sign-in.

## Two applications [#two]

Each one calls createAtomicClient with its own app name, then signs in, then searches, then renders a long
list of results with many other words around the identifier so that this section is long.

# ThemeToggle (/docs/theme/theme-toggle)

A button switching between light and dark.

# Sponsored links (/docs/documents/sponsored-links)

Editorial links.
`;

const index = new SearchIndex(parseLlmsFull(LLMS_FULL, library));

describe("ranking", () => {
  test("identifiers are indexed whole and by their words; plurals fold", () => {
    assert.deepEqual(indexTerms("ThemeToggle"), ["themetoggle", "theme", "toggle"]);
    assert.deepEqual(indexTerms("XMLParser queries"), ["xmlparser", "xml", "parser", "query"]);
    assert.deepEqual(queryTerms("how to close a sheet"), ["close", "sheet"]);
    assert.deepEqual(queryTerms("the"), ["the"]);
  });

  test("the page about an identifier beats a passing mention", () => {
    assert.equal(index.search("createAtomicClient")[0].path, "/docs/core/client");
  });

  test("words of a query find an identifier, a plural finds the singular", () => {
    assert.equal(index.search("theme toggle")[0].path, "/docs/theme/theme-toggle");
    assert.equal(index.search("sponsored link")[0].path, "/docs/documents/sponsored-links");
  });

  test("a truncated identifier matches by prefix", () => {
    assert.equal(index.search("createAtomic")[0].path, "/docs/core/client");
  });

  test("two sections per page at most", () => {
    const hits = index.search("createAtomicClient", 10);
    assert.ok(hits.filter((h) => h.path === "/docs/core/client").length <= 2);
  });

  test("the catalog parses and indexes once while the site text is unchanged", async () => {
    let downloads = 0;
    const fakeFetch = (async () => (downloads++, new Response(LLMS_FULL))) as unknown as typeof fetch;
    const catalog = new DocsCatalog([library], fakeFetch);
    const first = await catalog.pages();
    await catalog.search("client");
    assert.equal(await catalog.pages().then((p) => p[0]), first[0]);
    assert.equal(downloads, 1);
  });
});

describe("config and HTTP", () => {
  test("galactik is a default library", () => {
    assert.match(DEFAULT_LIBRARIES, /galactik=/);
    const config = loadConfig([], {});
    assert.deepEqual(
      config.libraries.map((l) => l.name),
      ["atomic", "atomic-angular", "galactik"],
    );
    assert.equal(config.transport, "stdio");
    assert.equal(loadConfig(["--http", "--port=6000"], {}).port, 6000);
  });

  test("a web page of another origin is refused", async () => {
    const app = createHttpApp(new DocsCatalog([library], (async () => new Response(LLMS_FULL)) as unknown as typeof fetch));
    const res = await app.request("/mcp", { method: "POST", headers: { origin: "https://evil.example" } });
    assert.equal(res.status, 403);
  });
});
