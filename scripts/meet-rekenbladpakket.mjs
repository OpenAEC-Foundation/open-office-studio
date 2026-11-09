/** #74: tijd/geheugen van metadata openen en schrijven op vaste referenties. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createServer } from "vite";
import { performance } from "node:perf_hooks";
const map = process.env.OOS_PRESTATIE_UIT ?? ".local/prestatie/rekenbladen";
const lader = await createServer({ configFile: false, appType: "custom", optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, hmr: false, watch: null } });
const { Pakket } = await lader.ssrLoadModule("/src/grafieken/pakket.ts");
const { leesAutoFilters } = await lader.ssrLoadModule("/src/lint/rekenblad-filter.ts");
const { zipDelen } = await lader.ssrLoadModule("/src/grafieken/zipdelen.ts");
const sha = (b) => createHash("sha256").update(b).digest("hex");
const rapport = [];
try {
  for (const fixture of JSON.parse(await readFile(`${map}/manifest.json`, "utf8"))) {
    const bytes = new Uint8Array(await readFile(`${map}/${fixture.bestand}`)); assert.equal(sha(bytes), fixture.sha256);
    global.gc?.(); const memory = process.memoryUsage(), start = performance.now();
    const p = new Pakket(bytes), wb = p.lees("xl/workbook.xml");
    p.schrijf("xl/workbook.xml", wb.replace("<workbookPr/>", '<workbookPr date1904="0"/>'));
    const nieuw = p.inpakken(), metaMs = performance.now() - start;
    const oudDeel = zipDelen(bytes).find((d) => d.naam === "xl/worksheets/sheet1.xml"), nieuwDeel = zipDelen(nieuw).find((d) => d.naam === oudDeel.naam);
    assert.equal(sha(oudDeel.lokaal), sha(nieuwDeel.lokaal), "Groot werkblad moet gecomprimeerd byte-gelijk blijven");
    const filterStart = performance.now(), filters = leesAutoFilters(nieuw), filterMs = performance.now() - filterStart;
    assert.equal(filters.get(0).bereik.bottom, fixture.rijen - 1);
    const na = process.memoryUsage();
    const meting = { ...fixture, metadataMs: Math.round(metaMs), filterMs: Math.round(filterMs), rssVoorMiB: Math.round(memory.rss / 1048576), rssNaMiB: Math.round(na.rss / 1048576), heapGroeiMiB: Math.round((na.heapUsed - memory.heapUsed) / 1048576), gecomprimeerdWerkbladBehouden: true };
    rapport.push(meting); console.log(JSON.stringify(meting));
    assert(metaMs < Number(process.env.OOS_METADATA_MAX_MS ?? 3000), "Metadata wijzigen overschrijdt de CI-grens");
    assert(filterMs < Number(process.env.OOS_FILTER_MAX_MS ?? 3000), "Filtermetadata lezen overschrijdt de CI-grens");
    assert(na.heapUsed - memory.heapUsed < 450 * 1048576, "Metadata gebruikt meer dan 450 MiB extra JS-heap");
  }
} finally { await writeFile(`${map}/pakket-rapport.json`, JSON.stringify(rapport, null, 2)); await lader.close(); }
