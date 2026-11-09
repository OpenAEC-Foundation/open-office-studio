/** Real DOCX → ODT → DOCX corpus, including production Yrs save/reopen.
 * OPENAEC_CONVERSIE_PROGRAMMA must name a trusted LibreOffice executable.
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";
import { strFromU8, strToU8, zipSync, unzipSync } from "fflate";
import { writerFixture } from "./writer-proeffixture.mjs";
import { openProductieTekstkern } from "./tekstkern-productieproef.mjs";

const programma = process.env.OPENAEC_CONVERSIE_PROGRAMMA;
assert.ok(
  programma,
  "Set OPENAEC_CONVERSIE_PROGRAMMA to the conversion executable",
);
const uit = resolve(process.env.OFFICE_TEST_UIT ?? ".local/proef-writer-odt");
await mkdir(resolve(uit, "profiel/user"), { recursive: true });
await copyFile(
  "src-tauri/src/conversieprofiel.xcu",
  resolve(uit, "profiel/user/registrymodifications.xcu"),
);
const voerUit = promisify(execFile),
  profiel = pathToFileURL(resolve(uit, "profiel")).href;
const ssr = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true },
  appType: "custom",
});
const behoud = await ssr.ssrLoadModule("/src/tekst/behoud/odt.ts"),
  pagina = await ssr.ssrLoadModule("/src/tekst/pagina/ooxml.ts"),
  noten = await ssr.ssrLoadModule("/src/tekst/pagina/noten.ts"),
  sx = await ssr.ssrLoadModule("/src/tekst/stijlen/stijlenxml.ts"),
  sp = await ssr.ssrLoadModule("/src/tekst/stijlen/pakket.ts"),
  sb = await ssr.ssrLoadModule("/src/tekst/stijlen/beheer.ts");
const productie = await openProductieTekstkern(resolve(uit, "vite-cache"));
// Exercise the actual application wrapper; only the IPC transport is replaced
// by the same trusted conversion executable used by the desktop command.
const formaten = await ssr.ssrLoadModule("/src/formaten.ts");
globalThis.window = {
  __TAURI_INTERNALS__: {
    invoke: async (command, bytes, options) => {
      assert.equal(command, "converteer_document");
      assert.equal(options.headers["x-office-module"], "docx");
      return converteer(
        bytes,
        options.headers["x-office-bron"],
        options.headers["x-office-doel"],
      );
    },
  },
};
const rapport = { proeven: [], fouten: [], kern: productie.kernen };
let nummer = 0;
async function converteer(bytes, van, naar) {
  const map = resolve(uit, `stap-${++nummer}`);
  await mkdir(map, { recursive: true });
  const bron = resolve(map, `Document.${van}`),
    doel = resolve(map, `Document.${naar}`);
  await writeFile(bron, bytes);
  const filter = naar === "odt" ? "writer8" : "Office Open XML Text";
  const { stdout, stderr } = await voerUit(
    programma,
    [
      `-env:UserInstallation=${profiel}`,
      "--headless",
      "--nologo",
      "--nodefault",
      "--norestore",
      "--convert-to",
      `${naar}:${filter}`,
      "--outdir",
      map,
      bron,
    ],
    {
      timeout: 120000,
      windowsHide: true,
      env: {
        ...process.env,
        SAL_DISABLE_DEFAULTPRINTER: "1",
        SAL_DISABLE_PRINTERLIST: "1",
      },
      maxBuffer: 2 * 1024 * 1024,
    },
  );
  if (stderr.trim()) console.log(stderr.trim());
  console.log(stdout.trim());
  return new Uint8Array(await readFile(doel));
}
function properties(bytes) {
  const z = new pagina.Pakket(bytes),
    doc = pagina.openDocument(z),
    styles = sx.leesStijlen(z.lees("word/styles.xml"));
  return {
    sections: pagina
      .secties(doc)
      .map((_, i) => ({
        footnote: noten.leesNootInstellingen(bytes, "voetnoot", i),
        endnote: noten.leesNootInstellingen(bytes, "eindnoot", i),
      })),
    styles: styles
      .filter((s) =>
        [
          "EigenTabel",
          "CorpusParagraph",
          "CorpusCharacter",
          "CorpusNumbering",
        ].includes(s.styleId),
      )
      .map((s) => ({
        id: s.styleId,
        type: s.soort,
        properties: {
          ...s.eigenschappen,
          lijst: s.eigenschappen.lijst
            ? { ...s.eigenschappen.lijst, numId: "remapped" }
            : undefined,
        },
      })),
    tableStyles: pagina
      .zoekAlle(doc.wortel, "tblStyle")
      .map((e) => pagina.attr(e, "val")),
    noteTexts: noten.leesNoten(bytes).map((n) => n.tekst.trim()),
    xml: doc.xml,
  };
}
async function engineRondgang(bytes, naam) {
  const s = await productie.sdk.createYrsSession();
  try {
    s.openDocx(bytes, true);
    const ids = s.storyIds().filter((id) => /^fn:|^en:/.test(id));
    assert.equal(ids.length, 6);
    for (const id of ids)
      assert.ok(s.paragraphs(id).some((p) => p.text.trim()));
    const para =
      s.paragraphs("fn:2")[0] ??
      s.paragraphs(ids.find((id) => id.startsWith("fn:")))[0];
    const story = s.paragraphs("fn:2").length
      ? "fn:2"
      : ids.find((id) => id.startsWith("fn:"));
    s.insertText(
      { story, paraId: para.paraId, offset: para.text.length },
      " ENGINE_EDIT",
    );
    s.addUndoBoundary();
    const saved = (await productie.sdk.saveYrsDocx(s)).bytes;
    await writeFile(resolve(uit, `${naam}-engine.docx`), saved);
    const again = await productie.sdk.createYrsSession();
    try {
      again.openDocx(saved, true);
      assert.ok(
        again.paragraphs(story).some((p) => p.text.includes("ENGINE_EDIT")),
      );
    } finally {
      again.destroy();
    }
    return saved;
  } finally {
    s.destroy();
  }
}
try {
  let source = sp.bewerkStijlOnderdelen(writerFixture(), (o) => {
    let xml = o.stijlen;
    for (const [naam, soort] of [
      ["CorpusParagraph", "paragraph"],
      ["CorpusCharacter", "character"],
      ["CorpusNumbering", "numbering"],
    ])
      xml = sx.nieuweStijl(xml, {
        naam,
        soort,
        eigenschappen: {
          lettertype: "Carlito",
          grootte: 13,
          vet: true,
          kleur: "225588",
          taal: "nl-NL",
          tabs: [{ position: 1440, alignment: "right", leader: "dot" }],
          randen: { bottom: { style: "double", size: 8 } },
        },
      }).xml;
    return { stijlen: xml };
  });
  source = sb.maakLijstStijl(source, {
    styleId: "CorpusNumbering",
    format: "lowerRoman",
    start: 4,
  });
  const z = new pagina.Pakket(source),
    num = sx
      .leesStijlen(z.lees("word/styles.xml"))
      .find((s) => s.styleId === "CorpusNumbering").eigenschappen.lijst.numId;
  z.schrijf(
    "word/document.xml",
    z
      .lees("word/document.xml")
      .replace(
        "<w:r><w:t>SectionOne",
        '<w:r><w:rPr><w:rStyle w:val="CorpusCharacter"/></w:rPr><w:t>SectionOne',
      )
      .replace(
        /(<w:sectPr>)(?![\s\S]*<w:sectPr>)/,
        `<w:p><w:pPr><w:pStyle w:val="CorpusParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${num}"/></w:numPr></w:pPr><w:r><w:t>List entry</w:t></w:r></w:p>$1`,
      ),
  );
  source = z.inpakken();
  for (const [naam, bytes] of [
    ["sections", source],
    [
      "per-page",
      noten.zetNootInstellingen(
        source,
        "voetnoot",
        {
          notatie: "decimal",
          beginBij: 1,
          herstart: "eachPage",
          positie: "pageBottom",
        },
        "alle",
      ),
    ],
  ]) {
    await writeFile(resolve(uit, `${naam}-source.docx`), bytes);
    const odt = await formaten.converteer(bytes, "docx", "odt", "docx");
    await writeFile(resolve(uit, `${naam}.odt`), odt);
    const oz = unzipSync(odt);
    oz["content.xml"] = strToU8(
      strFromU8(oz["content.xml"])
        .replace("SectionOne", "Edited SectionOne")
        .replace("footnote_1", "Edited footnote_1"),
    );
    const edited = zipSync(oz);
    const restored = await formaten.converteer(edited, "odt", "docx", "docx");
    await writeFile(resolve(uit, `${naam}-restored.docx`), restored);
    const before = properties(bytes),
      after = properties(restored);
    assert.deepEqual(after.sections, before.sections);
    assert.deepEqual(after.styles, before.styles);
    assert.deepEqual(after.tableStyles, before.tableStyles);
    assert.equal(after.noteTexts.length, 6);
    assert.ok(after.noteTexts.some((t) => t.includes("Edited footnote_1")));
    assert.ok(after.xml.includes("Edited SectionOne"));
    assert.ok(!after.xml.includes("_OOSW_"));
    assert.ok(!after.xml.includes("customMarkFollows"));
    const saved = await engineRondgang(restored, naam),
      again = properties(saved);
    assert.deepEqual(again.sections, before.sections);
    assert.deepEqual(again.styles, before.styles);
    rapport.proeven.push({
      naam,
      sections: after.sections,
      styles: after.styles,
      notes: after.noteTexts.length,
      externalEditsPreserved: true,
      productionSaveReopen: true,
      productionConversionWrapper: true,
    });
    console.log("PASS", naam);
  }
} catch (e) {
  rapport.fouten.push(String(e));
  throw e;
} finally {
  delete globalThis.window;
  await writeFile(
    resolve(uit, "rapport.json"),
    JSON.stringify(rapport, null, 2),
  );
  await productie.sluit();
  await ssr.close();
}
