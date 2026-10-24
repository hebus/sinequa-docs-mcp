// Grid search over the ranking constants: the best MRR first.
import { readFileSync } from "node:fs";
import { DEFAULT_LIBRARIES } from "../src/config.js";
import { DocsCatalog, FIELDS, parseDocsLibrary, RANKING, SearchIndex } from "../src/docs.js";
const pages = await new DocsCatalog(DEFAULT_LIBRARIES.split(",").map(parseDocsLibrary)).pages();
const queries: { q: string; expect: string }[] = JSON.parse(readFileSync(new URL("./queries.json", import.meta.url), "utf8"));
const rows: string[] = [];
for (const pw of [0.3, 0.6, 1, 1.5, 2.5]) for (const tw of [2, 4, 6]) for (const hw of [1.5, 2.5, 4]) for (const pathw of [1, 2, 4]) {
  RANKING.pageWeight = pw; FIELDS[0].weight = tw; FIELDS[2].weight = hw; FIELDS[1].weight = pathw;
  const idx = new SearchIndex(pages);
  let t1 = 0, mrr = 0;
  for (const { q, expect } of queries) { const r = idx.search(q, 10).findIndex((h) => h.path === expect) + 1; if (r === 1) t1++; if (r) mrr += 1 / r; }
  rows.push(`${(mrr / queries.length).toFixed(3)} top1=${t1} page=${pw} title=${tw} heading=${hw} path=${pathw}`);
}
console.log(rows.sort().reverse().slice(0, 12).join("\n"));
