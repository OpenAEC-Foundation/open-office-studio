import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { parseDocx } from "@betteroffice/docx/docx";
import { Pakket, openDocument, zoekAlle, attr } from "../pagina/ooxml";
import {
  leesNootInstellingen,
  voegNootIn,
  zetNootInstellingen,
} from "../pagina/noten";
import { nieuweStijl, leesStijlen } from "../stijlen/stijlenxml";
import { maakLijstStijl } from "../stijlen/beheer";
import {
  voorWriterConversie,
  naWriterConversie,
  type WriterConversie,
} from "./odt";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
function fixture() {
  const z = new Pakket(readFileSync("public/templates/nieuw.docx")),
    d = openDocument(z);
  const inhoud =
    '<w:p><w:pPr><w:sectPr><w:type w:val="nextPage"/></w:sectPr></w:pPr><w:r><w:t>Private Alpha NOTE1</w:t></w:r></w:p><w:p><w:r><w:t>Private Beta NOTE2</w:t></w:r></w:p><w:tbl><w:tblPr><w:tblStyle w:val="CorpusTable"/></w:tblPr><w:tr><w:tc><w:tcPr><w:tcW w:w="2200" w:type="dxa"/></w:tcPr><w:p/></w:tc></w:tr></w:tbl><w:p><w:r><w:t>List item</w:t></w:r></w:p><w:sectPr/>';
  z.schrijf(
    d.pad,
    d.xml.slice(0, d.body.inhoudStart) +
      inhoud +
      d.xml.slice(d.body.inhoudEind),
  );
  let sx = nieuweStijl(z.lees("word/styles.xml"), {
    naam: "CorpusTable",
    soort: "table",
    eigenschappen: {
      tabelArcering: { fill: { rgb: "CCEEDD" } },
      tabelRanden: { top: { style: "double", size: 8 } },
    },
  }).xml;
  sx = nieuweStijl(sx, { naam: "CorpusList", soort: "numbering" }).xml;
  z.schrijf("word/styles.xml", sx);
  z.schrijf("word/vbaProject.bin", strToU8("DO NOT EMBED MACROS"));
  z.schrijf("customXml/item1.xml", "<secret>Private unrelated data</secret>");
  z.voegRelatieToe(
    "word/styles.xml",
    "http://schemas.microsoft.com/office/2006/relationships/vbaProject",
    "word/vbaProject.bin",
  );
  let bytes = voegNootIn(
    z.inpakken(),
    "NOTE1",
    "voetnoot",
    "Private footnote text",
  ).bytes;
  bytes = voegNootIn(bytes, "NOTE2", "eindnoot", "Private endnote text").bytes;
  bytes = zetNootInstellingen(
    bytes,
    "voetnoot",
    {
      notatie: "lowerRoman",
      beginBij: 4,
      herstart: "eachSect",
      positie: "pageBottom",
    },
    0,
  );
  bytes = zetNootInstellingen(
    bytes,
    "voetnoot",
    {
      notatie: "upperLetter",
      beginBij: 7,
      herstart: "eachPage",
      positie: "beneathText",
    },
    1,
  );
  bytes = maakLijstStijl(bytes, {
    styleId: "CorpusList",
    format: "lowerRoman",
    start: 2,
  });
  const p = new Pakket(bytes),
    id = leesStijlen(p.lees("word/styles.xml")).find(
      (s) => s.styleId === "CorpusList",
    )!.eigenschappen.lijst!.numId;
  p.schrijf(
    d.pad,
    p
      .lees(d.pad)
      .replace(
        "<w:p><w:r><w:t>List item",
        `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${id}"/></w:numPr></w:pPr><w:r><w:t>List item`,
      ),
  );
  return p.inpakken();
}
function odf(pre: WriterConversie) {
  const b = pre.bewaar!,
    s = b.secties[0].marker!,
    t = b.tabellen[0].marker,
    l = b.lijsten[0].marker;
  const text = "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
    style = "urn:oasis:names:tc:opendocument:xmlns:style:1.0",
    office = "urn:oasis:names:tc:opendocument:xmlns:office:1.0";
  return zipSync({
    mimetype: [
      strToU8("application/vnd.oasis.opendocument.text"),
      { level: 0 },
    ],
    "content.xml": strToU8(
      `<o:document-content xmlns:o="${office}" xmlns:q="${text}" xmlns:s="${style}" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"><o:automatic-styles><s:style s:name="CellA" s:family="table-cell"/></o:automatic-styles><o:body><o:text><q:p><q:bookmark q:name="${s}"/>Changed Alpha<q:note q:id="n1" q:note-class="footnote"><q:note-citation>1</q:note-citation><q:note-body><q:p>Private footnote text</q:p></q:note-body></q:note></q:p><q:p>Beta<q:note q:id="n2" q:note-class="endnote"><q:note-citation>i</q:note-citation><q:note-body><q:p>Private endnote text</q:p></q:note-body></q:note></q:p><table:table><table:table-row><table:table-cell table:style-name="CellA"><q:p><q:bookmark q:name="${t}"/></q:p></table:table-cell></table:table-row></table:table><q:p><q:bookmark q:name="${l}"/>List item</q:p></o:text></o:body></o:document-content>`,
    ),
    "styles.xml": strToU8(
      `<o:document-styles xmlns:o="${office}" xmlns:q="${text}" xmlns:s="${style}"><o:styles><q:notes-configuration q:note-class="footnote" s:num-format="1" q:start-value="0"/><q:notes-configuration q:note-class="endnote" s:num-format="i" q:start-value="0"/></o:styles></o:document-styles>`,
    ),
    "META-INF/manifest.xml": strToU8(
      '<m:manifest xmlns:m="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"><m:file-entry m:full-path="/" m:media-type="application/vnd.oasis.opendocument.text"/></m:manifest>',
    ),
    "Pictures/keep.bin": new Uint8Array([1, 2, 255]),
  });
}

describe("Writer ODT preservation (#45/#51)", () => {
  it("stores an inert style library, no body text, note text, unrelated data or macros", async () => {
    const pre = await voorWriterConversie(fixture(), "docx", "odt"),
      lib = new Pakket(pre.bibliotheek!);
    expect(
      lib
        .namen()
        .some((n) => /vba|customXml|footnotes|endnotes|header|footer/i.test(n)),
    ).toBe(false);
    for (const pad of lib.namen().filter((n) => n.endsWith(".xml")))
      expect(lib.lees(pad)).not.toMatch(
        /Private Alpha|Private Beta|Private footnote text|Private endnote text|DO NOT EMBED/,
      );
    expect(
      lib.heeft("word/numbering1.xml") || lib.heeft("word/numbering.xml"),
    ).toBe(true);
    expect(
      (await parseDocx(pre.bibliotheek!, { preloadFonts: false })).package
        .document.content,
    ).toHaveLength(1);
    const doc = openDocument(new Pakket(pre.bytes));
    expect(zoekAlle(doc.wortel, "bookmarkStart").length).toBe(3);
    expect(zoekAlle(doc.wortel, "p").some((p) => p.leeg)).toBe(false);
  });
  it("preserves visible citations, standard page restart, native settings, list IDs and table styles across a roundtrip", async () => {
    const source = fixture(),
      pre = await voorWriterConversie(source, "docx", "odt"),
      out = await naWriterConversie(pre, odf(pre)),
      zip = unzipSync(out);
    expect(strFromU8(zip["content.xml"])).toContain('q:label="iv"');
    expect(strFromU8(zip["styles.xml"])).toContain('style:num-format="i"');
    expect(zip["Pictures/keep.bin"]).toEqual(new Uint8Array([1, 2, 255]));
    const back = await voorWriterConversie(out, "odt", "docx");
    const converted = new Pakket(pre.bytes);
    converted.schrijf(
      "word/document.xml",
      converted
        .lees("word/document.xml")
        .replace("Private Alpha", "Edited Alpha")
        .replace(/<w:tblStyle[^>]*\/>/, ""),
    );
    const restored = await naWriterConversie(back, converted.inpakken()),
      z = new Pakket(restored);
    for (const i of [0, 1])
      for (const kind of ["voetnoot", "eindnoot"] as const)
        expect(leesNootInstellingen(restored, kind, i)).toEqual(
          leesNootInstellingen(source, kind, i),
        );
    expect(z.lees("word/document.xml")).toContain("Edited Alpha");
    expect(z.lees("word/document.xml")).not.toContain("_OOSW_");
    expect(z.lees("word/document.xml")).toContain(
      'w:tblStyle w:val="CorpusTable"',
    );
    expect(
      leesStijlen(z.lees("word/styles.xml")).find(
        (s) => s.styleId === "CorpusTable",
      )?.eigenschappen.tabelArcering?.fill?.rgb,
    ).toBe("CCEEDD");
    const doc = await parseDocx(restored, { preloadFonts: false }),
      style = doc.package.styles?.styles.find(
        (s) => s.styleId === "CorpusList",
      );
    expect(
      doc.package.numbering?.nums.some(
        (n) => n.numId === style?.pPr?.numPr?.numId,
      ),
    ).toBe(true);
  });
  it("keeps externally edited formatting instead of replaying an older style snapshot", async () => {
    const pre = await voorWriterConversie(fixture(), "docx", "odt"),
      out = await naWriterConversie(pre, odf(pre)),
      z = unzipSync(out);
    z["content.xml"] = strToU8(strFromU8(z["content.xml"])).slice();
    z["styles.xml"] = strToU8(strFromU8(z["styles.xml"])).slice();
    const sx = strFromU8(z["content.xml"]).replace(
      's:family="table-cell"',
      's:family="table-cell" s:display-name="Externally changed"',
    );
    z["content.xml"] = strToU8(sx);
    const back = await voorWriterConversie(zipSync(z), "odt", "docx"),
      converted = new Pakket(pre.bytes);
    converted.schrijf(
      "word/styles.xml",
      converted
        .lees("word/styles.xml")
        .replace('w:fill="CCEEDD"', 'w:fill="112233"'),
    );
    const restored = new Pakket(
      await naWriterConversie(back, converted.inpakken()),
    );
    expect(restored.lees("word/styles.xml")).toContain('w:fill="112233"');
  });
  it("rejects corrupted preservation data and conversion which drops a note", async () => {
    const pre = await voorWriterConversie(fixture(), "docx", "odt"),
      raw = unzipSync(odf(pre));
    raw["content.xml"] = strToU8(
      strFromU8(raw["content.xml"]).replace(
        'q:note-class="footnote"',
        'q:note-class="endnote"',
      ),
    );
    await expect(naWriterConversie(pre, zipSync(raw))).rejects.toThrow(
      "number of note references",
    );
    const out = unzipSync(await naWriterConversie(pre, odf(pre))),
      data = JSON.parse(strFromU8(out["OpenOfficeStudio/Writer.json"]));
    data.secties[0].voetnoot.beginBij = -99;
    out["OpenOfficeStudio/Writer.json"] = strToU8(JSON.stringify(data));
    await expect(
      voorWriterConversie(zipSync(out), "odt", "docx"),
    ).rejects.toThrow("Invalid preserved note settings");
  });
  it("leaves unrelated formats and ordinary ODT files unchanged", async () => {
    const bytes = fixture(),
      pre = await voorWriterConversie(bytes, "docx", "pdf");
    expect(pre.bytes).toBe(bytes);
    expect(await naWriterConversie(pre, bytes)).toBe(bytes);
    const od = odf(await voorWriterConversie(bytes, "docx", "odt")),
      back = await voorWriterConversie(od, "odt", "docx");
    expect(back.bytes).toBe(od);
    expect(back.bewaar).toBeUndefined();
  });
});
