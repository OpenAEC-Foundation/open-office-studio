import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { exportDocxStructuredWithPages } from "@betteroffice/docx";
import { Pakket } from "../grafieken/pakket";
import { tekstKoppelingen } from "./tekstKoppelingen";
import { createYrsSession } from "@betteroffice/docx/yrs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { bladwijzers as documentBladwijzers } from "../tekst/verwijzingen/document";
import { voegInhoudsopgaveIn, STANDAARD_INHOUD } from "../tekst/pagina/inhoudsopgave";

const bron = () => new Uint8Array(readFileSync("docs/tests/nootomzetting-2026-11-06/bron.docx"));
const rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";
const xmlRel = (doel: string) => `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}hyperlink" Target="${doel}" TargetMode="External"/></Relationships>`;
const koppeling = (tekst: string) => `<w:hyperlink r:id="rId1"><w:r><w:t>${tekst}</w:t></w:r></w:hyperlink>`;

async function exporteer(bytes: Uint8Array) {
  return exportDocxStructuredWithPages(bytes, {
    revisionView: "accepted", stories: ["body", "headers", "footers", "footnotes", "endnotes"], includeGeometry: true,
  }, {
    fonts: [{ key: "proef", data: readFileSync("node_modules/@betteroffice/fonts/assets/Caladea-Regular.ttf").toString("base64") }],
    defaultChain: ["proef"],
  });
}

describe("PDF-koppelingen met echte tekst- en paginageometrie (#37, #51)", () => {
  it("includes the actual generated TOC's first cached-field row, not its 1px atom placeholder (#338)", async () => {
    const z = unzipSync(readFileSync("public/templates/nieuw.docx"));
    z["word/document.xml"] = strToU8(strFromU8(z["word/document.xml"]).replace(/<w:body>[\s\S]*?<w:sectPr/,
      '<w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>First</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading1"/><w:pageBreakBefore/></w:pPr><w:r><w:t>Second</w:t></w:r></w:p><w:sectPr'));
    const bytes = voegInhoudsopgaveIn(zipSync(z), null, [{ tekst: "First", niveau: 1, pagina: "1" }, { tekst: "Second", niveau: 1, pagina: "2" }], { ...STANDAARD_INHOUD, titel: "Contents" });
    const session = await createYrsSession();
    try {
      session.openDocx(bytes, true);
      const version = session.version(), inhoud = await exporteer(bytes);
      const doelen = documentBladwijzers(session);
      const links = [...tekstKoppelingen(inhoud, doelen).koppelingen.values()].flat();
      expect(new Set(links.map(k => k.url))).toEqual(new Set(doelen.map(d => `#${d.naam}`)));
      const first = links.filter(k => k.doel?.pagina === 0);
      expect(first).toHaveLength(1);
      expect(first[0].breedte).toBeGreaterThan(100);
      expect(links.some(k => k.doel?.pagina === 1)).toBe(true);
      const mixed = structuredClone(inhoud), control = mixed.structured.stories[0].blocks[0];
      if (control.kind !== "contentControl") throw new Error("Expected generated TOC");
      const row = control.blocks.find(b => "paragraph" in b && b.paragraph.inlines.some(i => i.kind === "field"));
      if (!row || !("paragraph" in row)) throw new Error("Expected cached TOC row");
      const field = row.paragraph.inlines[0];
      if (field.kind !== "field" || field.cachedResult.kind !== "inline") throw new Error("Expected inline cache");
      field.cachedResult.inlines[0].link = { href: links.find(k => k.doel?.pagina === 1)!.url, title: null };
      expect([...tekstKoppelingen(mixed, doelen).koppelingen.values()].flat().some(k => k.doel?.pagina === 0)).toBe(false);
      expect(session.version()).toBe(version);
    } finally { session.destroy(); }
  });
  it("resolves distinct bookmark names on duplicate headings, without inventing missing targets (#338)", async () => {
    const z = unzipSync(readFileSync("public/templates/nieuw.docx"));
    const link = (name: string) => `<w:hyperlink w:anchor="${name}"><w:r><w:t>Link ${name}</w:t></w:r></w:hyperlink>`;
    const heading = (name: string, id: number, pageBreak: boolean) => `<w:p><w:pPr><w:pStyle w:val="Heading1"/>${pageBreak ? "<w:pageBreakBefore/>" : ""}</w:pPr><w:bookmarkStart w:id="${id}" w:name="${name}"/><w:r><w:t>Same heading</w:t></w:r><w:bookmarkEnd w:id="${id}"/></w:p>`;
    const body = `<w:p>${link("First")}${link("Second")}${link("Missing")}</w:p>${heading("First", 1, false)}${heading("Second", 2, true)}`;
    z["word/document.xml"] = strToU8(strFromU8(z["word/document.xml"]).replace(/<w:body>[\s\S]*?<w:sectPr/, `<w:body>${body}<w:sectPr`));
    const bytes = zipSync(z), session = await createYrsSession();
    try {
      session.openDocx(bytes, true);
      const inhoud = await exporteer(bytes), doelen = documentBladwijzers(session);
      const links = [...tekstKoppelingen(inhoud, doelen).koppelingen.values()].flat();
      expect(links.map(k => [k.url, k.doel?.pagina])).toEqual([["#First", 0], ["#Second", 1]]);
      expect(links[0].doel!.y).toBeGreaterThan(links[1].doel!.y);
      expect(links.every(k => k.doel!.x > 0 && k.doel!.y > 0)).toBe(true);
      expect([...tekstKoppelingen(inhoud).koppelingen.values()].flat()).toEqual([]);
      const duplicates = [...doelen, doelen[1]];
      expect([...tekstKoppelingen(inhoud, duplicates).koppelingen.values()].flat().map(k => k.url)).toEqual(["#First"]);
      expect([...tekstKoppelingen({ ...inhoud, layout: { ...inhoud.layout, truncated: true } }, doelen).koppelingen.values()].flat()).toEqual([]);
      expect([...tekstKoppelingen({ ...inhoud, structured: { ...inhoud.structured, revisionView: "original" } }, doelen).koppelingen.values()].flat()).toEqual([]);
      const fragment = inhoud.layout.fragments.find(f => f.anchor.kind === "range" && f.anchor.start.paraId === doelen[0].start.paraId)!;
      const repeated = { ...inhoud, layout: { ...inhoud.layout, fragments: [...inhoud.layout.fragments, { ...fragment, pageIndex: 1, occurrenceId: "repeated" }] } };
      expect([...tekstKoppelingen(repeated, doelen).koppelingen.values()].flat().map(k => k.url)).toEqual(["#Second"]);
    } finally { session.destroy(); }
  });
  it("locates bookmarks inside and at the end of a multi-page paragraph without falling back to its first page", async () => {
    const z = unzipSync(readFileSync("public/templates/nieuw.docx"));
    const body = '<w:p><w:hyperlink w:anchor="Middle"><w:r><w:t>Middle link</w:t></w:r></w:hyperlink><w:hyperlink w:anchor="End"><w:r><w:t>End link</w:t></w:r></w:hyperlink></w:p>' +
      `<w:p><w:r><w:t xml:space="preserve">${"before ".repeat(800)}</w:t></w:r><w:bookmarkStart w:id="1" w:name="Middle"/><w:r><w:t xml:space="preserve">${"after ".repeat(500)}</w:t></w:r><w:bookmarkEnd w:id="1"/><w:bookmarkStart w:id="2" w:name="End"/><w:bookmarkEnd w:id="2"/></w:p>`;
    z["word/document.xml"] = strToU8(strFromU8(z["word/document.xml"]).replace(/<w:body>[\s\S]*?<w:sectPr/, `<w:body>${body}<w:sectPr`));
    const bytes = zipSync(z), session = await createYrsSession();
    try {
      session.openDocx(bytes, true);
      const inhoud = await exporteer(bytes), links = [...tekstKoppelingen(inhoud, documentBladwijzers(session)).koppelingen.values()].flat();
      expect(links).toHaveLength(2);
      expect(links[0].doel!.pagina).toBeGreaterThan(0);
      expect(links[1].doel!.pagina).toBe(inhoud.layout.pages.length - 1);
      expect(links[1].doel!.pagina).toBeGreaterThanOrEqual(links[0].doel!.pagina);
    } finally { session.destroy(); }
  });
  it("vindt de hyperlinks in voetnoten en eindnoten op de juiste pagina", async () => {
    const inhoud = await exporteer(bron());
    const { koppelingen } = tekstKoppelingen(inhoud);
    const gevonden = [...koppelingen].flatMap(([pagina, lijst]) => lijst.map(k => ({ pagina, ...k })));
    expect(gevonden).toHaveLength(2);
    expect(gevonden.map(k => [k.pagina, k.url])).toEqual([
      [0, "https://example.invalid/nootbron"], [1, "https://example.invalid/bestaand"],
    ]);
    for (const k of gevonden) {
      expect(k.y).toBeGreaterThan(500);
      expect(k.breedte).toBeGreaterThan(10);
      expect(k.hoogte).toBeGreaterThan(0);
      expect(k.y + k.hoogte).toBeLessThan(842);
    }
  });

  it("vindt tabelinhoud en herhaalde kop-/voetteksten, zonder koptekstbladwijzers", async () => {
    const p = new Pakket(bron());
    const document = "word/document.xml";
    let xml = p.lees(document);
    const tabelRel = p.voegRelatieToe(document, rel + "hyperlink", "word/tabel-doel");
    p.schrijf(Pakket.relsPad(document), p.lees(Pakket.relsPad(document)).replace(`Id="${tabelRel}" Type="${rel}hyperlink" Target="tabel-doel"`, `Id="${tabelRel}" Type="${rel}hyperlink" Target="https://example.invalid/tabel" TargetMode="External"`));
    const tabel = `<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="9000"/></w:tblGrid><w:tr><w:tc><w:tcPr/><w:p>${koppeling("Tabelkoppeling").replace('r:id="rId1"', `r:id="${tabelRel}"`)}</w:p></w:tc></w:tr></w:tbl>`;
    xml = xml.replace("<w:body>", '<w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Eigen hoofdstuk</w:t></w:r></w:p>' + tabel);
    for (const soort of ["header", "footer"] as const) {
      const pad = `word/pdf-${soort}.xml`;
      p.schrijf(pad, `<w:${soort === "header" ? "hdr" : "ftr"} xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="${rel.slice(0, -1)}"><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${koppeling(soort + " koppeling")}</w:p></w:${soort === "header" ? "hdr" : "ftr"}>`);
      p.schrijf(Pakket.relsPad(pad), xmlRel(`https://example.invalid/${soort}`));
      p.voegOverrideToe(pad, `application/vnd.openxmlformats-officedocument.wordprocessingml.${soort}+xml`);
      const id = p.voegRelatieToe(document, rel + soort, pad);
      xml = xml.replaceAll("<w:sectPr>", `<w:sectPr><w:${soort}Reference w:type="default" r:id="${id}"/>`);
    }
    p.schrijf(document, xml);
    const inhoud = await exporteer(p.inpakken());
    const { koppelingen, bladwijzers } = tekstKoppelingen(inhoud);
    const lijst = [...koppelingen].flatMap(([pagina, ks]) => ks.map(k => ({ pagina, ...k })));
    expect(lijst.filter(k => k.url === "https://example.invalid/tabel")).toHaveLength(1);
    for (const soort of ["header", "footer"])
      expect(lijst.filter(k => k.url === `https://example.invalid/${soort}`).map(k => k.pagina)).toEqual(inhoud.layout.pages.map(p => p.pageIndex));
    expect(bladwijzers.map(b => b.titel)).toEqual(["Eigen hoofdstuk"]);
  });
});
