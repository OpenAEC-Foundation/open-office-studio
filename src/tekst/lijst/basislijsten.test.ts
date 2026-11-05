import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { createYrsSession, saveYrsDocx, type YrsSession } from "@betteroffice/docx/yrs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { attr, kind, kinderen, leesXml } from "../../grafieken/xml";

type Doel = { range: { story: string }; startParagraphIndex: number; endParagraphIndex: number };
type Soort = "bullet" | "numbered";
const pad = resolve("node_modules/@betteroffice/docx-react/dist/openaec-lijst.mjs");
// De daadwerkelijke gepinde enginepatch; geen tweede planner in de proef.
const { applyDocumentList, listKind } = await import(pathToFileURL(pad).href) as {
  applyDocumentList: (s: YrsSession, doel: Doel, soort: Soort) => void;
  listKind: (properties: Record<string, unknown>) => Soort | null;
};
const doel = (van = 0, tot = van): Doel => ({ range: { story: "body" }, startParagraphIndex: van, endParagraphIndex: tot });
const sjabloon = () => new Uint8Array(readFileSync("public/templates/nieuw.docx"));
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function bestand(nummering: string, alineas = '<w:p><w:r><w:t>Eerste lijst 😀</w:t></w:r></w:p><w:p><w:r><w:t>Tweede lijst</w:t></w:r></w:p>') {
  const pakket = unzipSync(sjabloon());
  pakket["word/document.xml"] = strToU8(strFromU8(pakket["word/document.xml"]).replace("<w:p/>", alineas));
  pakket["word/numbering.xml"] = strToU8(`<w:numbering ${W}>${nummering}</w:numbering>`);
  return zipSync(pakket);
}

const definitie = (numId: number, abstractId: number, fmt: string, niveau = 0, overrides = "") =>
  `<w:abstractNum w:abstractNumId="${abstractId}"><w:lvl w:ilvl="${niveau}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${fmt === "bullet" ? "•" : `%${niveau + 1}.`}"/></w:lvl></w:abstractNum><w:num w:numId="${numId}"><w:abstractNumId w:val="${abstractId}"/>${overrides}</w:num>`;

async function keten(s: YrsSession, index = 0) {
  const bytes = (await saveYrsDocx(s)).bytes;
  const pakket = unzipSync(bytes);
  const doc = leesXml(strFromU8(pakket["word/document.xml"]));
  const p = kinderen(kind(doc, "body")!, "p")[index];
  const numPr = kind(kind(p, "pPr"), "numPr");
  const numId = Number(attr(kind(numPr, "numId"), "val"));
  const ilvl = Number(attr(kind(numPr, "ilvl"), "val") ?? 0);
  if (!numId) return { numId, ilvl, fmt: null, bytes };
  const nummering = leesXml(strFromU8(pakket["word/numbering.xml"]));
  const num = kinderen(nummering, "num").find(n => Number(attr(n, "numId")) === numId)!;
  const abstractId = Number(attr(kind(num, "abstractNumId"), "val"));
  const abstract = kinderen(nummering, "abstractNum").find(n => Number(attr(n, "abstractNumId")) === abstractId)!;
  const override = kinderen(num, "lvlOverride").find(n => Number(attr(n, "ilvl")) === ilvl);
  const niveau = kind(override, "lvl") ?? kinderen(abstract, "lvl").find(n => Number(attr(n, "ilvl")) === ilvl);
  return { numId, ilvl, fmt: attr(kind(niveau, "numFmt"), "val"), bytes };
}

describe("basislijsten gebruiken documentdefinities", () => {
  it("bewaart Bullets → Numbering → Bullets met de werkelijke keten en heropent hetzelfde", async () => {
    const s = await createYrsSession();
    try {
      s.openDocx(sjabloon(), true);
      for (const soort of ["bullet", "numbered", "bullet"] as const) {
        applyDocumentList(s, doel(), soort);
        const bewaard = await keten(s);
        expect(bewaard.fmt).toBe(soort === "bullet" ? "bullet" : "decimal");
        expect(listKind(s.paragraphs("body")[0].properties)).toBe(soort);
        const terug = await createYrsSession();
        try {
          terug.openDocx(bewaard.bytes, true);
          expect(listKind(terug.paragraphs("body")[0].properties)).toBe(soort);
        } finally { terug.destroy(); }
      }
      // Het oorspronkelijke nieuwe sjabloon heeft numId=2 juist als bullet.
      const nummering = strFromU8(unzipSync(sjabloon())["word/numbering.xml"]);
      expect(nummering).toContain('w:numId="2"');
    } finally { s.destroy(); }
  });

  it("kent geen gereserveerde ids en bewaart een andere, ongewijzigde lijst", async () => {
    const xml = definitie(88, 41, "bullet") + definitie(1, 53, "decimal") + definitie(2, 64, "lowerRoman");
    const s = await createYrsSession();
    try {
      s.openDocx(bestand(xml), true);
      const tweede = s.paragraphs("body")[1];
      s.setParagraphAttrs({ story: "body", start: { paraId: tweede.paraId, offset: 0 }, end: { paraId: tweede.paraId, offset: 0 } }, { numPr: { numId: 2, ilvl: 0 } });
      applyDocumentList(s, doel(), "bullet");
      expect(await keten(s)).toMatchObject({ numId: 88, fmt: "bullet" });
      applyDocumentList(s, doel(), "numbered");
      expect(await keten(s)).toMatchObject({ numId: 1, fmt: "decimal" });
      expect(await keten(s, 1)).toMatchObject({ numId: 2, fmt: "lowerRoman" });
      expect(strFromU8(unzipSync((await saveYrsDocx(s)).bytes)["word/numbering.xml"])).toBe(`<w:numbering ${W}>${xml}</w:numbering>`);
    } finally { s.destroy(); }
  });

  it("respecteert een niveau-override en houdt alle geselecteerde alinea’s in één geschiedenisstap", async () => {
    const override = '<w:lvlOverride w:ilvl="1"><w:startOverride w:val="7"/><w:lvl w:ilvl="1"><w:numFmt w:val="decimal"/><w:lvlText w:val="%2)"/><w:rPr><w:b w:val="0"/><w:vanish/><w:sz w:val="28"/><w:color w:val="AB1234"/></w:rPr></w:lvl></w:lvlOverride>';
    const s = await createYrsSession();
    try {
      s.openDocx(bestand(definitie(9, 0, "bullet", 1) + definitie(23, 1, "bullet", 1, override)), true);
      for (const p of s.paragraphs("body")) s.setParagraphAttrs({ story: "body", start: { paraId: p.paraId, offset: 0 }, end: { paraId: p.paraId, offset: 0 } }, { numPr: { numId: 9, ilvl: 1 }, listIsBullet: true, listNumFmt: "bullet", listMarkerFontFamily: "Symbol" });
      s.setUndoCaptureMode("manual"); s.addUndoBoundary();
      applyDocumentList(s, doel(0, 1), "numbered");
      const gewijzigd = s.paragraphs("body");
      for (const p of gewijzigd) expect(p.properties).toMatchObject({ numPr: { numId: 23, ilvl: 1 }, listNumFmt: "decimal", listStartOverride: 7, listMarker: "%2)", listMarkerHidden: true, listMarkerBold: false, listMarkerFontSize: 14, listMarkerColor: { rgb: "AB1234" } });
      expect(gewijzigd[0].properties.listMarkerFontFamily).toBeUndefined();
      expect(await keten(s)).toMatchObject({ numId: 23, ilvl: 1, fmt: "decimal" });
      s.addUndoBoundary(); expect(s.undo()).toBe(true);
      for (const p of s.paragraphs("body")) expect(p.properties.numPr).toEqual({ numId: 9, ilvl: 1 });
      expect(s.redo()).toBe(true);
      expect(s.paragraphs("body")).toEqual(gewijzigd);
    } finally { s.destroy(); }
  });

  it("schakelt ook een geïmporteerde bullet met id 2 uit en bewaart expliciet numId=0", async () => {
    const s = await createYrsSession();
    try {
      s.openDocx(bestand(definitie(2, 8, "bullet"), '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr><w:r><w:t>Bestaande opsomming</w:t></w:r></w:p>'), true);
      expect(listKind(s.paragraphs("body")[0].properties)).toBe("bullet");
      applyDocumentList(s, doel(), "bullet");
      expect(listKind(s.paragraphs("body")[0].properties)).toBeNull();
      expect(await keten(s)).toMatchObject({ numId: 0, fmt: null });
    } finally { s.destroy(); }
  });

  it("verandert niets als een van de geselecteerde niveaus geen passende definitie heeft", async () => {
    const s = await createYrsSession();
    try {
      s.openDocx(bestand(definitie(4, 8, "decimal")), true);
      const tweede = s.paragraphs("body")[1];
      s.setParagraphAttrs({ story: "body", start: { paraId: tweede.paraId, offset: 0 }, end: { paraId: tweede.paraId, offset: 0 } }, { numPr: { numId: 10, ilvl: 2 } });
      const voor = s.encodeStateAsUpdate();
      expect(() => applyDocumentList(s, doel(0, 1), "numbered")).toThrow(/list definition/);
      expect(s.encodeStateAsUpdate()).toEqual(voor);
    } finally { s.destroy(); }
  });

  it("onderdrukt een geërfde lijst ook na bewaren en heropenen", async () => {
    const pakket = unzipSync(bestand(definitie(31, 7, "bullet"), '<w:p><w:pPr><w:pStyle w:val="EigenLijst"/></w:pPr><w:r><w:t>Geërfde lijst</w:t></w:r></w:p>'));
    pakket["word/styles.xml"] = strToU8(strFromU8(pakket["word/styles.xml"]).replace('</w:styles>', '<w:style w:type="paragraph" w:styleId="EigenLijst"><w:name w:val="Eigen lijst"/><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="31"/></w:numPr></w:pPr></w:style></w:styles>'));
    const s = await createYrsSession(), terug = await createYrsSession();
    try {
      s.openDocx(zipSync(pakket), true);
      expect(listKind(s.paragraphs("body")[0].properties)).toBe("bullet");
      applyDocumentList(s, doel(), "bullet");
      const bewaard = await keten(s);
      expect(bewaard.numId).toBe(0);
      terug.openDocx(bewaard.bytes, true);
      expect(listKind(terug.paragraphs("body")[0].properties)).toBeNull();
      expect(terug.paragraphs("body")[0].properties.pStyle).toBe("EigenLijst");
    } finally { s.destroy(); terug.destroy(); }
  });

  it("leidt de lintstatus af uit de lijstsoort, ook bij ongebruikelijke ids", () => {
    expect(listKind({ numPr: { numId: 2 }, listIsBullet: true, listNumFmt: "bullet" })).toBe("bullet");
    expect(listKind({ numPr: { numId: 1 }, listIsBullet: false, listNumFmt: "lowerRoman" })).toBe("numbered");
    expect(listKind({ numPr: { numId: 0 }, listIsBullet: true })).toBeNull();
    expect(listKind({ numPr: { numId: 91 } })).toBeNull();
  });
});
