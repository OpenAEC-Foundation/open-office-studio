import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Pakket, WREL, WTYPE, documentPad, vindMarkering, verwijderMarkering } from "./ooxml";
import { voegVeldInBijMarkering } from "./kopvoet";
import { pasTabelStijlToe } from "../stijlen/beheer";
import { nieuweStijl } from "../stijlen/stijlenxml";

const bron = readFileSync("public/templates/nieuw.docx");
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const M = "OOSMARKSTORYTESTQ";
const alinea = `<w:p><w:r><w:t>before${M}after</w:t></w:r></w:p>`;

function metDeel(soort: "header" | "footer" | "footnotes" | "endnotes", pad: string, tabel = false) {
  const z = new Pakket(bron), hoofd = documentPad(z);
  const inhoud = tabel ? `<w:tbl><w:tr><w:tc>${alinea}</w:tc></w:tr></w:tbl>` : alinea;
  const element = { header: "hdr", footer: "ftr", footnotes: "footnotes", endnotes: "endnotes" }[soort];
  const noot = soort === "footnotes" ? `<w:footnote w:id="1">${inhoud}</w:footnote>` : soort === "endnotes" ? `<w:endnote w:id="1">${inhoud}</w:endnote>` : inhoud;
  z.schrijf(pad, `<w:${element} xmlns:w="${W}">${noot}</w:${element}>`);
  z.voegOverrideToe(pad, WTYPE[soort]);
  const rid = z.voegRelatieToe(hoofd, WREL[soort], pad);
  if (soort === "header" || soort === "footer")
    z.schrijf(hoofd, z.lees(hoofd).replace(/(<w:sectPr\b[^>]*>)/, `$1<w:${soort}Reference w:type="default" r:id="${rid}"/>`));
  else
    z.schrijf(hoofd, z.lees(hoofd).replace("<w:body>", `<w:body><w:p><w:r><w:${soort === "footnotes" ? "footnote" : "endnote"}Reference w:id="1"/></w:r></w:p>`));
  // An unrelated XML part can contain identical text; it is never a cursor story.
  z.schrijf("customXml/decoy.xml", `<w:root xmlns:w="${W}">${alinea}</w:root>`);
  z.schrijf("word/media/keep.bin", new Uint8Array([0, 128, 255]));
  return z;
}

describe("cursor stories use OPC relationships instead of conventional filenames (#44/#45)", () => {
  it.each([
    ["header", "word/headerCompany.xml"],
    ["footer", "word/bands/company-footer.xml"],
    ["footnotes", "stories/citations/footnotes.xml"],
    ["endnotes", "stories/endnotes-main.xml"],
  ] as const)("finds and removes only the marker in related %s part %s", (soort, pad) => {
    const z = metDeel(soort, pad), decoy = z.lees("customXml/decoy.xml");
    expect(vindMarkering(z, M)).toMatchObject({ pad, ervoor: "before", erna: "after" });
    verwijderMarkering(z, M);
    expect(z.lees(pad)).toContain("beforeafter");
    expect(z.lees(pad)).not.toContain(M);
    expect(z.lees("customXml/decoy.xml")).toBe(decoy);
    expect(z.bytes("word/media/keep.bin")).toEqual(new Uint8Array([0, 128, 255]));
  });
  it("finds the main story through the package relationship, ignoring the old orphan", () => {
    const z = new Pakket(bron), oud = documentPad(z), pad = "stories/main-text.xml";
    z.schrijf(pad, z.lees(oud).replace("<w:body>", `<w:body>${alinea}`));
    z.voegOverrideToe(pad, "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml");
    z.schrijf("_rels/.rels", z.lees("_rels/.rels").replace('Target="word/document.xml"', `Target="${pad}"`));
    z.schrijf(oud, z.lees(oud).replace("<w:body>", `<w:body>${alinea.replace("before", "ORPHAN")}`));
    expect(vindMarkering(z, M)).toMatchObject({ pad, ervoor: "before", erna: "after" });
  });
  it("inserts PAGE/NUMPAGES in a custom-named header without editing the body", () => {
    const pad = "word/headerCompany.xml", z = metDeel("header", pad), body = z.lees(documentPad(z));
    const saved = new Pakket(voegVeldInBijMarkering(z.inpakken(), M, "paginaVan"));
    expect(saved.lees(pad)).toContain("PAGE");
    expect(saved.lees(pad)).toContain("NUMPAGES");
    expect(saved.lees(pad)).not.toContain(M);
    expect(saved.lees(documentPad(saved))).toBe(body);
  });
  it("applies a named table style to a table in a custom-named footer", () => {
    const pad = "word/bands/company-footer.xml", z = metDeel("footer", pad, true);
    z.schrijf("word/styles.xml", nieuweStijl(z.lees("word/styles.xml"), { naam: "WriterPartTable", soort: "table" }).xml);
    const saved = new Pakket(pasTabelStijlToe(z.inpakken(), M, "WriterPartTable"));
    expect(saved.lees(pad)).toContain('<w:tblStyle w:val="WriterPartTable"/>');
    expect(saved.lees(pad)).toContain("beforeafter");
    expect(saved.lees(pad)).not.toContain(M);
    expect(saved.lees(documentPad(saved))).toBe(z.lees(documentPad(z)));
  });
  it("ignores orphan and external parts even when they have conventional header names", () => {
    const z = new Pakket(bron), pad = "word/header1.xml";
    z.schrijf(pad, `<w:hdr xmlns:w="${W}">${alinea}</w:hdr>`);
    z.schrijf("word/_rels/document.xml.rels", z.lees("word/_rels/document.xml.rels").replace("</Relationships>", `<Relationship Id="externalHeader" Type="${WREL.header}" Target="https://example.invalid/header.xml" TargetMode="External"/></Relationships>`));
    expect(vindMarkering(z, M)).toBeNull();
  });
  it("leaves foreign XML text intact and finds only WordprocessingML text", () => {
    const pad = "word/headerCompany.xml", z = metDeel("header", pad);
    z.schrijf(pad, z.lees(pad).replace(alinea, `<x:p xmlns:x="urn:writer-extension"><x:r><x:t>${M}</x:t></x:r></x:p>${alinea}`));
    expect(vindMarkering(z, M)).toMatchObject({ pad, ervoor: "before", erna: "after" });
    verwijderMarkering(z, M);
    expect(z.lees(pad)).toContain(`<x:t>${M}</x:t>`);
    expect(z.lees(pad)).toContain("<w:t>beforeafter</w:t>");
  });
  it("continues to the actual story when another part has the marker only in an extension", () => {
    const z = metDeel("header", "word/headerCompany.xml");
    z.schrijf("word/headerCompany.xml", `<w:hdr xmlns:w="${W}"><x:data xmlns:x="urn:writer-extension">${M}</x:data></w:hdr>`);
    const pad = "word/footerCompany.xml";
    z.schrijf(pad, `<w:ftr xmlns:w="${W}">${alinea}</w:ftr>`);
    z.voegRelatieToe(documentPad(z), WREL.footer, pad);
    expect(vindMarkering(z, M)).toMatchObject({ pad, ervoor: "before", erna: "after" });
  });
});
