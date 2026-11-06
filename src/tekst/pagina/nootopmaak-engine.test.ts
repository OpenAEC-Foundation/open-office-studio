import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openTekstkernProef } from "../../../scripts/tekstkern-proef";
import { Pakket } from "../../grafieken/pakket";
import { herstelNootverwijzingOpmaak } from "../../../scripts/tekstengine-compatibiliteit";

let kern: Awaited<ReturnType<typeof openTekstkernProef>>;
beforeAll(async () => { kern = await openTekstkernProef(); });
afterAll(() => kern?.sluit());

const opmaak = '<w:rPr><w:rStyle w:val="EigenNootmarkering"/><w:b/><w:color w:val="934025"/><w:sz w:val="18"/><w:vertAlign w:val="superscript"/></w:rPr>';

function proef(soort: "footnote" | "endnote", context: string) {
  const p = new Pakket(readFileSync("public/templates/nieuw.docx"));
  const run = `<w:r>${opmaak}<w:${soort}Reference w:id="1"/></w:r>`;
  const inhoud = context === "ins" || context === "del"
    ? `<w:${context} w:id="9" w:author="Matrixproef" w:date="2026-01-01T00:00:00Z">${run}</w:${context}>`
    : context === "koppeling" ? `<w:hyperlink w:anchor="doel">${run}</w:hyperlink>`
    : context === "inhoudsbesturing" ? `<w:sdt><w:sdtPr><w:id w:val="17"/></w:sdtPr><w:sdtContent>${run}</w:sdtContent></w:sdt>`
    : run;
  // Geen alinea-id's: ook de volledige documentprojectie moet de opmaak
  // bewaren; alleen een ongewijzigde bronalinea hergebruiken bewijst dat niet.
  p.schrijf("word/document.xml", p.lees("word/document.xml")
    .replace('<w:document ', '<w:document xmlns:openaec="urn:openaec:matrix" ')
    .replace('mc:Ignorable="w14 wp14"', 'mc:Ignorable="w14 wp14 openaec"')
    .replace(/<w:body>[\s\S]*?<\/w:body>/,
    `<w:body><w:p><w:r><w:t>Verwijzing hier.</w:t></w:r>${inhoud}</w:p><w:p><openaec:markering/><w:r><w:t>Losse proefzin A.</w:t></w:r></w:p><w:sectPr/></w:body>`));
  p.schrijf("word/styles.xml", p.lees("word/styles.xml").replace('</w:styles>',
    '<w:style w:type="character" w:styleId="EigenNootmarkering"><w:name w:val="Eigen nootmarkering"/><w:rPr><w:i/></w:rPr></w:style></w:styles>'));
  p.schrijf(`word/${soort}s.xml`, `<?xml version="1.0"?><w:${soort}s xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:${soort} w:id="1"><w:p><w:r><w:${soort}Ref/></w:r><w:r><w:t>Eigen toelichting.</w:t></w:r></w:p></w:${soort}></w:${soort}s>`);
  p.schrijf("word/_rels/document.xml.rels", p.lees("word/_rels/document.xml.rels").replace('</Relationships>',
    `<Relationship Id="rIdProefNoot" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${soort}s" Target="${soort}s.xml"/></Relationships>`));
  p.schrijf("[Content_Types].xml", p.lees("[Content_Types].xml").replace('</Types>',
    `<Override PartName="/word/${soort}s.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${soort}s+xml"/></Types>`));
  return p.inpakken();
}

describe("nootverwijzingen behouden eigen tekenopmaak bij opslaan (#2)", () => {
  it("weigert een gewijzigde of dubbel aanwezige SDK-aansluiting", () => {
    const bron = readFileSync("node_modules/@betteroffice/docx/dist/chunk-HAZBP3QT.mjs", "utf8");
    expect(() => herstelNootverwijzingOpmaak("andere engine")).toThrow("nootverwijzingen");
    expect(() => herstelNootverwijzingOpmaak(bron + bron)).toThrow("nootverwijzingen");
  });
  const gevallen = (["footnote", "endnote"] as const).flatMap(soort =>
    ["gewoon", "ins", "del", "koppeling", "inhoudsbesturing"].flatMap(context =>
      ["sessie", "editor"].map(route => ({ soort, context, route }))));
  it.each(gevallen)("$soort in $context via $route blijft bewaard na een andere tekstwijziging en heropenen", async ({ soort, context, route }) => {
    let bytes = proef(soort, context);
    for (let ronde = 0; ronde < 2; ronde++) {
      const sessie = await kern.sdk.createYrsSession();
      try {
        sessie.openDocx(bytes, true);
        const document = await kern.docx.parseDocx(bytes, { preloadFonts: false });
        const treffers = sessie.searchText(`Losse proefzin ${ronde ? "B" : "A"}.`, { caseSensitive: true });
        expect(treffers).toHaveLength(1);
        const t = treffers[0];
        sessie.replaceRange({ story: t.story, start: { paraId: t.paraId, offset: t.start }, end: { paraId: t.paraId, offset: t.end } },
          `Losse proefzin ${ronde ? "C" : "B"}.`);
        bytes = route === "sessie" ? (await kern.sdk.saveYrsDocx(sessie)).bytes
          : new Uint8Array(await kern.sdk.saveEditorDocument(sessie, kern.sdk.yrsToDocument(sessie, document), []));
      } finally { sessie.destroy(); }
      const xml = new Pakket(bytes).lees("word/document.xml");
      const run = (xml.match(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g) ?? [])
        .find(r => r.includes(`<w:${soort}Reference `));
      expect(run, "de verwijzing zelf moet blijven bestaan").toBeDefined();
      expect(run).toContain('<w:rStyle w:val="EigenNootmarkering"/>');
      expect(run).toContain('<w:b/>');
      expect(run).toContain('<w:color w:val="934025"/>');
      expect(run).toContain('<w:sz w:val="18"/>');
      expect(run).toContain('<w:vertAlign w:val="superscript"/>');
      if (context === "ins" || context === "del")
        expect(xml).toMatch(new RegExp(`<w:${context}\\b[^>]*>[\\s\\S]*?<w:${soort}Reference[^>]*>[\\s\\S]*?</w:${context}>`));
      if (context === "koppeling")
        expect(xml).toMatch(new RegExp(`<w:hyperlink\\b[^>]*w:anchor="doel"[^>]*>[\\s\\S]*?<w:${soort}Reference[^>]*>[\\s\\S]*?</w:hyperlink>`));
      if (context === "inhoudsbesturing")
        expect(xml).toMatch(new RegExp(`<w:sdtContent>[\\s\\S]*?<w:${soort}Reference[^>]*>[\\s\\S]*?</w:sdtContent>`));
      const terug = await kern.docx.parseDocx(bytes, { preloadFonts: false });
      expect(JSON.stringify(terug.package.document.content)).toContain(`Losse proefzin ${ronde ? "C" : "B"}.`);
    }
  });
  it.each(["footnote", "endnote"] as const)("bewaart een bewust gewijzigde kleur van de %s-verwijzing", async soort => {
    const s = await kern.sdk.createYrsSession();
    try {
      s.openDocx(proef(soort, "gewoon"), true);
      const [t] = s.searchText("Verwijzing hier.", { caseSensitive: true });
      s.formatRange({ story: t.story, start: { paraId: t.paraId, offset: t.end },
        end: { paraId: t.paraId, offset: t.end + 1 } }, { color: { rgb: "236A49" } });
      const bytes = (await kern.sdk.saveYrsDocx(s)).bytes;
      const xml = new Pakket(bytes).lees("word/document.xml");
      const run = (xml.match(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g) ?? []).find(r => r.includes(`<w:${soort}Reference `));
      expect(run).toContain('<w:color w:val="236A49"/>');
      expect(run).toContain('<w:rStyle w:val="EigenNootmarkering"/>');
      expect(run).not.toContain('934025');
    } finally { s.destroy(); }
  });
});
