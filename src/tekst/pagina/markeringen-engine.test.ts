import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createYrsSession, saveYrsDocx } from "@betteroffice/docx/yrs";
import { Pakket } from "../../grafieken/pakket";
import { plaatsSectieMarkeringen, sectieMarkeringen } from "./Markeringen";

function bron(soort: string) {
  const p = new Pakket(readFileSync("public/templates/nieuw.docx"));
  const xml = p.lees("word/document.xml");
  const sectie = /<w:sectPr\b[\s\S]*<\/w:sectPr>/.exec(xml)![0];
  const tweede = sectie
    .replace(/<w:type\b[^>]*\/>/, "")
    .replace(/<w:sectPr\b[^>]*>/, (m) => `${m}<w:type w:val="${soort}"/>`);
  p.schrijf(
    "word/document.xml",
    xml.replace(
      /<w:body>[\s\S]*<\/w:body>/,
      `<w:body><w:p><w:pPr>${sectie}</w:pPr><w:r><w:t>Eerste sectie.</w:t></w:r></w:p><w:p><w:r><w:t>Tweede sectie.</w:t></w:r></w:p>${tweede}</w:body>`,
    ),
  );
  return p.inpakken();
}
describe("opmaakmarkeringen voor sectiegrenzen (#55)", () => {
  it("plaatst grenzen uit lege conversiealinea's bij de voorafgaande geschilderde alinea", () => {
    const alineas = ["tekst", "leeg1", "leeg2", "volgende"].map((paraId) => ({
      paraId,
      length: paraId.startsWith("leeg") ? 0 : 10,
    }));
    expect([
      ...plaatsSectieMarkeringen(
        alineas,
        new Map([
          ["leeg1", "continuous"],
          ["leeg2", "nextPage"],
        ]),
        new Set(["tekst", "leeg1", "volgende"]),
      ),
    ]).toEqual([["tekst", ["continuous", "nextPage"]]]);
  });
  it.each(["nextPage", "continuous", "oddPage", "evenPage", "nextColumn"])(
    "vindt %s zonder bron of geschiedenis te wijzigen en na opslaan/heropenen",
    async (soort) => {
      const s = await createYrsSession();
      try {
        s.openDocx(bron(soort), true);
        const versie = s.version();
        const marks = sectieMarkeringen(s);
        expect([...marks.values()]).toEqual([soort]);
        expect(marks.has(s.listSections()[0].closingParagraphId)).toBe(true);
        expect(marks.has("final")).toBe(false);
        expect(s.version()).toBe(versie);
        expect(s.canUndo()).toBe(false);
        const terug = await createYrsSession();
        try {
          terug.openDocx((await saveYrsDocx(s)).bytes, true);
          expect([...sectieMarkeringen(terug).values()]).toEqual([soort]);
        } finally {
          terug.destroy();
        }
      } finally {
        s.destroy();
      }
    },
  );
  it("toont geen sectie-einde voor een document met één sectie", async () => {
    const s = await createYrsSession();
    try {
      s.openDocx(readFileSync("public/templates/nieuw.docx"), true);
      expect(sectieMarkeringen(s).size).toBe(0);
    } finally {
      s.destroy();
    }
  });
});
