/** Onafhankelijke vergelijking: echte Rust-tekstcodec tegenover SDK insertText. */
import assert from "node:assert/strict";
import { vergelijkRevisies } from "../native/onderzoek/writer-plakbatch/revisie-identiteiten.mjs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createYrsSession, saveYrsDocx } from "@betteroffice/docx/yrs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const codec = resolve(process.argv[2] ?? "native/target/release/examples/tekst_protocol");
const map = resolve(process.argv[3] ?? ".local/proef-writer-rust-tekst-protocol");
await mkdir(map, { recursive: true });
const bytes = new Uint8Array(await readFile("docs/voorbeelden/Ontwerpnotitie.docx"));
const som = bytes => createHash("sha256").update(bytes).digest("hex");
function stand(s) { return Object.fromEntries(s.storyIds().sort().map(story => [story, s.storySegments(story)])); }
const gevallen = [
  { naam: "begin", offset: 0 }, { naam: "midden", offset: 7 }, { naam: "einde", offset: "einde" },
  { naam: "opmaakgrens", offset: 8 }, { naam: "spaties", offset: 5, text: "  twee  woorden  " },
  { naam: "unicode-voor", offset: 1, unicode: true },
  { naam: "unicode-na", offset: 3, unicode: true },
  { naam: "lege-alinea", offset: 0, leeg: true },
  { naam: "celtekst", offset: 1, cel: true },
  { naam: "celbegin", offset: 0, cel: true },
  { naam: "tabel-voor-tekst", offset: "span", laatste: true },
  { naam: "bladwijzer-begin", offset: 0, bookmark: true },
  { naam: "bladwijzer-midden", offset: 6, bookmark: true },
  { naam: "revisie-tekst", offset: 4, author: true },
  { naam: "vorige-revisie", offset: 3, author: true, vorige: true },
];
const rapport = {
  omvang: "Echte Rust-tekstcodec versus onafhankelijke SDK insertText; geen GUI- of snelheidsacceptatie.",
  codec_sha256: som(await readFile(codec)), gevallen: [],
};
for (const geval of gevallen) {
  const bron = await createYrsSession({ clientId: 11 });
  const referentie = await createYrsSession({ clientId: 21 });
  const native = await createYrsSession({ clientId: 31 });
  const resultaat = { naam: geval.naam };
  try {
    let bronbytes = bytes;
    if (geval.bookmark) {
      const pakket = unzipSync(bytes), origineel = strFromU8(pakket["word/document.xml"]);
      const xml = origineel.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:pPr>/,
        s => s + '<w:bookmarkStart w:id="99" w:name="Proefmarkering"/>')
        .replace("</w:p>", '<w:bookmarkEnd w:id="99"/></w:p>');
      assert.notEqual(xml, origineel);
      pakket["word/document.xml"] = strToU8(xml); bronbytes = zipSync(pakket);
    }
    bron.openDocx(bronbytes, true);
    const eerste = bron.paragraphs("body")[0];
    const punt = offset => ({ paraId: eerste.paraId, offset });
    // Ook gewiste CRDT-inhoud blijft in de snapshot aanwezig.
    bron.insertText({ story: "body", ...punt(0) }, "tijdelijk");
    bron.deleteRange({ story: "body", start: punt(0), end: punt(9) });
    if (geval.vorige) bron.insertText({ story: "body", ...punt(0) }, "Vorige ",
      { name: "Proefauteur", date: "2026-11-04T01:00:00Z" });
    if (geval.unicode) bron.insertText({ story: "body", ...punt(0) }, "A😀é ");
    bron.setHyperlink({ story: "body", start: punt(0), end: punt(8) },
      { href: "https://example.org/proef", tooltip: "Behouden koppeling" });
    bron.formatRange({ story: "body", start: punt(0), end: punt(8) },
      { bold: true, color: { rgb: "AB1234" } });
    if (geval.leeg) bron.deleteRange({ story: "body", start: punt(0),
      end: punt(bron.paragraphs("body")[0].text.length) });
    const story = geval.cel ? bron.storyIds().find(id => id.startsWith("body:")) : "body";
    assert.ok(story, "Een echte tabelcel moet aanwezig zijn");
    const p = geval.laatste ? bron.paragraphs(story).at(-1) : bron.paragraphs(story)[0];
    const offset = geval.offset === "span" ? bron.paragraphSpans(story).at(-1).length
      : geval.offset === "einde" ? p.text.length : geval.offset;
    if (geval.offset === "span") assert.ok(offset > p.text.length, "Leidende tabel telt in de positie mee");
    const position = { story, paraId: p.paraId, offset };
    const author = geval.author ? { name: "Proefauteur", date: "2026-11-04T02:00:00Z" } : undefined;
    const text = geval.text ?? "Nieuw é 😀";
    const snapshot = bron.encodeStateAsUpdate(), voor = stand(bron), bestaandeRevisies = new Set(bron.listRevisions().map(r => r.revisionId));
    for (const s of [referentie, native]) {
      s.openDocx(bronbytes, false); s.applyUpdate(snapshot);
      s.beginUndoCapture(); s.setUndoCaptureMode("manual"); s.addUndoBoundary();
      assert.deepEqual(stand(s), voor);
    }
    const r = referentie.insertText(position, text, author);
    const caret = r.range ? { story: r.range.story, ...r.range.end }
      : { ...position, offset: position.offset + text.length };
    referentie.addUndoBoundary();
    const aanvraag = { schema: 1, requestId: geval.naam, documentId: "proefdocument", sourceVersion: bron.version(),
      snapshotSha256: som(snapshot), snapshot: Buffer.from(snapshot).toString("base64"),
      clientId: referentie.clientId, position, text, author };
    const aanvraagpad = `${map}/${geval.naam}-aanvraag.json`, antwoordpad = `${map}/${geval.naam}-antwoord.json`;
    await writeFile(aanvraagpad, JSON.stringify(aanvraag));
    const proces = spawnSync(codec, [aanvraagpad, antwoordpad], { encoding: "utf8", timeout: 120000, maxBuffer: 1024 * 1024 });
    assert.equal(proces.status, 0, proces.stderr);
    const antwoord = JSON.parse(await readFile(antwoordpad));
    for (const veld of ["schema", "requestId", "documentId", "sourceVersion", "snapshotSha256", "clientId"])
      assert.equal(antwoord[veld], aanvraag[veld], `Bronbinding ${veld}`);
    native.applyLocalUpdate(Buffer.from(antwoord.delta, "base64")); native.addUndoBoundary();
    assert.deepEqual(bron.encodeStateAsUpdate(), snapshot, "Levende bron blijft ongewijzigd");
    const na = stand(referentie);
    await writeFile(`${map}/${geval.naam}-standen.json`, JSON.stringify({ referentie: na, native: stand(native) }));
    const nativeNa = stand(native), bijectie = vergelijkRevisies(na, nativeNa, bestaandeRevisies, referentie.clientId);
    resultaat.revisie_id_bijectie = bijectie;
    const terugId = new Map(bijectie.map(x => [x.native, x.referentie]));
    assert.deepEqual(native.listRevisions().map(r => ({...r, revisionId: terugId.get(r.revisionId) ?? r.revisionId})), referentie.listRevisions(), "Revisieauteurs, rollen, verhalen en bereiken");
    assert.deepEqual(antwoord.caret, caret, "UTF-16-cursor");
    for (const s of [referentie, native]) {
      assert.equal(s.undo(), true); assert.deepEqual(stand(s), voor, "Undo");
      assert.equal(s.redo(), true); assert.deepEqual(stand(s), s === native ? nativeNa : na, "Redo");
    }
    const a = (await saveYrsDocx(referentie, { updateModifiedDate: false })).bytes;
    const b = (await saveYrsDocx(native, { updateModifiedDate: false })).bytes;
    await writeFile(`${map}/${geval.naam}-referentie.docx`, a);
    await writeFile(`${map}/${geval.naam}-native.docx`, b);
    const za = unzipSync(a), zb = unzipSync(b);
    assert.deepEqual(Object.keys(zb).sort(), Object.keys(za).sort());
    for (const naam of Object.keys(za)) assert.deepEqual(zb[naam], za[naam], `DOCX-onderdeel ${naam}`);
    const heropend = await createYrsSession();
    try {
      heropend.openDocx(b, true);
      for (const id of native.storyIds()) assert.deepEqual(
        heropend.paragraphs(id).map(p => p.text), native.paragraphs(id).map(p => p.text), `Heropenen ${id}`);
    } finally { heropend.destroy(); }
    Object.assign(resultaat, { geslaagd: true, alle_verhalen_opmaak_identiteiten: true, cursor: true,
      undo_redo: true, docx_alle_onderdelen_exact: true, heropenen: true, voorbereiding_ms: antwoord.preparationMs });
  } catch (fout) { resultaat.geslaagd = false; resultaat.fout = String(fout); }
  finally {
    bron.destroy(); referentie.destroy(); native.destroy(); rapport.gevallen.push(resultaat);
    console.log(JSON.stringify(resultaat));
    await writeFile(`${map}/rapport.json`, JSON.stringify(rapport, null, 2) + "\n");
  }
}
rapport.geslaagd = rapport.gevallen.every(g => g.geslaagd);
await writeFile(`${map}/rapport.json`, JSON.stringify(rapport, null, 2) + "\n");
if (!rapport.geslaagd) process.exitCode = 1;
