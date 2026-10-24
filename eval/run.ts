// Ranking check against the published docs: rank of the expected page for each query.
import { readFileSync } from "node:fs";
import { DEFAULT_LIBRARIES } from "../src/config.js";
import { DocsCatalog, parseDocsLibrary, SearchIndex } from "../src/docs.js";

const catalog = new DocsCatalog(DEFAULT_LIBRARIES.split(",").map(parseDocsLibrary));
const pages = await catalog.pages();
const index = new SearchIndex(pages);
const paths = new Set(pages.map((p) => p.path));
const queries: { q: string; expect: string }[] = JSON.parse(readFileSync(new URL("./queries.json", import.meta.url), "utf8"));
let top1 = 0, top3 = 0, mrr = 0;
for (const { q, expect } of queries) {
  if (!paths.has(expect)) { console.log(`?? ${q}: ${expect} not published`); continue; }
  const hits = index.search(q, 10);
  const rank = hits.findIndex((h) => h.path === expect) + 1;
  if (rank === 1) top1++;
  if (rank && rank <= 3) top3++;
  if (rank) mrr += 1 / rank;
  console.log(`${rank === 1 ? "ok" : rank ? `#${rank}` : "--"}  ${q.padEnd(30)} → ${hits[0]?.path ?? "-"}${hits[0]?.section ? ` › ${hits[0].section}` : ""}`);
}
console.log(`\ntop1 ${top1}/${queries.length}  top3 ${top3}/${queries.length}  MRR ${(mrr / queries.length).toFixed(3)}  (${pages.length} pages)`);
