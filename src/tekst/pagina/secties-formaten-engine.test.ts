import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createYrsSession, saveYrsDocx } from "@betteroffice/docx/yrs";
import { Pakket } from "../../grafieken/pakket";
import { leesSecties, voegKolomeindeIn } from "./secties";
import { koppelAanVorige } from "./kopvoet";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const veld = (instructie: string) =>
  `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${instructie} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;
function bron(kolommen: number, begin: string) {
  const p = new Pakket(readFileSync("public/templates/nieuw.docx"));
  const ref = (nr: number) =>
    ["header", "footer"]
      .flatMap((soort) =>
        ["default", "first", "even"].map(
          (type) =>
            `<w:${soort}Reference w:type="${type}" r:id="r${soort}${nr}${type}"/>`,
        ),
      )
      .join("");
  const sect = (nr: number, n: number) =>
    `<w:sectPr>${nr < 3 ? ref(nr) : ""}<w:type w:val="${nr === 2 ? begin : "nextPage"}"/><w:pgSz w:w="${nr === 2 ? 16838 : 11906}" w:h="${nr === 2 ? 11906 : 16838}"${nr === 2 ? ' w:orient="landscape"' : ""}/><w:pgMar w:top="${720 + nr * 100}" w:right="${900 + nr * 100}" w:bottom="${1000 + nr * 100}" w:left="${1100 + nr * 100}" w:header="${400 + nr * 50}" w:footer="${450 + nr * 50}"/><w:pgNumType w:fmt="${nr === 2 ? "upperRoman" : "decimal"}" w:start="${nr === 2 ? 7 : 1}"/><w:cols w:num="${n}" w:space="480"${n > 1 ? ' w:sep="1"' : ""}/><w:titlePg/></w:sectPr>`;
  const alinea = (t: string, pr = "") =>
    `<w:p>${pr ? `<w:pPr>${pr}</w:pPr>` : ""}<w:r><w:t>${t}</w:t></w:r></w:p>`;
  const tekst = (nr: number) =>
    Array.from({ length: 8 }, (_, i) =>
      alinea(
        `Section ${nr} paragraph ${i}. ${"The section has its own page settings and retains native fields. ".repeat(5)}`,
      ),
    ).join("");
  const body =
    tekst(1) +
    alinea("End one", sect(1, 1)) +
    alinea("OOSCOLUMNBREAK") +
    tekst(2) +
    alinea("End two", sect(2, kolommen)) +
    tekst(3) +
    sect(3, 1);
  p.schrijf(
    "word/document.xml",
    p
      .lees("word/document.xml")
      .replace(/<w:body>[\s\S]*?<\/w:body>/, `<w:body>${body}</w:body>`),
  );
  let rels = p.lees("word/_rels/document.xml.rels"),
    types = p.lees("[Content_Types].xml");
  for (const nr of [1, 2])
    for (const soort of ["header", "footer"])
      for (const type of ["default", "first", "even"]) {
        const id = `${soort}${nr}${type}`,
          root = soort === "header" ? "hdr" : "ftr",
          inhoud = `<w:p><w:r><w:t>${id}: </w:t></w:r>${veld("PAGE")}<w:r><w:t> of </w:t></w:r>${veld("NUMPAGES")}</w:p>`;
        p.schrijf(
          `word/${id}.xml`,
          `<?xml version="1.0"?><w:${root} xmlns:w="${W}">${inhoud}</w:${root}>`,
        );
        rels = rels.replace(
          "</Relationships>",
          `<Relationship Id="r${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${soort}" Target="${id}.xml"/></Relationships>`,
        );
        types = types.replace(
          "</Types>",
          `<Override PartName="/word/${id}.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${soort}+xml"/></Types>`,
        );
      }
  p.schrijf("word/_rels/document.xml.rels", rels);
  p.schrijf("[Content_Types].xml", types);
  p.schrijf(
    "word/settings.xml",
    p
      .lees("word/settings.xml")
      .replace("</w:settings>", "<w:evenAndOddHeaders/></w:settings>"),
  );
  return voegKolomeindeIn(p.inpakken(), "OOSCOLUMNBREAK");
}

describe("secties, kolomeinden en gekoppelde kop-/voetteksten (#55)", () => {
  it.each(
    [1, 2, 3, 4].flatMap((kolommen) =>
      ["nextPage", "continuous"].map((begin) => ({ kolommen, begin })),
    ),
  )(
    "$kolommen kolommen, $begin: bewaart de drie secties en velden bij bewerken en heropenen",
    async ({ kolommen, begin }) => {
      let bytes = bron(kolommen, begin);
      const verwacht = leesSecties(bytes);
      expect(verwacht).toHaveLength(3);
      expect(verwacht[1].kolommen.aantal).toBe(kolommen);
      expect(verwacht[1].beginBij).toBe(7);
      expect(verwacht[2].verwijzingen).toHaveLength(0);
      for (let ronde = 0; ronde < 2; ronde++) {
        const s = await createYrsSession();
        try {
          s.openDocx(bytes, true);
          expect(s.listSections()).toHaveLength(3);
          const p = s
            .paragraphs("body")
            .find((p) => p.text.startsWith("Section 3"))!;
          s.insertText(
            { story: "body", paraId: p.paraId, offset: p.text.length },
            " Edited.",
          );
          bytes = (await saveYrsDocx(s)).bytes;
        } finally {
          s.destroy();
        }
        expect(leesSecties(bytes)).toEqual(verwacht);
        const p = new Pakket(bytes);
        expect(p.lees("word/document.xml")).toMatch(
          /<w:br\b[^>]*w:type="column"/,
        );
        for (const nr of [1, 2])
          for (const soort of ["header", "footer"])
            for (const type of ["default", "first", "even"]) {
              const xml = p.lees(`word/${soort}${nr}${type}.xml`);
              expect(xml).toContain(`${soort}${nr}${type}: `);
              expect(xml).toMatch(/>\s*PAGE\s*</);
              expect(xml).toContain("NUMPAGES");
            }
      }
      const los = koppelAanVorige(bytes, 2, "header", false);
      expect(
        leesSecties(los)[2].verwijzingen.filter((r) => r.soort === "header"),
      ).toHaveLength(3);
      const gekoppeld = koppelAanVorige(los, 2, "header", true);
      expect(
        leesSecties(gekoppeld)[2].verwijzingen.filter(
          (r) => r.soort === "header",
        ),
      ).toHaveLength(0);
      if (process.env.OOS_SECTIES_UITVOER) {
        mkdirSync(process.env.OOS_SECTIES_UITVOER, { recursive: true });
        writeFileSync(
          join(
            process.env.OOS_SECTIES_UITVOER,
            `secties-${kolommen}-${begin}.docx`,
          ),
          bytes,
        );
      }
    },
  );
});
