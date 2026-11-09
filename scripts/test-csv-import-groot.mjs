/** Vaste CSV-importproef voor #74; voer uit met node scripts/test-csv-import-groot.mjs. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { strFromU8, unzipSync } from "fflate";

const root = fileURLToPath(new URL("../", import.meta.url));
const server = await createServer({
  configFile: false,
  root,
  server: { middlewareMode: true },
  appType: "custom",
  optimizeDeps: { noDiscovery: true, include: [], entries: [] },
});
try {
  const { csvNaarXlsx, STANDAARD_INSTELLINGEN } = await server.ssrLoadModule(
    "/src/import/csvimport.ts",
  );
  const rijen = 100_000;
  const kolommen = 30;
  const rij = Array.from({ length: kolommen }, (_, k) =>
    k === 0 ? "0123" : "1",
  ).join(";");
  const bytes = new TextEncoder().encode((rij + "\n").repeat(rijen));
  const begin = performance.now();
  const resultaat = csvNaarXlsx(bytes, {
    ...STANDAARD_INSTELLINGEN,
    kopregel: false,
    scheidingsteken: ";",
  });
  const duur = performance.now() - begin;
  const pakket = unzipSync(resultaat.xlsx);
  const blad = strFromU8(pakket["xl/worksheets/sheet1.xml"]);
  assert.equal(resultaat.rijen, rijen);
  assert.equal(resultaat.kolommen, kolommen);
  assert.equal(resultaat.afgekapt, false);
  assert.ok(blad.includes('<c r="AD100000"><v>1</v></c>'));
  assert.ok(blad.includes('<c r="A1" t="s"><v>0</v></c>'));
  assert.ok(blad.includes('<c r="A100000" t="s"><v>0</v></c>'));
  assert.ok(
    strFromU8(pakket["xl/sharedStrings.xml"]).includes(
      '<t xml:space="preserve">0123</t>',
    ),
  );
  // De piek omvat ook de onafhankelijke controle van de uitgepakte XML.
  const rapport = {
    node: process.version,
    platform: process.platform,
    rijen,
    kolommen,
    csvBytes: bytes.length,
    xlsxBytes: resultaat.xlsx.length,
    importMs: Math.round(duur),
    maxRssKiB: process.resourceUsage().maxRSS,
    inhoudGecontroleerd: true,
  };
  const uitvoer = new URL("../.local/csv-import-groot/", import.meta.url);
  mkdirSync(uitvoer, { recursive: true });
  writeFileSync(
    new URL("rapport.json", uitvoer),
    JSON.stringify(rapport, null, 2) + "\n",
  );
  console.log(JSON.stringify(rapport));
} finally {
  await server.close();
}
