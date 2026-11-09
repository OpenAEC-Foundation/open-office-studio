import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createYrsSession, saveYrsDocx } from "@betteroffice/docx/yrs";
import { Pakket, openDocument, secties, kind, attr, leesXml } from "./ooxml";
import { leesNootInstellingen, zetNootInstellingen, type NootSoort } from "./noten";

const begin = { notatie: "lowerRoman", beginBij: 3, herstart: "eachSect", positie: "pageBottom" } as const;
const nieuw = { notatie: "upperLetter", beginBij: 7, herstart: "continuous", positie: "beneathText" } as const;
function proef(soort: NootSoort, globaal = false) {
  const p = new Pakket(new Uint8Array(readFileSync("public/templates/nieuw.docx")));
  const xml = p.lees("word/document.xml");
  const sect = /<w:sectPr\b[\s\S]*<\/w:sectPr>/.exec(xml)![0];
  p.schrijf("word/document.xml", xml.replace(/<w:body>[\s\S]*<\/w:body>/,
    `<w:body><w:p><w:pPr>${sect}</w:pPr><w:r><w:t>Eerste sectie</w:t></w:r></w:p><w:p><w:r><w:t>Tweede sectie</w:t></w:r></w:p>${sect}</w:body>`));
  let bytes = zetNootInstellingen(p.inpakken(), soort, { ...begin, positie: soort === "voetnoot" ? "pageBottom" : "docEnd" });
  if (globaal) {
    const z = new Pakket(bytes);
    const naam = soort === "voetnoot" ? "footnotePr" : "endnotePr";
    const instellingen = new RegExp(`<w:${naam}[^>]*>[\\s\\S]*?</w:${naam}>`).exec(z.lees("word/document.xml"))![0];
    z.schrijf("word/document.xml", z.lees("word/document.xml").replace(new RegExp(`<w:${naam}[^>]*>[\\s\\S]*?</w:${naam}>`, "g"), ""));
    z.schrijf("word/settings.xml", z.lees("word/settings.xml").replace("</w:settings>", `${instellingen}</w:settings>`));
    bytes = z.inpakken();
  }
  return bytes;
}

function direct(bytes: Uint8Array, soort: NootSoort) {
  const doc = openDocument(new Pakket(bytes));
  const naam = soort === "voetnoot" ? "footnotePr" : "endnotePr";
  return secties(doc).map(s => {
    const pr = kind(s.el, naam);
    return { notatie: attr(kind(pr, "numFmt"), "val"), beginBij: attr(kind(pr, "numStart"), "val") };
  });
}

describe.each(["voetnoot", "eindnoot"] as const)("nootinstellingen per sectie: %s", soort => {
  const w = { ...nieuw, positie: soort === "voetnoot" ? "beneathText" : "sectEnd" } as const;
  it("wijzigt alleen de gekozen sectie en leest beide secties afzonderlijk", () => {
    const bytes = zetNootInstellingen(proef(soort), soort, w, 0);
    expect(direct(bytes, soort)).toEqual([{ notatie: "upperLetter", beginBij: "7" }, { notatie: "lowerRoman", beginBij: "3" }]);
    expect(leesNootInstellingen(bytes, soort, 0)).toEqual(w);
    expect(leesNootInstellingen(bytes, soort, 1)).toMatchObject({ ...begin, positie: soort === "voetnoot" ? "pageBottom" : "docEnd" });
  });
  it("behoudt globale oude standaardwaarden in de niet-gekozen sectie", () => {
    const bytes = zetNootInstellingen(proef(soort, true), soort, w, 1);
    expect(direct(bytes, soort)).toEqual([{ notatie: "lowerRoman", beginBij: "3" }, { notatie: "upperLetter", beginBij: "7" }]);
    expect(leesNootInstellingen(bytes, soort, 0)).toMatchObject({ notatie: "lowerRoman", beginBij: 3 });
    const settings = leesXml(new Pakket(bytes).lees("word/settings.xml"));
    expect(kind(kind(settings, soort === "voetnoot" ? "footnotePr" : "endnotePr"), "numFmt")).toBeNull();
  });
  it("blijft het hele document kunnen wijzigen", () => {
    const bytes = zetNootInstellingen(proef(soort), soort, w, "alle");
    expect(direct(bytes, soort)).toEqual([{ notatie: "upperLetter", beginBij: "7" }, { notatie: "upperLetter", beginBij: "7" }]);
  });
  it("bewaart de verschillende instellingen na bewerken en heropenen", async () => {
    let bytes = zetNootInstellingen(proef(soort), soort, w, 0);
    const voor = direct(bytes, soort);
    const s = await createYrsSession();
    try {
      s.openDocx(bytes, true);
      const t = s.searchText("Tweede sectie", { caseSensitive: true })[0];
      s.replaceRange({ story: t.story, start: { paraId: t.paraId, offset: t.start }, end: { paraId: t.paraId, offset: t.end } }, "Gewijzigde tweede sectie");
      bytes = (await saveYrsDocx(s)).bytes;
    } finally { s.destroy(); }
    expect(direct(bytes, soort)).toEqual(voor);
  });
});
