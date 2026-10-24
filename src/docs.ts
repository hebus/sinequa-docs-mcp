import { log } from "./logger.js";

/**
 * A published documentation library: a Fumadocs site and, inside it, the pages under `prefix`
 * (`https://hebus.github.io/atomic-angular-docs/docs/atomic-angular/` → site
 * `https://hebus.github.io/atomic-angular-docs`, prefix `/docs/atomic-angular`).
 */
export interface DocsLibrary {
  name: string;
  site: string;
  prefix: string;
}

export interface DocSection {
  heading: string;
  anchor?: string;
  /** 2 for `##`, 3 for `###`… 1 for the page's introduction, before its first heading. */
  level: number;
  text: string;
}

export interface DocPage {
  library: string;
  title: string;
  path: string;
  url: string;
  description: string;
  sections: DocSection[];
}

export interface DocHit {
  library: string;
  page: string;
  section?: string;
  url: string;
  path: string;
  snippet: string;
}

/** The `/docs` path segment — not the `//docs.` of a host name. */
const DOCS_SEGMENT = /\/docs(?=\/|$)/;

/** `name=https://site/docs/sub/` → a library; the part before `/docs/` is the site. */
export function parseDocsLibrary(spec: string): DocsLibrary {
  const [name, url] = spec.split(/=(.*)/s).map((s) => s.trim());
  const at = url?.search(DOCS_SEGMENT);
  if (!name || !url || at === undefined || at < 0) throw new Error(`DOCS_LIBRARIES: "${spec}" — expected name=https://<site>/docs/<section>/`);
  return { name, site: url.slice(0, at), prefix: url.slice(at).replace(/\/+$/, "") };
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** The MDX in `llms-full.txt` escapes some characters (`&#x60;` for a backtick). */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const PAGE = /^# (.+) \((\/docs(?:\/[^)]*)?)\)$/;
const HEADING = /^(#{2,4}) (.+?)(?: \[#([^\]]+)\])?$/;

/** Splits a Fumadocs `llms-full.txt` into pages, and pages into sections. Headings inside code fences are text. */
export function parseLlmsFull(raw: string, library: DocsLibrary): DocPage[] {
  const pages: DocPage[] = [];
  let page: DocPage | undefined;
  let section: DocSection | undefined;
  let lines: string[] = [];
  let fence: string | undefined;

  const closeSection = () => {
    if (section) section.text = lines.join("\n").trim();
    lines = [];
  };

  for (const line of decodeEntities(raw).split(/\r?\n/)) {
    const marker = /^\s*(```+|~~~+)/.exec(line)?.[1];
    if (marker && (!fence || marker.startsWith(fence))) fence = fence ? undefined : marker;
    const pageMatch = !fence && PAGE.exec(line);
    if (pageMatch) {
      closeSection();
      const path = pageMatch[2];
      page = { library: library.name, title: pageMatch[1], path, url: `${library.site}${path}/`, description: "", sections: [] };
      section = { heading: pageMatch[1], level: 1, text: "" };
      page.sections.push(section);
      pages.push(page);
      continue;
    }
    const headingMatch = !fence && page && HEADING.exec(line);
    if (headingMatch && page) {
      closeSection();
      section = { heading: headingMatch[2], anchor: headingMatch[3], level: headingMatch[1].length, text: "" };
      page.sections.push(section);
      continue;
    }
    if (page) lines.push(line);
  }
  closeSection();

  for (const p of pages) {
    p.description = p.sections[0]?.text.split(/\n\s*\n/)[0]?.trim() ?? "";
    p.sections = p.sections.filter((s) => s.level > 1 || s.text);
  }
  const inside = (path: string) => path === library.prefix || path.startsWith(`${library.prefix}/`);
  return pages.filter((p) => inside(p.path));
}

const STOPWORDS = new Set(
  "a an and are as at be by can do does for from how i in into is it my of on or that the this to what when where which with without".split(" "),
);

/** Plural and `-ies` endings folded, so `queries` finds `query` and `links` finds `link`. */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us")) return word.slice(0, -1);
  return word;
}

const WORD = /[\p{L}\p{N}_$@]+/gu;

/** Indexed terms: each word whole, plus the words of an identifier (`ThemeToggle` → `themetoggle`, `theme`, `toggle`). */
export function indexTerms(text: string): string[] {
  const out: string[] = [];
  for (const word of text.match(WORD) ?? []) {
    out.push(stem(word.toLowerCase()));
    const parts = word.split(/(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|_/).filter(Boolean);
    if (parts.length > 1) for (const p of parts) out.push(stem(p.toLowerCase()));
  }
  return out;
}

/** Query terms: whole words, stop words dropped (unless the query is nothing else). */
export function queryTerms(query: string): string[] {
  const words = (query.match(WORD) ?? []).map((w) => stem(w.toLowerCase()));
  const kept = words.filter((w) => !STOPWORDS.has(w));
  return [...new Set(kept.length ? kept : words)];
}

interface Field {
  weight: number;
  /** BM25 length normalization: 0 for short fields (titles), 0.75 for text. */
  b: number;
}

// Page title, the page path's words, the section heading, the section text.
export const FIELDS: Field[] = [
  { weight: 4, b: 0 },
  { weight: 2, b: 0 },
  { weight: 4, b: 0.3 },
  { weight: 1, b: 0.75 },
];
/** Ranking constants, tuned against `eval/queries.json` (`npm run eval`). */
export const RANKING = {
  k1: 1.2,
  /** Share of the page's own score added to each of its sections: a page about the subject beats a passing mention. */
  pageWeight: 0.6,
};
/** A term the docs never use whole matches the words it starts (`providestartup` → `providestartupaggregation`), this much. */
const PREFIX_WEIGHT = 0.5;

interface Doc {
  /** Term → occurrences, per field. */
  counts: Map<string, number>[];
  lengths: number[];
}

function makeDoc(fields: string[]): Doc {
  const counts = fields.map((f) => {
    const m = new Map<string, number>();
    for (const t of indexTerms(f)) m.set(t, (m.get(t) ?? 0) + 1);
    return m;
  });
  return { counts, lengths: fields.map((f) => (f.match(WORD) ?? []).length) };
}

/** BM25F over one collection of documents (the sections, or the pages). */
class Bm25 {
  private readonly avg: number[];
  private readonly df = new Map<string, number>();

  constructor(readonly docs: Doc[]) {
    this.avg = FIELDS.map((_, i) => docs.reduce((n, d) => n + d.lengths[i], 0) / Math.max(1, docs.length) || 1);
    for (const d of docs) for (const t of new Set(d.counts.flatMap((m) => [...m.keys()]))) this.df.set(t, (this.df.get(t) ?? 0) + 1);
  }

  get vocabulary(): Iterable<string> {
    return this.df.keys();
  }

  /** Adds each document's score for one query term, expanded to the vocabulary terms it matches (with their weight). */
  score(expansions: [string, number][], into: Float64Array, matched: Uint8Array): void {
    const n = this.docs.length;
    for (const [term, weight] of expansions) {
      const df = this.df.get(term) ?? 0;
      if (!df) continue;
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
      this.docs.forEach((d, i) => {
        let tf = 0;
        d.counts.forEach((m, f) => {
          const c = m.get(term);
          if (c) tf += (FIELDS[f].weight * c) / (1 - FIELDS[f].b + (FIELDS[f].b * d.lengths[f]) / this.avg[f]);
        });
        if (!tf) return;
        into[i] += weight * idf * ((tf * (RANKING.k1 + 1)) / (tf + RANKING.k1));
        matched[i] = 1;
      });
    }
  }
}

/** The search index of a set of pages: built once, queried many times. */
export class SearchIndex {
  private readonly units: { page: number; section: DocSection }[] = [];
  private readonly sections: Bm25;
  private readonly pagesBm25: Bm25;
  private readonly vocabulary: string[];
  private readonly known: Set<string>;

  constructor(readonly pages: DocPage[]) {
    const pathWords = (p: DocPage) => p.path.split("/").slice(-2).join(" ").replace(/-/g, " ");
    const sectionDocs: Doc[] = [];
    pages.forEach((page, i) =>
      page.sections.forEach((section) => {
        this.units.push({ page: i, section });
        sectionDocs.push(makeDoc([page.title, pathWords(page), section.level > 1 ? section.heading : "", section.text]));
      }),
    );
    this.sections = new Bm25(sectionDocs);
    this.pagesBm25 = new Bm25(
      pages.map((p) => makeDoc([p.title, pathWords(p), p.description, p.sections.map((s) => `${s.heading}\n${s.text}`).join("\n")])),
    );
    this.vocabulary = [...this.sections.vocabulary];
    this.known = new Set(this.vocabulary);
  }

  search(query: string, limit = 8, perPage = 2): DocHit[] {
    const terms = queryTerms(query);
    if (!terms.length) return [];
    const sectionScore = new Float64Array(this.units.length);
    const pageScore = new Float64Array(this.pages.length);
    // Terms each section (with its page title and path) holds: sections holding all of them come first.
    const coverage = new Float64Array(this.units.length);
    for (const term of terms) {
      const expansions: [string, number][] = [[term, 1]];
      // Only for a word the docs never use whole (a truncated identifier): a common word expanded is noise.
      if (term.length >= 4 && !this.known.has(term)) for (const v of this.vocabulary) if (v.startsWith(term)) expansions.push([v, PREFIX_WEIGHT]);
      const matched = new Uint8Array(this.units.length);
      this.sections.score(expansions, sectionScore, matched);
      this.pagesBm25.score(expansions, pageScore, new Uint8Array(this.pages.length));
      matched.forEach((m, i) => (coverage[i] += m));
    }
    const maxPage = Math.max(...pageScore, 1e-9);
    const maxSection = Math.max(...sectionScore, 1e-9);
    const ranked = this.units
      .map((u, i) => ({
        u,
        score: (sectionScore[i] / maxSection + (RANKING.pageWeight * pageScore[u.page]) / maxPage) * (coverage[i] / terms.length) ** 2,
      }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);

    const perPageCount = new Map<number, number>();
    const hits: DocHit[] = [];
    for (const { u } of ranked) {
      const count = perPageCount.get(u.page) ?? 0;
      if (count >= perPage) continue;
      perPageCount.set(u.page, count + 1);
      const page = this.pages[u.page];
      hits.push({
        library: page.library,
        page: page.title,
        section: u.section.level > 1 ? u.section.heading : undefined,
        url: u.section.anchor ? `${page.url}#${u.section.anchor}` : page.url,
        path: page.path,
        snippet: snippet(u.section.text || page.description, terms),
      });
      if (hits.length >= limit) break;
    }
    return hits;
  }
}

/** One-off search (builds the index): prefer a kept `SearchIndex` for repeated queries. */
export function searchSections(pages: DocPage[], query: string, limit = 8): DocHit[] {
  return new SearchIndex(pages).search(query, limit);
}

function snippet(text: string, terms: string[], width = 280): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const lower = flat.toLowerCase();
  const at = Math.min(...terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0), flat.length);
  const start = at >= flat.length ? 0 : Math.max(0, at - 80);
  return (start ? "…" : "") + flat.slice(start, start + width) + (start + width < flat.length ? "…" : "");
}

/** A page back as Markdown: the whole page, or one section by its anchor or heading. */
export function renderPage(page: DocPage, section?: string): string | undefined {
  const wanted = section?.replace(/^#/, "").toLowerCase();
  const parts = wanted
    ? sectionWithChildren(page.sections, (s) => s.anchor?.toLowerCase() === wanted || s.heading.toLowerCase() === wanted)
    : page.sections;
  if (!parts.length) return undefined;
  const body = parts.map((s) => (s.level > 1 ? `${"#".repeat(s.level)} ${s.heading}\n\n${s.text}` : s.text)).join("\n\n");
  return `# ${page.title}\n\nSource: ${page.url}\n\n${body}`.trim();
}

function sectionWithChildren(sections: DocSection[], isWanted: (s: DocSection) => boolean): DocSection[] {
  const start = sections.findIndex(isWanted);
  if (start < 0) return [];
  const end = sections.findIndex((s, i) => i > start && s.level <= sections[start].level);
  return sections.slice(start, end < 0 ? undefined : end);
}

type Fetch = typeof fetch;

/**
 * The libraries' pages, read from each site's `llms-full.txt` — one download per site, shared by the
 * libraries it holds — and kept `ttlMs`; a refresh asks with the ETag, so an unchanged site costs a 304.
 */
export class DocsCatalog {
  private readonly sites = new Map<string, { at: number; etag?: string; raw: string }>();
  private readonly pending = new Map<string, Promise<string>>();
  private readonly parsed = new Map<string, { raw: string; pages: DocPage[] }>();
  private readonly indexes = new Map<string, { pages: DocPage[]; index: SearchIndex }>();

  constructor(
    readonly libraries: DocsLibrary[],
    private readonly fetchFn: Fetch = fetch,
    private readonly ttlMs = 10 * 60_000,
  ) {}

  library(name: string): DocsLibrary | undefined {
    return this.libraries.find((l) => l.name === name);
  }

  async pages(name?: string): Promise<DocPage[]> {
    const libraries = name ? this.libraries.filter((l) => l.name === name) : this.libraries;
    const all = await Promise.all(
      libraries.map(async (l) => {
        const raw = await this.siteText(l.site);
        let parsed = this.parsed.get(l.name);
        // Parsed again only when the site's text changed.
        if (parsed?.raw !== raw) this.parsed.set(l.name, (parsed = { raw, pages: parseLlmsFull(raw, l) }));
        return parsed.pages;
      }),
    );
    return all.flat();
  }

  /** Searches one library, or all; the index is rebuilt only when a site's text changed. */
  async search(query: string, name?: string, limit?: number): Promise<DocHit[]> {
    return (await this.index(name)).search(query, limit);
  }

  private async index(name?: string): Promise<SearchIndex> {
    const pages = await this.pages(name);
    const key = name ?? "*";
    let cached = this.indexes.get(key);
    const same = cached && cached.pages.length === pages.length && cached.pages.every((p, i) => p === pages[i]);
    if (!cached || !same) this.indexes.set(key, (cached = { pages, index: new SearchIndex(pages) }));
    return cached.index;
  }

  /** A page by its path (`/docs/core/client`) or its URL, optionally with a `#section`. */
  async find(ref: string, name?: string): Promise<{ page?: DocPage; section?: string }> {
    const [pathPart, hash] = ref.trim().split("#");
    let path = pathPart;
    try {
      path = new URL(pathPart).pathname;
    } catch {
      /* a path, not a URL */
    }
    const at = path.search(DOCS_SEGMENT);
    const trimmed = path.replace(/^\/+|\/+$/g, "");
    const pages = await this.pages(name);
    // `auth/sign-in` is relative to a library's prefix.
    const matches = (p: DocPage) =>
      at >= 0 ? p.path === path.slice(at).replace(/\/+$/, "") : p.path === `${this.library(p.library)?.prefix}/${trimmed}`;
    return { page: pages.find(matches), section: hash || undefined };
  }

  /** Downloads the sites and builds the index in the background, so the first tool call does not wait. */
  warm(): void {
    this.index().then(
      (index) => log.info(`docs: ${index.pages.length} pages indexed (${this.libraries.map((l) => l.name).join(", ")})`),
      (err: unknown) => log.warn(`docs: ${err instanceof Error ? err.message : err}`),
    );
  }

  private siteText(site: string): Promise<string> {
    const cached = this.sites.get(site);
    if (cached && Date.now() - cached.at < this.ttlMs) return Promise.resolve(cached.raw);
    let pending = this.pending.get(site);
    if (!pending) {
      pending = this.download(site, cached).finally(() => this.pending.delete(site));
      this.pending.set(site, pending);
    }
    return pending;
  }

  private async download(site: string, cached?: { etag?: string; raw: string }): Promise<string> {
    try {
      const res = await this.fetchFn(`${site}/llms-full.txt`, { headers: cached?.etag ? { "if-none-match": cached.etag } : {} });
      if (res.status === 304 && cached) {
        this.sites.set(site, { ...cached, at: Date.now() });
        return cached.raw;
      }
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${site}/llms-full.txt`);
      const raw = await res.text();
      this.sites.set(site, { at: Date.now(), etag: res.headers.get("etag") ?? undefined, raw });
      return raw;
    } catch (err) {
      // Offline with a stale copy: better than nothing.
      if (cached) return cached.raw;
      throw err;
    }
  }
}
