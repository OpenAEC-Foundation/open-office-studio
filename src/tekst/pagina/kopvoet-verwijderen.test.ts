import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Pakket, openDocument, leesXml } from "./ooxml";
import {
  effectiefDeel,
  KOPVOET_TYPES,
  verwijderKopVoet,
  voegPaginanummerIn,
  zetEerstePaginaAnders,
  zetEvenOnevenAnders,
  type KopVoetSoort,
} from "./kopvoet";
import type { SectieDoel } from "./secties";
import { createYrsSession, saveYrsDocx } from "@betteroffice/docx/yrs";

function proef(soort: KopVoetSoort) {
  const pakket = new Pakket(new Uint8Array(readFileSync("public/templates/nieuw.docx")));
  const xml = pakket.lees("word/document.xml");
  const sect = /<w:sectPr\b[\s\S]*<\/w:sectPr>/.exec(xml)![0];
  const p = (s: string, einde = false) => `<w:p>${einde ? `<w:pPr>${sect}</w:pPr>` : ""}<w:r><w:t>${s}</w:t></w:r></w:p>`;
  pakket.schrijf("word/document.xml", xml.replace(/<w:body>[\s\S]*<\/w:body>/, `<w:body>${p("Een", true)}${p("Twee", true)}${p("Drie")}${sect}</w:body>`));
  let bytes = zetEvenOnevenAnders(zetEerstePaginaAnders(pakket.inpakken(), "alle", true), true);
  bytes = voegPaginanummerIn(bytes, { positie: soort === "header" ? "boven" : "onder", uitlijning: "links", vorm: "paginaVan", opEerstePagina: true, doel: 0 });
  return bytes;
}

function inhoud(bytes: Uint8Array, soort: KopVoetSoort) {
  const pakket = new Pakket(bytes);
  const doc = openDocument(pakket);
  return [0, 1, 2].map(i => KOPVOET_TYPES.map(type => {
    const deel = effectiefDeel(doc, i, soort, type);
    return deel ? pakket.lees(deel.pad) : "";
  }));
}

describe.each(["header", "footer"] as const)("%s verwijderen per sectie", soort => {
  it.each(([0, 1, 2, [0, 1], [1, 2], [0, 2]] as SectieDoel[]).map(doel => ({ doel, naam: JSON.stringify(doel) })))(
    "verwijdert alleen de gekozen secties: $naam", ({ doel }) => {
      const bytes = proef(soort);
      const voor = inhoud(bytes, soort);
      const gekozen = new Set(typeof doel === "number" ? [doel] : doel === "alle" ? [0, 1, 2] : doel);
      const uit = verwijderKopVoet(bytes, doel, soort);
      const na = inhoud(uit, soort);
      for (let i = 0; i < 3; i++) {
        if (gekozen.has(i)) {
          for (const xml of na[i]) expect(xml).not.toContain("PAGE");
        } else expect(na[i]).toEqual(voor[i]);
      }
      const pakket = new Pakket(uit);
      for (const naam of pakket.namen()) if (/\.(xml|rels)$/.test(naam)) leesXml(pakket.lees(naam));
    },
  );

  it("ruimt alle onderdelen op bij verwijderen uit alle secties", () => {
    const uit = verwijderKopVoet(proef(soort), "alle", soort);
    expect(inhoud(uit, soort)).toEqual([["", "", ""], ["", "", ""], ["", "", ""]]);
    expect(new Pakket(uit).namen().some(n => new RegExp(`word/${soort}\\d+\\.xml$`).test(n))).toBe(false);
  });

  it("behoudt de sectiegrenzen bij bewerken, opslaan en heropenen", async () => {
    let bytes = verwijderKopVoet(proef(soort), 1, soort);
    const voor = inhoud(bytes, soort);
    for (let ronde = 0; ronde < 2; ronde++) {
      const sessie = await createYrsSession();
      try {
        sessie.openDocx(bytes, true);
        const t = sessie.searchText(ronde ? "Gewijzigd" : "Twee", { caseSensitive: true })[0];
        expect(t).toBeDefined();
        sessie.replaceRange({ story: t.story, start: { paraId: t.paraId, offset: t.start }, end: { paraId: t.paraId, offset: t.end } }, ronde ? "Opnieuw" : "Gewijzigd");
        bytes = (await saveYrsDocx(sessie)).bytes;
      } finally { sessie.destroy(); }
      expect(inhoud(bytes, soort)).toEqual(voor);
    }
  });
});
