import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createYrsSession, saveYrsDocx } from "@betteroffice/docx/yrs";
import { herstelKolommenWeergave } from "../../../scripts/tekstengine-compatibiliteit";
import { Pakket } from "../../grafieken/pakket";
import { kolommenVoorWeergave } from "./kolommenWeergave";

const ZIN = "Dit is een gewone alinea voor de Windows-test van regelafstand, inspringing en paginaopmaak. De tekst loopt automatisch over meerdere regels zodat een wijziging van de regelafstand goed zichtbaar wordt. Alle woorden in dit document zijn zelfgemaakte proeftekst.";
const TEKST = [ZIN, ZIN, ZIN].join(" ");
const eigenschappen = (aantal: number) => ({ pageWidth: 11906, pageHeight: 8391, marginTop: 720, marginRight: 720, marginBottom: 720, marginLeft: 720, columnCount: aantal, columnSpace: 708 });

function proef(aantal: number, uitlijning: string, inspringing: boolean, randen: boolean) {
  const p = new Pakket(readFileSync("public/templates/nieuw.docx"));
  const rand = randen ? "<w:pBdr>" + ["top", "left", "bottom", "right"].map(k => `<w:${k} w:val="single" w:sz="4" w:space="1" w:color="auto"/>`).join("") + "</w:pBdr>" : "";
  const alinea = `<w:p><w:pPr>${rand}${inspringing ? '<w:ind w:left="567"/>' : ""}<w:jc w:val="${uitlijning}"/></w:pPr><w:r><w:t>${TEKST}</w:t></w:r></w:p>`;
  const sectie = `<w:sectPr><w:pgSz w:w="11906" w:h="8391" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/><w:cols w:num="${aantal}" w:space="708"/></w:sectPr>`;
  p.schrijf("word/document.xml", p.lees("word/document.xml").replace(/<w:body>[\s\S]*?<\/w:body>/, `<w:body>${alinea}${sectie}</w:body>`));
  return p.inpakken();
}

describe("leesbare kolommen op een liggende A5-pagina (#143)", () => {
  it("bewaakt de aansluiting op het native indelingsverzoek", () => {
    const bron = readFileSync("node_modules/@betteroffice/docx/dist/chunk-7WWFGMMF.mjs", "utf8");
    expect(herstelKolommenWeergave(bron)).toContain("sections:oosKolomSecties(p(e$1))");
    expect(() => herstelKolommenWeergave("andere engine")).toThrow("kolomweergave");
    expect(() => herstelKolommenWeergave(bron + bron)).toThrow("kolomweergave");
  });
  it("verandert alleen gelijke meervoudige kolommen, zonder documenteigenschappen te muteren", () => {
    const enkel = { properties: Object.freeze({ columnCount: 1 }) };
    const ongelijk = { properties: Object.freeze({ columnCount: 2, equalWidth: false, columns: [{ width: 2000 }, { width: 4000 }] }) };
    const gelijk = { properties: Object.freeze({ columnCount: 2, equalWidth: true, columns: [{ width: 2000 }, { width: 4000 }] }) };
    const uit = kolommenVoorWeergave([enkel, ongelijk, gelijk]);
    expect(uit[0]).toBe(enkel); expect(uit[1]).toBe(ongelijk);
    expect(uit[2].properties).toMatchObject({ columnCount: 2, equalWidth: false, columns: undefined });
    expect(gelijk.properties.equalWidth).toBe(true); expect(gelijk.properties.columns[0].width).toBe(2000);
    expect(kolommenVoorWeergave([{ properties: { columns: [{}, {}] } }])[0].properties).toMatchObject({ columnCount: 2, equalWidth: false });
  });
  it.each([
    [2, "left", false, false], [2, "both", false, false], [2, "both", true, false],
    [2, "both", true, true], [2, "center", true, true], [3, "right", true, true],
  ] as const)("tekent %i kolommen met %s binnen de kolomgrenzen (inspringing %s, randen %s)", async (aantal, uitlijning, inspringing, randen) => {
    const s = await createYrsSession();
    try {
      s.openDocx(proef(aantal, uitlijning, inspringing, randen), true);
      const font = s.registerFont(readFileSync("node_modules/@betteroffice/fonts/assets/Caladea-Regular.ttf"));
      const secties = [{ properties: eigenschappen(aantal) }];
      const verzoek = { bodyStory: "body", renderEnv: {}, options: { pageGap: 24 }, regions: { sections: kolommenVoorWeergave(secties) } };
      const vereisten = JSON.parse(s.layoutFontRequirementsJson(JSON.stringify(verzoek))) as { key: string }[];
      const metMeting = { ...verzoek, measurement: { fontChains: Object.fromEntries(vereisten.map(r => [r.key, [font]])), defaults: { fontSize: 11, fontFamily: "Caladea" }, authoritativeShaping: true } };
      const json = s.layoutDocumentWithRegionsJson(JSON.stringify(metMeting));
      const resultaat = JSON.parse(json);
      const lijst = JSON.parse(s.buildDisplayListJson(json));
      let tekens = 0;
      for (const [paginaIndex, pagina] of lijst.pages.entries()) {
        const fragmenten = resultaat.layout.pages[paginaIndex].fragments.filter((f: { kind: string }) => f.kind === "paragraph");
        for (const fragment of fragmenten) {
          const kolom = pagina.columnBounds.find((k: { x: number }) => Math.abs(k.x - fragment.x) < 0.01);
          expect(kolom).toBeTruthy(); expect(fragment.width).toBeCloseTo(kolom.width, 2);
        }
        for (const t of pagina.primitives) {
          if (t.kind === "text") {
            const fragment = fragmenten.find((f: { pmStart: number }) => f.pmStart === t.fragmentDocStart);
            // Een niet-getekende afsluitende spatie kan buiten de regel liggen.
            if (t.text.trim()) {
              expect(t.x).toBeGreaterThanOrEqual(fragment.x - 0.01);
              expect(t.x + t.width).toBeLessThanOrEqual(fragment.x + fragment.width + 0.01);
            }
            tekens += t.docEnd - t.docStart;
          }
          if (t.role === "border" && t.y1 === t.y2)
            expect(Math.abs(t.x2 - t.x1)).toBeLessThanOrEqual(Math.max(...pagina.columnBounds.map((k: { width: number }) => k.width)) + 3);
        }
      }
      expect(tekens).toBe(TEKST.length);
      expect(s.paragraphs("body")[0].text).toBe(TEKST);
      const xml = new Pakket((await saveYrsDocx(s)).bytes).lees("word/document.xml");
      expect(xml).toContain(`<w:cols w:num="${aantal}" w:space="708"`);
      expect(xml).not.toContain('w:equalWidth="0"');
      expect(secties[0].properties).toEqual(eigenschappen(aantal));
    } finally { s.destroy(); }
  });
});
