import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createYrsPositionProjection, createYrsSession, saveYrsDocx, type YrsSession } from "@betteroffice/docx/yrs";

interface Cel { story: string; tcPr: Record<string, unknown> }
interface Payload { grid: number[]; tblPr?: Record<string, unknown>; rows: { cells: Cel[] }[] }
interface Vak { x: number; y: number; w: number; h: number }
interface Primitief { docStart?: number; cell?: unknown; clipGroup?: { clip: Vak } }
interface Geval {
  naam: string; samen: boolean; kolommen: number;
  breedtes?: [number, number]; voorkeur?: { width: number; widthType: "pct" | "dxa" };
  indeling?: "fixed" | "autofit";
}
const GEVALLEN: Geval[] = [
  { naam: "samengevoegd, standaardraster", samen: true, kolommen: 2 },
  { naam: "samengevoegd, vaste breedtes", samen: true, breedtes: [4000, 4000], kolommen: 2 },
  { naam: "gewone cel, standaardraster", samen: false, kolommen: 2 },
  { naam: "gewone cel, vaste breedtes", samen: false, breedtes: [4000, 4000], kolommen: 2 },
  { naam: "samengevoegd naar drie kolommen", samen: true, kolommen: 3 },
  { naam: "samengevoegd naar vier kolommen", samen: true, kolommen: 4 },
  { naam: "samengevoegd naar zes kolommen", samen: true, kolommen: 6 },
  { naam: "ongelijke oude breedtes", samen: true, breedtes: [3000, 6360], kolommen: 3 },
  { naam: "tweedeling bij ongelijke oude breedtes", samen: true, breedtes: [3000, 6360], kolommen: 2 },
  { naam: "afronding op hele twips", samen: true, breedtes: [4000, 4001], kolommen: 4 },
  // OOXML legt een percentage vast in vijftigsten: 5000 = 100%, 3750 = 75%.
  { naam: "samengevoegd, procentuele voorkeur", samen: true, kolommen: 3, voorkeur: { width: 5000, widthType: "pct" } },
  { naam: "gewone cel, procentuele voorkeur", samen: false, kolommen: 2, voorkeur: { width: 3750, widthType: "pct" } },
  { naam: "gewone cel, absolute voorkeur", samen: false, kolommen: 2, voorkeur: { width: 7000, widthType: "dxa" } },
  { naam: "vaste tabelindeling naar derden", samen: true, kolommen: 3, indeling: "fixed" },
  { naam: "vaste tabelindeling, gewone cel", samen: false, kolommen: 2, indeling: "fixed" },
];

function meet(sessie: YrsSession) {
  const font = sessie.registerFont(readFileSync("node_modules/@betteroffice/fonts/assets/Caladea-Regular.ttf"));
  const vraag = { bodyStory: "body", renderEnv: {}, options: { pageGap: 24 },
    regions: { sections: [{ sectionId: "main", properties: {} }] } };
  const nodig = JSON.parse(sessie.layoutFontRequirementsJson(JSON.stringify(vraag))) as { key: string }[];
  const indeling = sessie.layoutDocumentWithRegionsJson(JSON.stringify({ ...vraag,
    measurement: { fontChains: Object.fromEntries(nodig.map(f => [f.key, [font]])),
      defaults: { fontSize: 11, fontFamily: "Caladea" }, authoritativeShaping: true } }));
  const lijst = JSON.parse(sessie.buildDisplayListJson(indeling)) as { pages: { primitives: Primitief[] }[] };
  const cellen = new Map<string, Vak>();
  const projectie = createYrsPositionProjection(sessie, "body")!;
  for (const p of lijst.pages.flatMap(p => p.primitives)) {
    if (p.cell && p.docStart !== undefined && p.clipGroup?.clip)
      cellen.set(projectie.targetAt(p.docStart).story, p.clipGroup.clip);
  }
  const tabel = JSON.parse(indeling).layout.pages[0].fragments.find((f: { kind: string }) => f.kind === "table") as { x: number; width: number };
  return { cellen, tabel };
}

describe("getekende celgeometrie na splitsen (#130, #48)", () => {
  it.each(GEVALLEN)("behoudt andere rijen: $naam", async ({ samen, breedtes, voorkeur, kolommen, indeling }) => {
    let s = await createYrsSession();
    try {
      s.openDocx(readFileSync("public/templates/nieuw.docx"), true);
      s.beginUndoCapture(); s.setUndoCaptureMode("manual");
      const p = s.paragraphs("body")[0];
      const tabel = s.insertTable({ story: "body", paraId: p.paraId, offset: 0 }, 3, 2).table;
      if (breedtes) breedtes.forEach((w, c) => s.setColumnWidth({ ...tabel, row: 0, column: c }, w));
      const begin = s.tablePayload("body", 0) as unknown as Payload;
      begin.rows.forEach((r, i) => r.cells.forEach((c, j) => {
        s.insertText({ story: c.story, paraId: s.paragraphs(c.story)[0].paraId, offset: 0 }, `R${i + 1}C${j + 1}`);
      }));
      if (samen) s.mergeCells({ anchor: { ...tabel, row: 0, column: 0 }, head: { ...tabel, row: 0, column: 1 } });
      if (voorkeur) s.setCellTextFormat({ anchor: { ...tabel, row: 0, column: 0 }, head: { ...tabel, row: 0, column: 0 } }, voorkeur);
      if (indeling) s.applyRawOps("body", [{ op: "setEmbedAttr", index: 0, key: "tblPr",
        value: { ...(s.tablePayload("body", 0) as unknown as Payload).tblPr, tableLayout: indeling } }]);
      // Gebruik een werkelijk geïmporteerde DOCX-tabel als uitgangspunt.
      // Ingevoegde tabellen krijgen de geërfde standaardstijl pas bij import;
      // die afzonderlijke afwijking mag geen verschil door splitsen lijken.
      const bron = (await saveYrsDocx(s)).bytes;
      s.destroy();
      s = await createYrsSession();
      s.openDocx(bron, true);
      s.beginUndoCapture(); s.setUndoCaptureMode("manual");
      const onder = (s.tablePayload("body", 0) as unknown as Payload).rows.slice(1).flatMap(r => r.cells.map(c => c.story));
      const doel = (s.tablePayload("body", 0) as unknown as Payload).rows[0].cells[0].story;
      const voor = meet(s);
      s.addUndoBoundary();
      s.splitCell({ ...tabel, row: 0, column: 0 }, 1, kolommen);
      s.addUndoBoundary();
      const na = meet(s);
      const payloadNa = s.tablePayload("body", 0) as unknown as Payload;
      const teksten = (sessie: YrsSession, payload: Payload) => payload.rows.flatMap(r => r.cells.flatMap(c => sessie.paragraphs(c.story).map(p => p.text))).filter(Boolean).sort();
      const verwachteTekst = begin.rows.flatMap((r, i) => r.cells.map((_, j) => `R${i + 1}C${j + 1}`));
      expect(teksten(s, payloadNa).join(" ")).toContain("R1C1");
      for (const tekst of verwachteTekst) expect(teksten(s, payloadNa).some(p => p.includes(tekst))).toBe(true);
      expect(payloadNa.rows[0].cells).toHaveLength(samen ? kolommen : kolommen + 1);
      expect(na.cellen.size).toBe(payloadNa.rows.reduce((a, r) => a + r.cells.length, 0));
      let rechts = voor.cellen.get(doel)!.x;
      for (const c of payloadNa.rows[0].cells.slice(0, kolommen)) {
        const vak = na.cellen.get(c.story);
        expect(vak).toBeDefined();
        // De tekenlijst rondt elke positie en breedte af op 0,001 px;
        // het optellen van meerdere afgeronde breedtes mag 0,005 px afwijken.
        expect(vak!.x).toBeCloseTo(rechts, 2);
        // Hele twips kunnen minder dan één beeldpixel verschil geven.
        expect(Math.abs(vak!.w - voor.cellen.get(doel)!.w / kolommen)).toBeLessThan(1);
        rechts += vak!.w;
      }
      expect(rechts).toBeCloseTo(voor.cellen.get(doel)!.x + voor.cellen.get(doel)!.w, 2);
      expect(na.tabel.x).toBeCloseTo(voor.tabel.x, 3);
      expect(na.tabel.width).toBeCloseTo(voor.tabel.width, 3);
      for (const id of onder) {
        expect(na.cellen.get(id)).toBeDefined();
        expect(voor.cellen.get(id)).toBeDefined();
        expect(na.cellen.get(id)!.x).toBeCloseTo(voor.cellen.get(id)!.x, 3);
        expect(na.cellen.get(id)!.w).toBeCloseTo(voor.cellen.get(id)!.w, 3);
      }
      expect(s.undo()).toBe(true);
      const ongedaan = meet(s);
      for (const id of [...onder, doel]) expect(ongedaan.cellen.get(id)).toEqual(voor.cellen.get(id));
      expect(s.redo()).toBe(true);
      const opnieuw = meet(s);
      expect(opnieuw.cellen).toEqual(na.cellen);
      const bewaard = (await saveYrsDocx(s)).bytes;
      const terug = await createYrsSession();
      try {
        terug.openDocx(bewaard, true);
        const heropend = meet(terug);
        expect(teksten(terug, terug.tablePayload("body", 0) as unknown as Payload)).toEqual(teksten(s, payloadNa));
        expect(heropend.tabel.width).toBeCloseTo(voor.tabel.width, 3);
        // Na heropenen krijgen celverhalen nieuwe technische namen; de
        // ongewijzigde onderste rijen blijven geometrisch gelijk.
        const rijen = (terug.tablePayload("body", 0) as unknown as Payload).rows.slice(1);
        const vakken = rijen.flatMap(r => r.cells.map(c => heropend.cellen.get(c.story)!));
        expect(vakken).toHaveLength(onder.length);
        vakken.forEach((vak, i) => {
          expect(vak.x).toBeCloseTo(voor.cellen.get(onder[i])!.x, 3);
          expect(vak.w).toBeCloseTo(voor.cellen.get(onder[i])!.w, 3);
        });
      } finally { terug.destroy(); }
      if (samen && kolommen === 3 && !breedtes && !voorkeur && !indeling) {
        // Drie cellen vragen vier rasterstroken. Na opnieuw samenvoegen
        // moeten twee zichtbare cellen mogelijk zijn, met behoud van die stroken.
        s.mergeCells({ anchor: { ...tabel, row: 0, column: 0 },
          head: { ...tabel, row: 0, column: payloadNa.grid.length - 1 } });
        s.addUndoBoundary();
        s.splitCell({ ...tabel, row: 0, column: 0 }, 1, 2);
        s.addUndoBoundary();
        const herhaald = s.tablePayload("body", 0) as unknown as Payload;
        const derde = meet(s);
        expect(herhaald.rows[0].cells).toHaveLength(2);
        for (const c of herhaald.rows[0].cells) expect(derde.cellen.get(c.story)!.w).toBeCloseTo(voor.cellen.get(doel)!.w / 2, 2);
        expect(derde.tabel.width).toBeCloseTo(voor.tabel.width, 3);
        for (const id of onder) {
          expect(derde.cellen.get(id)!.x).toBeCloseTo(voor.cellen.get(id)!.x, 3);
          expect(derde.cellen.get(id)!.w).toBeCloseTo(voor.cellen.get(id)!.w, 3);
        }
        expect(s.undo()).toBe(true);
        expect((s.tablePayload("body", 0) as unknown as Payload).rows[0].cells).toHaveLength(1);
        expect(s.redo()).toBe(true);
        expect(meet(s).cellen).toEqual(derde.cellen);
      }
    } finally { s.destroy(); }
  });
});
