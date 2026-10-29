// Paginafuncties van Tekst end-to-end (pakketroute, src/tekst/pagina):
//  1. Een proefdocument maken (sjabloon + koppen en tekst over meerdere pagina's)
//     en daarop paginanummers, inhoudsopgave, voetnoot/eindnoot, kolommen,
//     kolomeinde, marges/formaat en kop/voet-opties toepassen.
//  2. De XML met python3 (stdlib) controleren: welgevormd, relaties en
//     inhoudstypen kloppen, verwachte elementen aanwezig.
//  3. Met de engine (@betteroffice/docx) openen, een alinea bewerken, opslaan
//     en heropenen: alles blijft behouden. De paginaindeling headless laten
//     berekenen (exportDocxStructuredWithPages): koppen met paginanummers voor
//     ‘Bijwerken’, noten onderaan de pagina, voettekst op de juiste pagina's.
//  4. Onafhankelijk met LibreOffice headless naar PDF en pdftotext: ‘Pagina 2
//     van N’, de regels van de inhoudsopgave en de voetnoottekst onderaan.
//
// Gebruik: node scripts/test-paginafuncties.mjs [--zonder-libreoffice]
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { parseDocx } from "@betteroffice/docx/docx";
import { createYrsSession, saveYrsDocx } from "@betteroffice/docx/yrs";
import { exportDocxStructuredWithPages } from "@betteroffice/docx";
import { Pakket } from "../src/grafieken/pakket.ts";
import { voegPaginanummerIn, zetEvenOnevenAnders, zetKopVoetAfstand } from "../src/tekst/pagina/kopvoet.ts";
import { koppenUitExport, voegInhoudsopgaveIn, werkInhoudsopgaveBij, STANDAARD_INHOUD } from "../src/tekst/pagina/inhoudsopgave.ts";
import { voegNootIn, leesNoten, zetNootInstellingen, herstelNootverwijzingen } from "../src/tekst/pagina/noten.ts";
import { FORMATEN, MARGES, voegKolomeindeIn, voegSectieEindeIn, wijzigSecties, zetKolomVoorkeur, leesSecties } from "../src/tekst/pagina/secties.ts";

const args = new Set(process.argv.slice(2));
const metLibreOffice = !args.has("--zonder-libreoffice") && spawnSync("which", ["soffice"]).status === 0;
const UIT = ".local/paginafuncties";
await rm(UIT, { recursive: true, force: true });
await mkdir(UIT, { recursive: true });

const fouten = [];
const controleer = (ok, tekst) => {
  console.log(`${ok ? "OK  " : "FOUT"} ${tekst}`);
  if (!ok) fouten.push(tekst);
};

// ---------------------------------------------------------------------------
// 1. Proefdocument
const M1 = "OOSMARKTOC0001Q";
const M2 = "OOSMARKFN0002Q";
const M3 = "OOSMARKEN0003Q";
const M4 = "OOSMARKCOL004Q";
const lorem = Array(14).fill("Het ontwerp volgt de bestaande structuur en houdt rekening met de draagkracht van de vloeren.").join(" ");
const p = (t, stijl) => `<w:p>${stijl ? `<w:pPr><w:pStyle w:val="${stijl}"/></w:pPr>` : ""}<w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
function proefdocument(extra = "") {
  const pakket = new Pakket(new Uint8Array(spawnSync("cat", ["public/templates/nieuw.docx"], { maxBuffer: 1e8 }).stdout));
  const xml = pakket.lees("word/document.xml");
  const sect = /<w:sectPr\b[\s\S]*<\/w:sectPr>/.exec(xml)[0].replace(/<w:pgSz[^>]*\/>/, '<w:pgSz w:w="11906" w:h="16838"/>');
  const body =
    p(M1) +
    p("Inleiding", "Heading1") +
    p(`Dit rapport beschrijft het ontwerp.${M2} ${lorem}`) +
    p(lorem) +
    p("Achtergrond", "Heading2") +
    p(lorem) +
    p(lorem) +
    p("Constructie", "Heading1") +
    p(`${lorem}${M3}`) +
    p(lorem) +
    p("Uitgangspunten", "Heading2") +
    p(lorem) +
    p(lorem) +
    p("Conclusie", "Heading1") +
    p(lorem) +
    extra;
  pakket.schrijf("word/document.xml", xml.replace(/<w:body>[\s\S]*<\/w:body>/, `<w:body>${body}${sect}</w:body>`));
  return pakket.inpakken();
}

const fontB64 = (await readFile("node_modules/@betteroffice/fonts/assets/Carlito-Regular.ttf")).toString("base64");
const fontBoldB64 = (await readFile("node_modules/@betteroffice/fonts/assets/Carlito-Bold.ttf")).toString("base64");
const indeling = {
  fonts: [
    { key: "c", data: fontB64 },
    { key: "cb", data: fontBoldB64 },
  ],
  fontChains: { "calibri|true|false": ["cb", "c"], "cambria|true|false": ["cb", "c"] },
  defaultChain: ["c"],
};
async function pagina(bytes) {
  return exportDocxStructuredWithPages(bytes, { revisionView: "accepted", stories: ["body", "headers", "footers", "footnotes", "endnotes"] }, indeling);
}

let bytes = proefdocument();
// Paginanummers onderaan in het midden, ‘Pagina X van Y’, ook op de eerste pagina.
bytes = voegPaginanummerIn(bytes, { positie: "onder", uitlijning: "midden", vorm: "paginaVan", opEerstePagina: true });
// Voetnoot en eindnoot.
bytes = voegNootIn(bytes, M2, "voetnoot", "Zie het archief van de gemeente, map 12.").bytes;
bytes = voegNootIn(bytes, M3, "eindnoot", "Berekening volgens NEN-EN 1990.").bytes;
bytes = zetNootInstellingen(bytes, "eindnoot", { notatie: "lowerRoman", beginBij: 1, herstart: "continuous", positie: "docEnd" });
// Inhoudsopgave: eerst koppen + pagina's van de engine, invoegen, dan paginanummers bijwerken.
let koppen = koppenUitExport(await pagina(bytes));
controleer(koppen.length === 5, `engine geeft 5 koppen (${koppen.map((k) => `${k.niveau}:${k.tekst}@${k.pagina}`).join(", ")})`);
bytes = voegInhoudsopgaveIn(bytes, M1, koppen, STANDAARD_INHOUD);
koppen = koppenUitExport(await pagina(bytes));
const bij = werkInhoudsopgaveBij(bytes, koppen, "paginas");
bytes = bij.bytes;
console.log(`     paginanummers na invoegen ${bij.gewijzigd ? "bijgewerkt" : "ongewijzigd"}: ${koppen.map((k) => `${k.tekst}@${k.pagina}`).join(", ")}`);
await writeFile(join(UIT, "proef.docx"), bytes);

// Tweede document: kolommen, kolomeinde, marges, formaat, kop/voet-opties.
let kolom = proefdocument(p(`Na het kolomeinde${M4} volgt de tweede kolom.`));
for (const m of [M1, M2, M3]) {
  const pk = new Pakket(kolom);
  pk.schrijf("word/document.xml", pk.lees("word/document.xml").replace(m, ""));
  kolom = pk.inpakken();
}
kolom = zetKolomVoorkeur(kolom, "alle", "twee", { lijn: true });
kolom = voegKolomeindeIn(kolom, M4);
kolom = wijzigSecties(kolom, "alle", { marges: MARGES.smal.marges, formaat: FORMATEN.A4, afdrukstand: "liggend" });
kolom = zetEvenOnevenAnders(kolom, true);
kolom = zetKopVoetAfstand(kolom, "alle", { koptekst: 567, voettekst: 567 });
kolom = voegPaginanummerIn(kolom, { positie: "boven", uitlijning: "rechts", vorm: "getal", opEerstePagina: false, notatie: "lowerRoman" });
await writeFile(join(UIT, "kolommen.docx"), kolom);

// ---------------------------------------------------------------------------
// 2. XML-controle met python3 (stdlib)
const PY = String.raw`
import sys, zipfile, posixpath, xml.dom.minidom as md
pad = sys.argv[1]
z = zipfile.ZipFile(pad)
namen = set(z.namelist())
ct = md.parseString(z.read('[Content_Types].xml'))
overrides = {o.getAttribute('PartName').lstrip('/') for o in ct.getElementsByTagName('Override')}
defaults = {d.getAttribute('Extension') for d in ct.getElementsByTagName('Default')}
fouten = []
for n in namen:
    if n.endswith('.xml') or n.endswith('.rels'):
        try: md.parseString(z.read(n))
        except Exception as e: fouten.append(f'{n}: {e}')
    if n.endswith('.xml') and n not in overrides and 'xml' not in defaults and not n.startswith('customXml/item'):
        fouten.append(f'geen inhoudstype voor {n}')
for n in namen:
    if not n.endswith('.rels'): continue
    bron = n.replace('_rels/', '')[:-5]
    ids = set()
    for r in md.parseString(z.read(n)).getElementsByTagName('Relationship'):
        i = r.getAttribute('Id')
        if i in ids: fouten.append(f'dubbele relatie-id {i} in {n}')
        ids.add(i)
        if r.getAttribute('TargetMode') == 'External': continue
        doel = posixpath.normpath(posixpath.join(posixpath.dirname(bron), r.getAttribute('Target')))
        if doel.lstrip('/') not in namen: fouten.append(f'{n}: doel ontbreekt {doel}')
doc = z.read('word/document.xml').decode()
for verwacht in sys.argv[2:]:
    if verwacht.startswith('!'):
        if verwacht[1:] in doc: fouten.append(f'onverwacht in document.xml: {verwacht[1:]}')
    elif verwacht not in doc and not any(verwacht in z.read(n).decode('utf-8', 'ignore') for n in namen if n.endswith('.xml')):
        fouten.append(f'ontbreekt: {verwacht}')
print('\n'.join(fouten) if fouten else 'ok')
`;
function pyControle(pad, verwacht) {
  const r = spawnSync("python3", ["-c", PY, pad, ...verwacht], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : r.stderr;
}
const verwachtProef = ["Table of Contents", " TOC \\o", "w:anchor=\"_Toc", "<w:footnoteReference", "<w:endnoteReference", " PAGE ", "NUMPAGES", "!OOSMARK"];
const verwachtKolom = ['w:num="2"', 'w:sep="1"', '<w:br w:type="column"/>', 'w:orient="landscape"', "<w:evenAndOddHeaders/>", 'w:header="567"', "<w:titlePg/>", 'w:fmt="lowerRoman"', "!OOSMARK"];
controleer(pyControle(join(UIT, "proef.docx"), verwachtProef) === "ok", `XML proef.docx: ${pyControle(join(UIT, "proef.docx"), verwachtProef)}`);
controleer(pyControle(join(UIT, "kolommen.docx"), verwachtKolom) === "ok", `XML kolommen.docx: ${pyControle(join(UIT, "kolommen.docx"), verwachtKolom)}`);

// ---------------------------------------------------------------------------
// 3. Engine: openen, bewerken, opslaan, heropenen
async function viaEngine(invoer, naam) {
  const sessie = await createYrsSession();
  sessie.openDocx(invoer, true);
  const lees = sessie.readParagraphs({ story: "body", view: "accepted" });
  const doel = lees.paragraphs.find((x) => x.text.includes("Dit rapport")) ?? lees.paragraphs.find((x) => x.text.length > 20);
  const r = sessie.applyEdits({ expectVersion: sessie.version(), steps: [{ op: "insertText", target: { kind: "paragraph", story: "body", paraId: doel.paraId }, at: "start", text: "Bewerkt: " }] });
  controleer(r.ok, `${naam}: engine-bewerking geaccepteerd${r.ok ? "" : ` (${r.failure?.code}: ${r.failure?.message})`}`);
  const opgeslagen = (await saveYrsDocx(sessie)).bytes;
  sessie.destroy?.();
  await parseDocx(opgeslagen, { preloadFonts: false });
  await writeFile(join(UIT, naam.replace(".docx", ".engine.docx")), opgeslagen);
  return opgeslagen;
}
const proefEngine = await viaEngine(bytes, "proef.docx");
const kolomEngine = await viaEngine(kolom, "kolommen.docx");
const pe = pyControle(join(UIT, "proef.engine.docx"), [...verwachtProef, "Bewerkt: "]);
controleer(pe === "ok", `XML na engine (proef): ${pe}`);
const ke = pyControle(join(UIT, "kolommen.engine.docx"), [...verwachtKolom, "Bewerkt: "]);
controleer(ke === "ok", `XML na engine (kolommen): ${ke}`);
const docNa = strFromU8(unzipSync(proefEngine)["word/document.xml"]);
const superscript = (x) => /<w:rStyle w:val="FootnoteReference"\/>[\s\S]{0,80}<w:footnoteReference/.test(x) || /vertAlign w:val="superscript"[\s\S]{0,80}<w:footnoteReference/.test(x);
if (superscript(docNa)) controleer(true, "na engine: voetnootverwijzing blijft superscript (rPr behouden)");
else {
  // Bekende engine-beperking: een bewerkte alinea verliest de w:rPr van de verwijzingsrun.
  console.log("BEKEND engine laat de opmaak van de voetnootverwijzing in een bewerkte alinea vallen (engine-verzoek)");
  controleer(superscript(herstelNootverwijzingen(docNa)), "herstelNootverwijzingen zet de verwijzingsstijl terug");
}
const sdtNa = /<w:sdt>[\s\S]*?<\/w:sdt>/.exec(docNa)?.[0] ?? "";
controleer(/TOC \\o[^<]*<\/w:instrText>[\s\S]*Conclusie[\s\S]*fldCharType="end"[\s\S]*<\/w:sdtContent>/.test(sdtNa) && (sdtNa.match(/fldCharType="end"/g) ?? []).length === 1, "na engine: TOC-veld blijft om alle regels (einde na de laatste regel)");
controleer(leesNoten(proefEngine).length === 2, "na engine: voetnoot en eindnoot gevonden");

const lay = (await pagina(proefEngine)).layout;
const paginas = lay.pages.length;
const voetOp = new Set(lay.occurrences.filter((o) => o.region.kind === "footer").map((o) => o.pageIndex));
controleer(voetOp.size === paginas, `voettekst met paginanummer op alle ${paginas} pagina's`);
const noot = lay.occurrences.find((o) => o.region.kind === "footnote");
controleer(noot?.region.placement === "pageBottom", `voetnoot onderaan pagina ${noot ? noot.pageIndex + 1 : "?"}`);
const eind = lay.occurrences.find((o) => o.region.kind === "endnote");
controleer(!!eind, `eindnoot aan het eind (pagina ${eind ? eind.pageIndex + 1 : "?"}, ${eind?.region.placement})`);
const kLay = (await pagina(kolomEngine)).layout;
const kopOp = kLay.occurrences.filter((o) => o.region.kind === "header").map((o) => `${o.pageIndex}:${o.region.variant}`);
controleer(!kopOp.some((x) => x.startsWith("0:")) && kLay.pages[0].size.width > kLay.pages[0].size.height, `kolommen.docx: liggend, geen kop op pagina 1 (kop op ${kopOp.join(" ")})`);
controleer(kLay.pages.every((pg) => pg.numberingFormat === "lowerRoman"), `kolommen.docx: paginanummering i, ii, iii (${kLay.pages.map((x) => x.displayedLabel).join(" ")})`);
const sect = leesSecties(kolomEngine)[0];
controleer(sect.kolommen.aantal === 2 && sect.kolommen.lijn, "kolommen.docx: twee kolommen met lijn na engine");

// Sectie-einde op een oneven pagina: de engine laat een lege vulpagina zien.
{
  let s = proefdocument();
  const pk = new Pakket(s);
  pk.schrijf("word/document.xml", pk.lees("word/document.xml").replace(M1, "").replace(M2, "").replace(M3, "").replace(">Constructie<", ">OOSMARKSEC005QConstructie<"));
  s = voegSectieEindeIn(pk.inpakken(), "OOSMARKSEC005Q", "oddPage");
  const sessie = await createYrsSession();
  sessie.openDocx(s, true);
  const opgeslagen = (await saveYrsDocx(sessie)).bytes;
  sessie.destroy?.();
  const lay = (await pagina(opgeslagen)).layout;
  const constructie = koppenUitExport(await pagina(opgeslagen)).find((k) => k.tekst === "Constructie");
  controleer(
    leesSecties(opgeslagen).map((x) => x.begin).join(",") === "nextPage,oddPage" && Number(constructie?.pagina) % 2 === 1,
    `sectie-einde oneven pagina: ‘Constructie’ op pagina ${constructie?.pagina} (vulpagina's: ${lay.pages.filter((x) => x.parityFiller).length})`,
  );
}

// ---------------------------------------------------------------------------
// 4. LibreOffice naar PDF
if (metLibreOffice) {
  for (const naam of ["proef.engine.docx", "kolommen.engine.docx"]) {
    const r = spawnSync("soffice", ["--headless", "--convert-to", "pdf", "--outdir", UIT, join(UIT, naam)], { encoding: "utf8", timeout: 180000, env: { ...process.env, HOME: join(process.cwd(), UIT) } });
    controleer(r.status === 0, `LibreOffice ${naam} → PDF`);
  }
  const tekst = spawnSync("pdftotext", ["-layout", join(UIT, "proef.engine.pdf"), "-"], { encoding: "utf8" }).stdout;
  const info = spawnSync("pdfinfo", [join(UIT, "proef.engine.pdf")], { encoding: "utf8" }).stdout;
  const n = Number(/Pages:\s+(\d+)/.exec(info)?.[1]);
  controleer(new RegExp(`Pagina 2 van ${n}`).test(tekst), `PDF: ‘Pagina 2 van ${n}’ in de voettekst`);
  controleer(/Inhoudsopgave/.test(tekst) && /Inleiding\s*\.{3,}\s*\d/.test(tekst) && /Uitgangspunten\s*\.{3,}\s*\d/.test(tekst), "PDF: regels van de inhoudsopgave met puntjes en paginanummer");
  const paginasTekst = tekst.split("\f");
  const metNoot = paginasTekst.findIndex((pg) => pg.includes("Zie het archief van de gemeente"));
  controleer(metNoot >= 0 && paginasTekst[metNoot].trim().split("\n").slice(-4).join(" ").includes("archief"), `PDF: voetnoottekst onderaan pagina ${metNoot + 1}`);
  controleer(tekst.includes("NEN-EN 1990"), "PDF: eindnoottekst aanwezig");
  const kolomTekst = spawnSync("pdftotext", ["-layout", join(UIT, "kolommen.engine.pdf"), "-"], { encoding: "utf8" }).stdout;
  controleer(/\bii\b/.test(kolomTekst), "PDF kolommen: Romeins paginanummer in de koptekst");
  await writeFile(join(UIT, "proef.txt"), tekst);
}

console.log(fouten.length ? `\n${fouten.length} fout(en)` : "\nAlles in orde.");
process.exit(fouten.length ? 1 : 0);
