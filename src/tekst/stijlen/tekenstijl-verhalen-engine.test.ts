import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createYrsSession, saveYrsDocx } from "@betteroffice/docx/yrs";
import { parseDocx } from "@betteroffice/docx/docx";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import { Pakket, documentPad, WREL, WTYPE } from "../pagina/ooxml";
import { nieuweStijl } from "./stijlenxml";
import { pasTekenstijlToe } from "./toepassen";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const p = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
function fixture() {
  const z = new Pakket(readFileSync("public/templates/nieuw.docx")), hoofd = documentPad(z);
  const body = p("BodyProbe").replace("</w:p>", '<w:r><w:footnoteReference w:id="1"/></w:r><w:r><w:endnoteReference w:id="1"/></w:r></w:p>');
  z.schrijf(hoofd, z.lees(hoofd).replace(/<w:body>[\s\S]*?(<w:sectPr)/, `<w:body>${body}$1`));
  const footer = "word/footerCompany.xml", rid = z.voegRelatieToe(hoofd, WREL.footer, footer);
  z.schrijf(footer, `<w:ftr xmlns:w="${W}">${p("FooterProbe")}<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2200"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="2200" w:type="dxa"/></w:tcPr>${p("CellProbe")}</w:tc></w:tr></w:tbl></w:ftr>`);
  z.voegOverrideToe(footer, WTYPE.footer);
  z.schrijf(hoofd, z.lees(hoofd).replace(/(<w:sectPr\b[^>]*>)/, `$1<w:footerReference w:type="default" r:id="${rid}"/>`));
  for (const [type, element, text] of [["footnotes", "footnote", "FootnoteProbe"], ["endnotes", "endnote", "EndnoteProbe"]] as const) {
    const pad = `word/${type}.xml`;
    z.schrijf(pad, `<w:${type} xmlns:w="${W}"><w:${element} w:id="1">${p(text)}</w:${element}></w:${type}>`);
    z.voegOverrideToe(pad, WTYPE[type]); z.voegRelatieToe(hoofd, WREL[type], pad);
  }
  z.schrijf("word/styles.xml", nieuweStijl(z.lees("word/styles.xml"), { naam: "NativeStoryStyle", soort: "character", eigenschappen: { vet: true, kleur: "225588" } }).xml);
  return z.inpakken();
}

describe("native character styles keep their actual story (#45/#51)", () => {
  it.each([
    ["BodyProbe", "word/document.xml", false],
    ["FooterProbe", "word/footerCompany.xml", false],
    ["CellProbe", "word/footerCompany.xml", false],
    ["CellProbe", "word/footerCompany.xml", true],
    ["FootnoteProbe", "word/footnotes.xml", false],
    ["EndnoteProbe", "word/endnotes.xml", false],
  ] as const)("formats %s in %s, persists and supports Undo/Redo (reverse %s)", async (text, pad, reverse) => {
    const bytes = fixture(), doc = await parseDocx(bytes, { preloadFonts: false }), s = await createYrsSession();
    try {
      s.openDocx(bytes, true);
      const story = s.storyIds().find(id => s.paragraphs(id).some(p => p.text === text))!;
      const paraId = s.paragraphs(story).find(p => p.text === text)!.paraId;
      const start = { story, paraId, offset: 1 }, end = { story, paraId, offset: text.length - 1 };
      s.setSelection(reverse ? end : start, reverse ? start : end);
      const range = { story, start: { paraId, offset: start.offset }, end: { paraId, offset: end.offset } };
      const ref = { getEditorRef: () => ({ getYrsSession: () => s, syncYrsInputState: () => {} }) } as unknown as DocxEditorRef;
      pasTekenstijlToe(ref, doc.package.styles, "NativeStoryStyle", doc.package.theme);
      expect(s.selectionContext(range).bold).toBe(true);
      expect(s.undo()).toBe(true); expect(s.selectionContext(range).bold).toBe(false);
      expect(s.redo()).toBe(true); expect(s.selectionContext(range).bold).toBe(true);
      const saved = (await saveYrsDocx(s)).bytes, z = new Pakket(saved);
      expect(z.lees(pad)).toContain('w:rStyle w:val="NativeStoryStyle"');
      if (pad !== "word/document.xml") expect(z.lees("word/document.xml")).not.toContain('w:rStyle w:val="NativeStoryStyle"');
      const again = await createYrsSession();
      try { again.openDocx(saved, true); expect(again.selectionContext(range).bold).toBe(true); }
      finally { again.destroy(); }
    } finally { s.destroy(); }
  });
});
