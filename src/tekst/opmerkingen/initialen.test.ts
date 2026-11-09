import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  bewaarOpmerkingInitialen,
  noteerOpmerkingInitialen,
} from "./initialen";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/package/2006/relationships";
const OFFICE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const date = "2026-11-09T10:00:00Z";
function bestand(xml: string) {
  return zipSync(
    Object.fromEntries(
      Object.entries({
        "[Content_Types].xml":
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
        "_rels/.rels": `<Relationships xmlns="${R}"><Relationship Id="d" Type="${OFFICE}/officeDocument" Target="word/document.xml"/></Relationships>`,
        "word/_rels/document.xml.rels": `<Relationships xmlns="${R}"><Relationship Id="c" Type="${OFFICE}/comments" Target="review/comments.xml"/></Relationships>`,
        "word/review/comments.xml": xml,
        "word/document.xml": `<w:document xmlns:w="${W}"><w:body/></w:document>`,
        "customXml/extra.xml": "<keep>Ongewijzigd</keep>",
      }).map(([k, v]) => [k, strToU8(v)]),
    ),
  );
}
const lees = (bytes: Uint8Array) =>
  strFromU8(unzipSync(bytes)["word/review/comments.xml"]);
const ref = () => ({
  getComments: () => [
    { id: 1, author: "Ada", date: date.replace("Z", ".469Z"), content: [] },
  ],
});

describe("initialen van nieuwe opmerkingen (#23)", () => {
  it("bewaart de keuze bij invoegen, met XML-escaping, en behoudt andere auteurs en onderdelen", () => {
    const editor = ref();
    noteerOpmerkingInitialen(editor, editor, 1, ' A&"L ');
    const origineel = bestand(
      `<w:comments xmlns:w="${W}"><w:comment w:id="0" w:author="Piet" w:initials="P"><w:p/></w:comment><w:comment w:id="1" w:author="Ada" w:date="${date}"><w:p><w:r><w:t>Controle</w:t></w:r></w:p></w:comment></w:comments>`,
    );
    const uit = bewaarOpmerkingInitialen(editor, origineel);
    expect(lees(uit)).toContain('w:initials="A&amp;&quot;L"');
    expect(lees(uit)).toContain(
      '<w:comment w:id="0" w:author="Piet" w:initials="P"><w:p/></w:comment>',
    );
    expect(lees(uit)).toContain("<w:p><w:r><w:t>Controle</w:t></w:r></w:p>");
    for (const pad of [
      "word/document.xml",
      "customXml/extra.xml",
      "word/_rels/document.xml.rels",
    ])
      expect(unzipSync(uit)[pad]).toEqual(unzipSync(origineel)[pad]);
    expect(lees(bewaarOpmerkingInitialen(editor, uit))).toBe(lees(uit));
  });

  it("vervangt bestaande engine-initialen en ondersteunt een ander XML-voorvoegsel", () => {
    const editor = ref();
    noteerOpmerkingInitialen(editor, editor, 1, "AL");
    const bytes = bestand(
      `<x:comments xmlns:x="${W}"><x:comment x:id="1" x:author="Ada" x:date="${date}" x:initials='A'/></x:comments>`,
    );
    const xml = lees(bewaarOpmerkingInitialen(editor, bytes));
    expect(xml).toContain('x:initials="AL"/>');
    expect(xml).not.toContain("x:initials='A'");
  });

  it("verandert geen hergebruikte id van een andere auteur of een nieuw document", () => {
    const editor = ref();
    noteerOpmerkingInitialen(editor, editor, 1, "AL");
    for (const [author, datum] of [
      ["Piet", date],
      ["Ada", "2026-11-10T10:00:00Z"],
    ]) {
      const bytes = bestand(
        `<w:comments xmlns:w="${W}"><w:comment w:id="1" w:author="${author}" w:date="${datum}"/></w:comments>`,
      );
      expect(bewaarOpmerkingInitialen(editor, bytes)).toBe(bytes);
    }
    const bytes = bestand(`<w:comments xmlns:w="${W}"/>`);
    expect(bewaarOpmerkingInitialen(ref(), bytes)).toBe(bytes);
  });
});
