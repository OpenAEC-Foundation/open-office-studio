/** Regressie: watermerken mogen geen onbekende koptekstverhalen maken. */
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "vite";
import { parseDocx, getDocumentWatermark, setDocumentWatermark } from "@betteroffice/docx/docx";
import { createYrsSession, saveYrsDocx } from "@betteroffice/docx/yrs";
import { unzipSync, strFromU8 } from "fflate";

const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] }, appType: "custom" });
const uit = ".local/writer-regressies";
await mkdir(uit, { recursive: true });
try {
  const { zorgVoorWatermerkKoppen } = await server.ssrLoadModule("/src/tekst/pagina/kopvoet.ts");
  const bron = new Uint8Array(await readFile("docs/voorbeelden/Ontwerpnotitie.docx"));
  const voorbereid = zorgVoorWatermerkKoppen(bron);
  assert.ok(voorbereid, "het koptekstloze voorbeeld krijgt eerst een echte koptekst");
  assert.equal(zorgVoorWatermerkKoppen(voorbereid), null, "een bestaande koptekst wordt niet dubbel aangemaakt");
  const watermerk = { kind: "text", text: "CONCEPT", font: "Carlito", color: "#808080", semitransparent: true, layout: "diagonal" };
  const doc = await parseDocx(voorbereid);
  const gemarkeerd = setDocumentWatermark(doc, watermerk);
  assert.ok(getDocumentWatermark(gemarkeerd));
  const sessie = await createYrsSession();
  try {
    sessie.openDocx(voorbereid, true);
    const ids = [...gemarkeerd.package.headers.keys()];
    assert.ok(ids.length);
    for (const id of ids) assert.doesNotThrow(() => sessie.paragraphs(`hf:${id}`), `koptekst ${id} is in de bewerksessie bekend`);
    const p = sessie.paragraphs("body")[4];
    sessie.insertPageBreak({ story: "body", paraId: p.paraId, offset: 0 });
    const opgeslagen = (await saveYrsDocx(sessie)).bytes;
    await writeFile(`${uit}/voorbereid-met-paginaeinde.docx`, opgeslagen);
    const xml = strFromU8(unzipSync(opgeslagen)["word/document.xml"]);
    assert.match(xml, /w:type="page"/);
    const terug = await createYrsSession();
    try {
      terug.openDocx(opgeslagen, true);
      for (const id of ids) assert.doesNotThrow(() => terug.paragraphs(`hf:${id}`));
    } finally { terug.destroy?.(); }
    console.log("OK: koptekst voorbereiden, watermerkverwijzingen, pagina-einde, opslaan en heropenen.");
  } finally { sessie.destroy?.(); }
} finally { await server.close(); }
