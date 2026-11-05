import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createYrsSession, saveYrsDocx, type YrsSession } from "@betteroffice/docx/yrs";
import { hoofdletterVervangingen } from "./hoofdletters";
import { wijzigHoofdletters, type Hoofdlettersoort } from "../../lint/tekst-logica";

const BRON = readFileSync("public/templates/nieuw.docx");
const TEKST = "Een alinea met gewone woorden voor een proef van hoofdletters en opmaak. ".repeat(12).slice(0, 785);
async function proef(tekst: string) {
  const s = await createYrsSession();
  s.openDocx(BRON, true);
  s.beginUndoCapture();
  const id = s.paragraphs("body")[0].paraId;
  s.insertText({ story: "body", paraId: id, offset: 0 }, tekst);
  s.addUndoBoundary();
  return { s, id };
}
const bereik = (id: string, begin: number, eind: number) => ({ story: "body", start: { paraId: id, offset: begin }, end: { paraId: id, offset: eind } });
function omzet(s: YrsSession, id: string, soort: Hoofdlettersoort, begin = 0, eind?: number) {
  const alinea = s.readParagraphs({ view: "accepted", paraIds: [id] });
  if (!alinea.ok) throw new Error("Proefalinea ontbreekt");
  const tekst = alinea.paragraphs[0].text;
  const oud = tekst.slice(begin, eind), nieuw = wijzigHoofdletters(oud, soort);
  const plan = hoofdletterVervangingen(s, "body", id, tekst, begin, oud, nieuw);
  expect(plan).not.toBeNull();
  const resultaat = s.applyEdits({
    expectVersion: alinea.version,
    steps: plan!.map((v) => ({ op: "replaceText", target: { kind: "range", ...bereik(id, v.begin, v.eind), view: "accepted" }, text: v.tekst, expect: { text: tekst.slice(v.begin, v.eind) } })),
  });
  expect(resultaat.ok).toBe(true);
  return plan!;
}

describe("hoofdletterconversie van lange alinea's (#142)", () => {
  it("vervangt een gewone alinea van 785 tekens in één stap, met undo, redo en heropenen", async () => {
    const { s, id } = await proef(TEKST);
    try {
      expect(TEKST).toHaveLength(785);
      expect(omzet(s, id, "hoofdletters")).toHaveLength(1);
      expect(s.paragraphs("body")[0].text).toBe(TEKST.toLocaleUpperCase("nl"));
      expect(s.undo()).toBe(true);
      expect(s.paragraphs("body")[0].text).toBe(TEKST);
      expect(s.redo()).toBe(true);
      const terug = await createYrsSession();
      try {
        terug.openDocx((await saveYrsDocx(s)).bytes, true);
        expect(terug.paragraphs("body")[0].text).toBe(TEKST.toLocaleUpperCase("nl"));
      } finally { terug.destroy(); }
    } finally { s.destroy(); }
  });
  it("behoudt vet, cursief en markering binnen een lange selectie", async () => {
    const { s, id } = await proef(TEKST);
    try {
      s.formatRange(bereik(id, 100, 210), { bold: true });
      s.formatRange(bereik(id, 400, 525), { italic: true });
      s.formatRange(bereik(id, 650, 690), { highlight: "#f6d32d" });
      const geel = s.selectionContext(bereik(id, 660, 661)).highlight;
      expect(geel).toBeTruthy();
      s.addUndoBoundary();
      expect(omzet(s, id, "hoofdletters").length).toBeLessThan(128);
      expect(s.selectionContext(bereik(id, 125, 126)).bold).toBe(true);
      expect(s.selectionContext(bereik(id, 350, 351)).bold).toBe(false);
      expect(s.selectionContext(bereik(id, 450, 451)).italic).toBe(true);
      expect(s.selectionContext(bereik(id, 660, 661)).highlight).toBe(geel);
      expect(s.paragraphs("body")[0].text).toBe(TEKST.toLocaleUpperCase("nl"));
    } finally { s.destroy(); }
  });
  it.each([
    ["voor straße na", "hoofdletters", "STRASSE"],
    ["VOOR ΟΣ NA", "kleine", "ος"],
    ["voor 😀 straat na", "hoofdletters", "STRAAT"],
  ] as const)("behoudt tekenopmaak bij Unicode-conversie van %s", async (tekst, soort, woord) => {
    const { s, id } = await proef(tekst);
    try {
      const bronwoord = tekst.includes("straße") ? "straße" : tekst.includes("ΟΣ") ? "ΟΣ" : "straat";
      const start = tekst.indexOf(bronwoord);
      s.formatRange(bereik(id, start, start + bronwoord.length), { bold: true });
      omzet(s, id, soort);
      const nieuw = wijzigHoofdletters(tekst, soort);
      expect(s.paragraphs("body")[0].text).toBe(nieuw);
      const doel = nieuw.indexOf(woord);
      expect(s.selectionContext(bereik(id, doel, doel + woord.length)).bold).toBe(true);
      expect(s.selectionContext(bereik(id, nieuw.length - 2, nieuw.length)).bold).toBe(false);
    } finally { s.destroy(); }
  });
  it("wijzigt alleen de tweede gelijke tekst binnen de gekozen grenzen", async () => {
    const { s, id } = await proef("voor zelfde zelfde na");
    try {
      omzet(s, id, "hoofdletters", 12, 18);
      expect(s.paragraphs("body")[0].text).toBe("voor zelfde ZELFDE na");
    } finally { s.destroy(); }
  });
  it("werkt met de eigen tekststory van een tabelcel", async () => {
    const { s, id } = await proef("");
    try {
      const tabel = s.insertTable({ story: "body", paraId: id, offset: 0 }, 2, 2);
      const story = tabel.createdStoryIds[0], paraId = s.paragraphs(story)[0].paraId;
      s.insertText({ story, paraId, offset: 0 }, TEKST);
      const plan = hoofdletterVervangingen(s, story, paraId, TEKST, 0, TEKST, TEKST.toLocaleUpperCase("nl"));
      expect(plan).toHaveLength(1);
      const resultaat = s.applyEdits({ expectVersion: s.version(), steps: plan!.map((v) => ({
        op: "replaceText", target: { kind: "range", story, start: { paraId, offset: v.begin }, end: { paraId, offset: v.eind }, view: "accepted" }, text: v.tekst,
      })) });
      expect(resultaat.ok).toBe(true);
      expect(s.paragraphs(story)[0].text).toBe(TEKST.toLocaleUpperCase("nl"));
    } finally { s.destroy(); }
  });
});
