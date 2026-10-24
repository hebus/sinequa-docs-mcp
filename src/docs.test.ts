import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DocsCatalog, decodeEntities, parseDocsLibrary, parseLlmsFull, renderPage, searchSections } from "./docs.js";

const SITE = "https://docs.example/lib-docs";

const LLMS_FULL = `# Introduction (/docs/lib)

The business layer of the stack.

Some intro text.

# Sign In (/docs/lib/auth/sign-in)

Render the credentials form or drive the OAuth handshake.

## Credentials form [#credentials-form]

The form validates with Signal Forms and calls \`login&#x60;.

\`\`\`md
## Not a heading
# Not a page (/docs/lib/fake)
\`\`\`

### Errors [#errors]

A wrong password shows an inline error.

## OAuth [#oauth]

provideStartupAggregation is unrelated, but searchable.

# Other library (/docs/other)

Outside the prefix.
`;

const library = parseDocsLibrary(`lib=${SITE}/docs/lib/`);

describe("docs", () => {
  test("a library spec splits into site and prefix", () => {
    assert.deepEqual(library, { name: "lib", site: SITE, prefix: "/docs/lib" });
    assert.deepEqual(parseDocsLibrary(`all=${SITE}/docs/`).prefix, "/docs");
    assert.throws(() => parseDocsLibrary("nope"));
  });

  test("entities are decoded", () => {
    assert.equal(decodeEntities("a &#x60;b&#96; &amp; &#x2A;c&#x2A; &unknown;"), "a `b` & *c* &unknown;");
  });

  test("pages and sections come out of llms-full, code fences and other prefixes left alone", () => {
    const pages = parseLlmsFull(LLMS_FULL, library);
    assert.deepEqual(
      pages.map((p) => p.path),
      ["/docs/lib", "/docs/lib/auth/sign-in"],
    );
    const signIn = pages[1];
    assert.equal(signIn.url, `${SITE}/docs/lib/auth/sign-in/`);
    assert.equal(signIn.description, "Render the credentials form or drive the OAuth handshake.");
    assert.deepEqual(
      signIn.sections.map((s) => [s.heading, s.anchor, s.level]),
      [
        ["Sign In", undefined, 1],
        ["Credentials form", "credentials-form", 2],
        ["Errors", "errors", 3],
        ["OAuth", "oauth", 2],
      ],
    );
    assert.match(signIn.sections[1].text, /## Not a heading/);
    assert.match(signIn.sections[1].text, /`login`/);
  });

  test("search ranks the section holding every term, with its anchor URL", () => {
    const pages = parseLlmsFull(LLMS_FULL, library);
    const [first] = searchSections(pages, "wrong password");
    assert.equal(first.section, "Errors");
    assert.equal(first.url, `${SITE}/docs/lib/auth/sign-in/#errors`);
    assert.equal(searchSections(pages, "providestartup")[0].section, "OAuth");
    assert.deepEqual(searchSections(pages, "zzz"), []);
  });

  test("a section is rendered with its sub-sections, not the next sibling", () => {
    const [, signIn] = parseLlmsFull(LLMS_FULL, library);
    const body = renderPage(signIn, "credentials-form") ?? "";
    assert.match(body, /## Credentials form/);
    assert.match(body, /### Errors/);
    assert.doesNotMatch(body, /## OAuth/);
    assert.equal(renderPage(signIn, "missing"), undefined);
  });

  test("the catalog downloads once, finds pages by URL and revalidates with the ETag", async () => {
    const calls: (string | null)[] = [];
    const fakeFetch = (async (_url: string, init?: RequestInit) => {
      const etag = new Headers(init?.headers).get("if-none-match");
      calls.push(etag);
      if (etag === '"v1"') return new Response(null, { status: 304 });
      return new Response(LLMS_FULL, { headers: { etag: '"v1"' } });
    }) as typeof fetch;
    const catalog = new DocsCatalog([library], fakeFetch, 0);

    const found = await catalog.find(`${SITE}/docs/lib/auth/sign-in/#oauth`);
    assert.equal(found.page?.title, "Sign In");
    assert.equal(found.section, "oauth");
    assert.equal((await catalog.find("auth/sign-in")).page?.title, "Sign In");
    await catalog.pages();
    assert.deepEqual(calls, [null, '"v1"', '"v1"']);
  });
});
