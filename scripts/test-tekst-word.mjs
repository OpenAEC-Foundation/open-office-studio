// Node-proef voor de Word-functies van Open Tekst Studio (W4):
//   #48 tabelindeling, #49 afbeelding, #29 zoeken en vervangen,
//   #28 wijzigingen, #57 versies vergelijken.
// Per functie: het proefdocument (scripts/tekst-proefdocument.mjs) openen in
// een echte engine-sessie, de bewerking uitvoeren met dezelfde code als de app
// (src/tekst/**), opslaan, de XML controleren, heropenen met de engine en
// (optioneel) met LibreOffice naar PDF renderen ter controle.
//
// Gebruik: node scripts/test-opdrachten.mjs tekst [--zonder-libreoffice] [functie…]
//   functie: tabel, afbeelding, zoeken, wijzigingen, vergelijken (standaard: alle)
import { mkdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { createYrsSession, saveYrsDocx } from "@betteroffice/docx/yrs";
import { maakProefdocument, maakPng } from "./tekst-proefdocument.mjs";

const args = process.argv.slice(2);
const metLibreOffice = !args.includes("--zonder-libreoffice") && spawnSync("which", ["soffice"]).status === 0;
const gekozen = args.filter((a) => !a.startsWith("--"));
const doe = (functie) => !gekozen.length || gekozen.includes(functie);
const UIT = ".local/tekst-word";
await rm(UIT, { recursive: true, force: true });
await mkdir(UIT, { recursive: true });

let geslaagd = 0;
const fouten = [];
function controleer(ok, tekst) {
  if (ok) {
    geslaagd++;
    console.log(`  ok   ${tekst}`);
  } else {
    fouten.push(tekst);
    console.log(`  FOUT ${tekst}`);
  }
}

async function sessie(bytes) {
  const s = await createYrsSession();
  s.openDocx(bytes, true);
  s.beginUndoCapture();
  return s;
}

/** Een DocxEditorRef-achtige omhulling om een sessie, zoals de app hem gebruikt. */
function nepRef(s, { modus = "editing", layout = null } = {}) {
  const weergave = {
    getYrsSession: () => s,
    syncYrsInputState: () => true,
    relayout: () => {},
    getLayout: () => layout,
    getSelectionRange: () => null,
    // Deze proef heeft geen schermlay-out; de opdracht gebruikt de sectiebreedte.
    yrsLocToDisplayPosition: () => null,
  };
  return {
    getEditorRef: () => weergave,
    commands: { getState: (id) => (id === "editingMode" ? { value: modus, enabled: true } : { enabled: true }) },
    flushPendingInput: async () => {},
    getDocument: () => null,
    readParagraphs: async (req) => s.readParagraphs(req),
    findText: async (req) => s.findText(req),
    applyEdits: async (req) => s.applyEdits(req),
  };
}

const documentXml = (bytes) => strFromU8(unzipSync(bytes)["word/document.xml"]);
async function opslaanEnHeropenen(s, naam) {
  const bytes = (await saveYrsDocx(s)).bytes;
  await writeFile(join(UIT, `${naam}.docx`), bytes);
  const terug = await sessie(bytes);
  return { bytes, xml: documentXml(bytes), terug };
}

const profiel = resolve(join(UIT, "lo-profiel"));
function pdfTekst(naam) {
  if (!metLibreOffice) return null;
  const bestand = join(UIT, `${naam}.docx`);
  spawnSync("soffice", [`-env:UserInstallation=file://${profiel}`, "--headless", "--norestore", "--nolockcheck", "--convert-to", "pdf", "--outdir", UIT, bestand], {
    encoding: "utf8",
    timeout: 300000,
  });
  const r = spawnSync("pdftotext", ["-layout", join(UIT, `${naam}.pdf`), "-"], { encoding: "utf8", maxBuffer: 64 << 20 });
  return r.status === 0 ? r.stdout : "";
}
const paginaTeksten = (tekst) => (tekst ?? "").split("\f");

/** Tabel 0 selecteren via de celselectie, zoals een klik in de cel. */
function kiesCel(s, rij, kolom, totRij = rij, totKolom = kolom, tabel = 0) {
  const verhaal = `body:t${tabel}:r${rij}c${kolom}`;
  const alinea = s.paragraphs(verhaal)[0];
  s.setSelection({ story: verhaal, paraId: alinea.paraId, offset: 0 });
  s.setCellSelection({
    anchor: { story: "body", tableIndex: tabel, row: rij, column: kolom },
    head: { story: "body", tableIndex: tabel, row: totRij, column: totKolom },
  });
}

// ---------------------------------------------------------------------------
if (doe("tabel")) {
  console.log("#48 Tabelindeling");
  const t = await import("../src/tekst/tabel/opdrachten.ts");
  const { splitsTabel, rijenPerTabel } = await import("../src/tekst/tabel/pakket.ts");
  const rijen = [["Naam", "Plaats", "Aantal"]];
  for (let i = 0; i < 45; i++) rijen.push([`Persoon ${String.fromCharCode(90 - (i % 26))}${i}`, i % 2 ? "Delft" : "Utrecht", String((i * 7) % 23)]);
  const s = await sessie(maakProefdocument({ tabelRijen: rijen }));
  const ref = nepRef(s);

  kiesCel(s, 0, 0);
  t.zetRijen(ref, { kopregel: true });
  kiesCel(s, 3, 0);
  t.zetRijen(ref, { nietAfbreken: true, hoogte: 600, regel: "exact" });
  kiesCel(s, 1, 0, 2, 2);
  t.celUitlijning(ref, "center");
  t.celMarges(ref, { top: 57, bottom: 57, left: 170, right: 170 }, true);
  t.kolommenGelijk(ref);
  kiesCel(s, 1, 2);
  t.sorteer(ref, [{ kolom: 2, soort: "getal", aflopend: true }], 1);
  let { xml, terug } = await opslaanEnHeropenen(s, "tabel-indeling");
  controleer(/<w:tr><w:trPr><w:tblHeader\/><\/w:trPr>/.test(xml), "kopregel herhalen → w:tblHeader in de eerste rij");
  controleer(/<w:cantSplit\/><w:trHeight w:val="600" w:hRule="exact"\/>/.test(xml), "rij niet afbreken + exacte rijhoogte → w:cantSplit, w:trHeight");
  controleer((xml.match(/<w:vAlign w:val="center"\/>/g) ?? []).length === 6, "verticaal centreren in 6 geselecteerde cellen → w:vAlign");
  controleer(/<w:tblCellMar><w:top w:w="57" w:type="dxa"\/><w:left w:w="170"/.test(xml), "standaardcelmarges → w:tblCellMar");
  controleer(/<w:tblLayout w:type="fixed"\/>/.test(xml) && (xml.match(/<w:gridCol w:w="2000"\/>/g) ?? []).length === 3, "kolommen gelijk verdelen → gelijk raster, vaste indeling");
  const aantallen = terug.tablePayload("body", 0).rows.slice(1, 6).map((r) => terug.paragraphs(r.cells[2].story)[0].text);
  controleer(JSON.stringify(aantallen) === JSON.stringify(["22", "22", "21", "21", "20"]), `sorteren aflopend op getal blijft na heropenen staan (${aantallen.join(", ")})`);
  controleer(terug.tablePayload("body", 0).rows[0].trPr.isHeader === true, "kopregel blijft na heropenen");
  const pdf = pdfTekst("tabel-indeling");
  if (pdf !== null) {
    const paginas = paginaTeksten(pdf);
    controleer(paginas.length >= 2 && paginas[1].includes("Naam") && paginas[1].includes("Aantal"), "LibreOffice: de kopregel staat ook bovenaan pagina 2");
  }

  // Passend maken (met een beschikbare breedte via de sectie).
  t.maakPassend(ref, "venster");
  ({ xml } = await opslaanEnHeropenen(s, "tabel-venster"));
  controleer(/<w:tblW w:w="5000" w:type="pct"\/>/.test(xml) && /<w:tblLayout w:type="autofit"\/>/.test(xml), "venster automatisch aanpassen → tblW 5000 pct, autofit");
  t.maakPassend(ref, "inhoud");
  ({ xml } = await opslaanEnHeropenen(s, "tabel-inhoud"));
  controleer(/<w:tblW w:w="0" w:type="auto"\/>/.test(xml) && /<w:tblLayout w:type="autofit"\/>/.test(xml), "inhoud automatisch aanpassen → tblW auto, autofit");

  // Ongedaan maken: één stap per bewerking.
  const voor = JSON.stringify(s.tablePayload("body", 0).grid);
  t.maakPassend(ref, "vast");
  s.undo();
  controleer(JSON.stringify(s.tablePayload("body", 0).grid) === voor && s.tablePayload("body", 0).tblPr.tableLayout === "autofit", "Ctrl+Z draait ‘vaste kolombreedte’ in één stap terug");

  // Tabel naar tekst en terug.
  const s2 = await sessie(maakProefdocument());
  const ref2 = nepRef(s2);
  kiesCel(s2, 1, 1);
  t.tabelNaarTekst(ref2, "tab");
  const regels = s2.paragraphs("body").map((p) => p.text).filter((x) => x.includes("\t"));
  controleer(regels.length === 3 && regels[1] === "Bakker\tDelft\t12" && !s2.storySegments("body").some((g) => g.embedKind === "table"), "tabel naar tekst met tabs");
  s2.undo();
  controleer(s2.storySegments("body").filter((g) => g.embedKind === "table").length === 1, "Ctrl+Z zet de tabel in één stap terug");
  const alineas = s2.paragraphs("body");
  const a = alineas.find((p) => p.text.startsWith("De kat")),
    b = alineas.find((p) => p.text.startsWith("Een tweede"));
  s2.setSelection({ story: "body", paraId: a.paraId, offset: 0 }, { story: "body", paraId: b.paraId, offset: 3 });
  await t.tekstNaarTabel(ref2, "alinea", 1);
  ({ xml, terug } = await opslaanEnHeropenen(s2, "tekst-naar-tabel"));
  controleer(terug.storySegments("body").filter((g) => g.embedKind === "table").length === 2, "tekst naar tabel: tweede tabel in het opgeslagen document");
  controleer(xml.indexOf("De kat zit op de mat.") < xml.indexOf(">Tabel<") && xml.indexOf("<w:tbl>") < xml.indexOf("De kat zit op de mat."), "tekst naar tabel: tabel staat op de plaats van de alinea’s, kop ‘Tabel’ erna");
  s2.undo();
  controleer(s2.storySegments("body").filter((g) => g.embedKind === "table").length === 1 && s2.paragraphs("body").some((p) => p.text.startsWith("De kat")), "Ctrl+Z draait tekst naar tabel in één stap terug");

  // Splitsen (pakketroute) op de gesorteerde tabel.
  const gesplitst = splitsTabel((await saveYrsDocx(s)).bytes, 0, 20);
  await writeFile(join(UIT, "tabel-gesplitst.docx"), gesplitst);
  const s3 = await sessie(gesplitst);
  controleer(JSON.stringify(rijenPerTabel(documentXml(gesplitst))) === "[20,26]", "tabel splitsen vóór rij 21 → 20 + 26 rijen");
  controleer(s3.storySegments("body").filter((g) => g.embedKind === "table").length === 2, "gesplitst document opent in de engine met twee tabellen");
  const pdf3 = pdfTekst("tabel-gesplitst");
  if (pdf3 !== null) controleer(/Persoon/.test(pdf3), "LibreOffice rendert het gesplitste document");
}

// ---------------------------------------------------------------------------
if (doe("afbeelding")) {
  console.log("#49 Afbeelding");
  const a = await import("../src/tekst/afbeelding/opdrachten.ts");
  const s = await sessie(maakProefdocument());
  const ref = nepRef(s);
  const loc = { story: "body", paraId: "10000031", offset: 0 };
  const kies = () => s.setSelection(loc, { ...loc, offset: 1 });
  const beeld = () => s.storySegments("body").find((g) => g.embedKind === "image").payload;

  kies();
  a.bijsnijden(ref, { top: 0.1, right: 0.2, bottom: 0, left: 0.05 });
  controleer(Math.abs(beeld().width - 160 * 0.75) < 0.1 && Math.abs(beeld().height - 80 * 0.9) < 0.1, "bijsnijden houdt de schaal: de weergavemaat krimpt mee");
  a.zetAltTekst(ref, "Rood proefvlak", false);
  let { xml, terug } = await opslaanEnHeropenen(s, "afbeelding-bijgesneden");
  controleer(/<a:srcRect l="5000" t="10000" r="20000"\/>/.test(xml), "bijsnijding → a:srcRect (l 5 %, t 10 %, r 20 %)");
  controleer(/descr="Rood proefvlak"/.test(xml), "alternatieve tekst → wp:docPr/@descr");
  controleer(/<wp:extent cx="1143000" cy="685800"\/>/.test(xml), "bijgesneden afmeting → wp:extent");
  const tb = terug.storySegments("body").find((g) => g.embedKind === "image").payload;
  controleer(tb.cropTop === 0.1 && tb.alt === "Rood proefvlak", "bijsnijding en alt-tekst blijven na heropenen");
  s.undo();
  controleer(beeld().alt === "Oude beschrijving" && beeld().cropTop === 0.1, "Ctrl+Z draait alleen de laatste stap (alt-tekst) terug");
  s.undo();
  controleer(!beeld().cropTop && beeld().width === 160, "tweede Ctrl+Z draait het bijsnijden terug");

  kies();
  a.zetAfmeting(ref, 320, 160);
  a.zetAltTekst(ref, "", true);
  a.wijzigAfbeelding(ref, () => ({ wrapType: "square", position: { horizontal: { relativeTo: "column", posOffset: 0 }, vertical: { relativeTo: "paragraph", posOffset: 0 } } }));
  a.zetPositie(ref, {
    position: { horizontal: { relativeTo: "margin", align: "right" }, vertical: { relativeTo: "paragraph", posOffset: 360000 } },
    distTop: 0,
    distBottom: 0,
    distLeft: 18.9,
    distRight: 18.9,
  });
  ({ xml, terug } = await opslaanEnHeropenen(s, "afbeelding-zwevend"));
  controleer(/<wp:extent cx="3048000" cy="1524000"\/>/.test(xml), "afmeting 320 × 160 px → wp:extent 8,47 × 4,23 cm");
  controleer(/<wp:positionH relativeFrom="margin"><wp:align>right<\/wp:align><\/wp:positionH>/.test(xml), "positie rechts t.o.v. marge → wp:positionH/wp:align");
  controleer(/<wp:positionV relativeFrom="paragraph"><wp:posOffset>360000<\/wp:posOffset><\/wp:positionV>/.test(xml), "1 cm onder de alinea → wp:positionV/wp:posOffset");
  controleer(/<wp:anchor[^>]*distL="18\d{4}" distR="18\d{4}"/.test(xml), "afstand tot de tekst 0,5 cm → distL/distR ≈ 180000 EMU");
  controleer(/<wp:wrapSquare/.test(xml), "tekstterugloop vierkant blijft");
  // De engine schrijft geen adec:decorative; decoratief = zonder beschrijving.
  controleer(/<wp:docPr id="\d+" name="[^"]*"\/>/.test(xml), "decoratief → afbeelding zonder beschrijving (wp:docPr zonder descr)");

  kies();
  const png = maakPng(60, 30, [20, 110, 200]);
  a.vervangAfbeelding(ref, "data:image/png;base64," + Buffer.from(png).toString("base64"), { breedte: 60, hoogte: 30 });
  controleer(beeld().width === 320 && beeld().height === 160, "vervangen houdt de breedte, de hoogte volgt het nieuwe beeld (2:1)");
  a.bijsnijden(ref, { top: 0.2, right: 0, bottom: 0, left: 0 });
  a.opnieuwInstellen(ref, true, { breedte: 60, hoogte: 30 }, 600);
  const bytes = (await opslaanEnHeropenen(s, "afbeelding-vervangen")).bytes;
  const pakket = unzipSync(bytes);
  xml = strFromU8(pakket["word/document.xml"]);
  const rels = strFromU8(pakket["word/_rels/document.xml.rels"]);
  const rid = /<a:blip r:embed="([^"]+)"/.exec(xml)?.[1];
  const doel = new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] ?? new RegExp(`Target="([^"]+)"[^>]*Id="${rid}"`).exec(rels)?.[1];
  controleer(!!doel && doel !== "media/proef.png" && !!pakket[`word/${doel}`], `vervangen → nieuw mediabestand (${doel})`);
  controleer(pakket[`word/${doel}`]?.length === png.length, "het nieuwe mediabestand bevat de gekozen PNG");
  controleer(!/<a:srcRect/.test(xml) && /<wp:extent cx="571500" cy="285750"\/>/.test(xml), "opnieuw instellen met grootte: geen bijsnijding, oorspronkelijke 60 × 30 px");
  const pdf = pdfTekst("afbeelding-vervangen");
  if (pdf !== null) controleer(pdf.includes("Afbeelding"), "LibreOffice rendert het document met de vervangen afbeelding");
}

// ---------------------------------------------------------------------------
if (doe("zoeken")) {
  console.log("#29 Zoeken en vervangen");
  const z = await import("../src/tekst/zoeken/zoeken.ts");
  const { strToU8, zipSync } = await import("fflate");
  // Proefdocument met een regeleinde, een tab en een handmatig pagina-einde.
  const bestanden = unzipSync(maakProefdocument());
  bestanden["word/document.xml"] = strToU8(
    documentXml(maakProefdocument()).replace(
      "Een tweede regel met KAT in hoofdletters.</w:t></w:r>",
      'Een tweede regel met KAT in hoofdletters.</w:t></w:r><w:r><w:br w:type="page"/></w:r><w:r><w:t xml:space="preserve">Na het pagina-einde: matras en kater.</w:t></w:r>',
    ),
  );
  const bron = zipSync(bestanden);
  const s = await sessie(bron);
  const ref = nepRef(s);
  const zoek = async (zoek, opties = {}, opmaak) => (await z.zoek(ref, { zoek, opties, opmaak })).resultaten;

  controleer((await zoek("kat")).length === 3, "zoeken zonder opties vindt kat, KAT en kat(er)");
  controleer((await zoek("kat", { hoofdlettergevoelig: true })).length === 2, "hoofdlettergevoelig: alleen ‘kat’ in kleine letters");
  controleer((await zoek("kat", { heleWoorden: true })).length === 2, "hele woorden: ‘kater’ telt niet mee");
  controleer((await zoek("<[A-Z]@>", { jokertekens: true })).map((r) => r.tekst).join() === "KAT", "jokertekens <[A-Z]@> vindt het woord in hoofdletters");
  const getallen = await zoek("\\d+", { regex: true });
  controleer(getallen.length === 2 && getallen.every((r) => r.plek.startsWith("Tabel 1")), "regex \\d+ vindt de getallen in de tabelcellen (‘Tabel 1, …’)");
  const koppen = await zoek("", {}, { vet: true, stijl: "Heading2" });
  controleer(koppen.map((r) => r.tekst).join("|") === "Tabel|Afbeelding|Wijzigingen", "opmaak zoeken: vet in stijl Kop 2 vindt de drie koppen");
  controleer((await zoek("mat.^pEen")).length === 1, "^p vindt de alineamarkering tussen twee alinea’s");
  controleer((await zoek("^m")).length === 1, "^m vindt het handmatige pagina-einde");
  controleer((await zoek("kater.^p^mTabel")).length === 1, "het pagina-einde staat als ^m vóór de volgende alinea");

  // Vervangen binnen alinea’s: applyEdits, één stap.
  let { index, resultaten } = await z.zoek(ref, { zoek: "kat", opties: { heleWoorden: true } });
  let uitkomst = await z.vervang(ref, index, resultaten, "hond", { heleWoorden: true });
  let xml = documentXml((await saveYrsDocx(s)).bytes);
  controleer(uitkomst.route === "bewerkingen" && xml.includes("De hond zit op de mat.") && xml.includes("met hond in") && xml.includes("kater"), "alles vervangen kat → hond (hele woorden) via applyEdits");
  s.undo();
  xml = documentXml((await saveYrsDocx(s)).bytes);
  controleer(xml.includes("De kat zit") && xml.includes("met KAT in"), "Ctrl+Z draait ‘alles vervangen’ in één stap terug");

  // Over een alineamarkering heen en ^p in de vervangtekst: sessieroute.
  ({ index, resultaten } = await z.zoek(ref, { zoek: "mat.^pEen", opties: {} }));
  uitkomst = await z.vervang(ref, index, resultaten, "mat. Een", {});
  ({ index, resultaten } = await z.zoek(ref, { zoek: " zit ", opties: {} }));
  await z.vervang(ref, index, resultaten, " zit^pnog ", {});
  xml = documentXml((await saveYrsDocx(s)).bytes);
  const teksten = () => s.readParagraphs({ view: "accepted" }).paragraphs.map((p) => p.text);
  const alineas = teksten();
  controleer(uitkomst.route === "sessie" && alineas.some((t) => t.startsWith("nog op de mat. Een tweede regel")), "^p zoeken en vervangen door een spatie voegt de alinea’s samen");
  controleer(alineas.includes("De kat zit") && alineas.some((t) => t.startsWith("nog op de mat.")), "^p in de vervangtekst splitst de alinea");
  s.undo();
  // (De engine zet een pagina-einde midden in een alinea vóór de volgende alinea.)
  controleer(teksten()[1] === "De kat zit op de mat. Een tweede regel met KAT in hoofdletters.Na het pagina-einde: matras en kater.", `Ctrl+Z draait het splitsen in één stap terug`);
  s.undo();
  controleer(teksten()[1] === "De kat zit op de mat." && teksten()[2].startsWith("Een tweede regel"), "tweede Ctrl+Z draait het samenvoegen terug");

  // Pagina-einde verwijderen.
  ({ index, resultaten } = await z.zoek(ref, { zoek: "^m", opties: {} }));
  await z.vervang(ref, index, resultaten, "", {});
  controleer(!s.storySegments("body").some((g) => g.embedKind === "pageBreak"), "^m vervangen door niets verwijdert het pagina-einde");
  s.undo();
  controleer(s.storySegments("body").some((g) => g.embedKind === "pageBreak"), "Ctrl+Z zet het pagina-einde terug");

  // Wijzigingen bijhouden: vervangen wordt een voorstel.
  const s2 = await sessie(maakProefdocument({ wijzigingen: false }));
  const ref2 = nepRef(s2, { modus: "suggesting" });
  ({ index, resultaten } = await z.zoek(ref2, { zoek: "mat", opties: { heleWoorden: true } }));
  await z.vervang(ref2, index, resultaten, "deurmat", { heleWoorden: true });
  const { xml: xml2 } = await opslaanEnHeropenen(s2, "zoeken-voorstel");
  controleer(/<w:del [^>]*w:author="Onbekende auteur"[^>]*>.*?mat.*?<\/w:del>/.test(xml2) && /<w:ins [^>]*>.*?deurmat.*?<\/w:ins>/.test(xml2), "vervangen bij Wijzigingen bijhouden → w:del + w:ins");

  // Wildcard-groepen in de vervangtekst.
  const s3 = await sessie(maakProefdocument({ wijzigingen: false }));
  const ref3 = nepRef(s3);
  ({ index, resultaten } = await z.zoek(ref3, { zoek: "(De) (kat)", opties: { jokertekens: true } }));
  await z.vervang(ref3, index, resultaten, "\\2 \\1", { jokertekens: true });
  controleer(s3.paragraphs("body").some((p) => p.text === "kat De zit op de mat."), "jokertekens: \\2 \\1 verwisselt de groepen");
  await writeFile(join(UIT, "zoeken-bron.docx"), bron);
  const pdf = pdfTekst("zoeken-voorstel");
  if (pdf !== null) controleer(pdf.includes("deurmat"), "LibreOffice toont de voorgestelde vervanging");
}

// ---------------------------------------------------------------------------
if (doe("wijzigingen")) {
  console.log("#28 Wijzigingen");
  const w = await import("../src/tekst/wijzigingen/opdrachten.ts");
  // Extra alinea met een wijziging van Anna, zodat er per auteur te filteren valt.
  const { strToU8, zipSync } = await import("fflate");
  const bestanden = unzipSync(maakProefdocument());
  bestanden["word/document.xml"] = strToU8(
    documentXml(maakProefdocument()).replace(
      "<w:sectPr",
      `<w:p w14:paraId="10000050"><w:r><w:t xml:space="preserve">Slot </w:t></w:r><w:ins w:id="903" w:author="Anna" w:date="2026-10-03T10:00:00Z"><w:r><w:t>van Anna</w:t></w:r></w:ins></w:p><w:sectPr`,
    ),
  );
  const bron = zipSync(bestanden);
  let s = await sessie(bron);
  let ref = nepRef(s);
  controleer(w.revisies(s).length === 3, "drie bijgehouden wijzigingen van twee auteurs");
  // Alleen getoonde auteurs: Bram verbergen.
  let aantal = w.besluit(ref, "accepteren", { verborgen: new Set(["Bram"]) });
  controleer(aantal === 2 && w.revisies(s).map((r) => r.author).join() === "Bram", "alle getoonde wijzigingen accepteren (Bram verborgen) laat Bram staan");
  s.undo();
  controleer(w.revisies(s).length === 3, "Ctrl+Z zet alle geaccepteerde wijzigingen in één stap terug");
  // In de selectie: alleen de alinea met ‘ingevoegd’ en ‘weg’.
  s.setSelection({ story: "body", paraId: "10000041", offset: 0 }, { story: "body", paraId: "10000041", offset: 30 });
  aantal = w.besluit(ref, "weigeren", { selectie: true });
  controleer(aantal === 2 && w.revisies(s).length === 1 && s.readParagraphs({ view: "accepted", paraIds: ["10000041"] }).paragraphs[0].text === "Begin midden weg einde.", "wijzigingen in de selectie weigeren");
  aantal = w.besluit(ref, "accepteren");
  let { xml } = await opslaanEnHeropenen(s, "wijzigingen-afgehandeld");
  controleer(aantal === 1 && !/<w:(ins|del) /.test(xml) && xml.includes("van Anna") && xml.includes("weg "), "alles accepteren → geen w:ins/w:del meer in het opgeslagen document");

  // Voorbeelden voor de markeringsweergave.
  const geen = await w.voorbeeld(bron, "accepteren");
  const origineel = await w.voorbeeld(bron, "weigeren");
  await writeFile(join(UIT, "wijzigingen-geen-markeringen.docx"), geen.bytes);
  await writeFile(join(UIT, "wijzigingen-origineel.docx"), origineel.bytes);
  const xg = documentXml(geen.bytes),
    xo = documentXml(origineel.bytes);
  controleer(!/<w:(ins|del) /.test(xg) && xg.includes("ingevoegd") && !xg.includes("weg ") && xg.includes("van Anna"), "voorbeeld ‘geen markeringen’: alles geaccepteerd");
  controleer(!/<w:(ins|del) /.test(xo) && !xo.includes("ingevoegd") && xo.includes("weg ") && !xo.includes("van Anna"), "voorbeeld ‘origineel’: alles geweigerd");
  controleer(geen.gewijzigd.includes("10000041") && geen.gewijzigd.includes("10000050"), "eenvoudige markering kent de gewijzigde alinea’s");
  const pdf = pdfTekst("wijzigingen-geen-markeringen");
  if (pdf !== null) controleer(pdf.includes("ingevoegd") && !/\bweg\b/.test(pdf), "LibreOffice toont het geaccepteerde voorbeeld zonder verwijderde tekst");
}

// ---------------------------------------------------------------------------
if (doe("vergelijken")) {
  console.log("#57 Versies vergelijken");
  const v = await import("../src/tekst/wijzigingen/vergelijken.ts");
  const a = maakProefdocument({ wijzigingen: false });
  const b = maakProefdocument({ wijzigingen: false, alineas: ["De hond zit op de mat.", "Een tweede regel met KAT in hoofdletters."] });
  let uit = await v.vergelijk(a, b, { auteur: "Vergelijking", korrel: "word", eerstAccepteren: true, datum: new Date("2026-10-28T12:00:00Z") });
  controleer(uit.ok && uit.verschillen === 1, `één verschil gevonden (${uit.ok ? uit.verschillen : uit.meldingen.map((m) => m.code).join()})`);
  if (uit.ok) {
    await writeFile(join(UIT, "vergelijking.docx"), uit.bytes);
    const xml = documentXml(uit.bytes);
    controleer(/<w:del [^>]*w:author="Vergelijking"[^>]*>.*?kat.*?<\/w:del>/.test(xml) && /<w:ins [^>]*w:author="Vergelijking"[^>]*>.*?hond.*?<\/w:ins>/.test(xml), "resultaat: kat als w:del en hond als w:ins van ‘Vergelijking’");
    const s = await sessie(uit.bytes);
    controleer(s.listRevisions().length === 2, "het resultaat opent in de engine met twee wijzigingen");
    const pdf = pdfTekst("vergelijking");
    if (pdf !== null) controleer(pdf.includes("hond"), "LibreOffice rendert het vergelijkingsresultaat");
  }
  // Bestaande wijzigingen: zonder ‘eerst accepteren’ weigert de engine, met wel.
  const metWijzigingen = maakProefdocument();
  uit = await v.vergelijk(metWijzigingen, b, { auteur: "V", korrel: "word", eerstAccepteren: false });
  controleer(!uit.ok && v.meldingen(uit.meldingen)[0].tekst.includes("Bestaande wijzigingen eerst accepteren"), "document met wijzigingen: duidelijke melding zonder ‘eerst accepteren’");
  uit = await v.vergelijk(metWijzigingen, a, { auteur: "V", korrel: "word", eerstAccepteren: true });
  controleer(uit.ok || uit.meldingen.every((m) => m.code !== "existing-revisions"), "met ‘eerst accepteren’ is de melding over bestaande wijzigingen weg");
  // Een toegevoegde alinea kan de engine nog niet: een begrijpelijke weigering.
  const c = maakProefdocument({ wijzigingen: false, alineas: ["De kat zit op de mat.", "Nieuwe alinea.", "Een tweede regel met KAT in hoofdletters."] });
  uit = await v.vergelijk(a, c, { auteur: "V", korrel: "word", eerstAccepteren: true });
  controleer(!uit.ok && v.meldingen(uit.meldingen).some((m) => m.tekst.includes("alinea’s toegevoegd")), "toegevoegde alinea → Nederlandse uitleg van de beperking");
  controleer(v.heeftWijzigingen(metWijzigingen) && !v.heeftWijzigingen(a), "herkent bijgehouden wijzigingen in een bestand");
}

// ---------------------------------------------------------------------------
console.log(`\n${geslaagd} controles geslaagd, ${fouten.length} mislukt.`);
if (fouten.length) {
  for (const f of fouten) console.log(`  - ${f}`);
  process.exit(1);
}
export { maakPng };
