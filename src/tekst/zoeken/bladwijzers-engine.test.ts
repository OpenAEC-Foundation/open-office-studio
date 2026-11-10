import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import { createYrsSession, saveYrsDocx, type YrsSession } from "@betteroffice/docx/yrs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { bladwijzerDoelen } from "./ganaar";

function bron() {
  const delen = unzipSync(readFileSync("public/templates/nieuw.docx"));
  delen["word/document.xml"] = strToU8(strFromU8(delen["word/document.xml"]).replace(/<w:body>[\s\S]*?<w:sectPr/,
    '<w:body><w:p><w:bookmarkStart w:id="0" w:name="_TocIntern"/><w:r><w:t>Voor </w:t></w:r><w:bookmarkEnd w:id="0"/><w:bookmarkStart w:id="1" w:name="Bestemming"/><w:r><w:t>Hier</w:t></w:r><w:bookmarkEnd w:id="1"/><w:r><w:t> na.</w:t></w:r></w:p>' +
    '<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="4000"/></w:tblGrid><w:tr><w:tc><w:tcPr/><w:p><w:r><w:t>Cel </w:t></w:r><w:bookmarkStart w:id="2" w:name="InTabel"/><w:r><w:t>doel</w:t></w:r><w:bookmarkEnd w:id="2"/></w:p></w:tc></w:tr></w:tbl><w:sectPr'));
  return zipSync(delen);
}
function ref(s: YrsSession) {
  const sync = vi.fn(), scroll = vi.fn(), focus = vi.fn();
  const api = { focus, getEditorRef: () => ({ getYrsSession: () => s,
    syncYrsInputState: sync, yrsLocToDisplayPosition: () => 42, scrollToPosition: scroll }) } as unknown as DocxEditorRef;
  return { api, sync, scroll, focus };
}

describe("naar bestaande bladwijzers navigeren (#52)", () => {
  it("toont gebruikersbladwijzers in hoofdtekst en tabel, zonder interne TOC-markeringen", async () => {
    const s = await createYrsSession();
    try {
      s.openDocx(bron(), true);
      const p = ref(s), doelen = bladwijzerDoelen(p.api);
      expect(doelen.map(d => d.label)).toEqual(["Bestemming", "InTabel"]);
      doelen[0].ga(p.api);
      expect(s.selection()?.head).toMatchObject({ story: "body", paraId: s.paragraphs("body")[0].paraId, offset: 5 });
      doelen[1].ga(p.api);
      expect(s.selection()?.head).toMatchObject({ story: "body:t0:r0c0", offset: 4 });
      expect(p.sync).toHaveBeenLastCalledWith(false, ["body:t0:r0c0"]);
      expect(p.scroll).toHaveBeenCalledWith(42);
      expect(p.focus).toHaveBeenCalledTimes(2);
    } finally { s.destroy(); }
  });
  it("volgt actuele offsets na typen, Undo/Redo en opslaan/heropenen", async () => {
    const s = await createYrsSession(), terug = await createYrsSession();
    try {
      s.openDocx(bron(), true);
      const p = ref(s), doel = bladwijzerDoelen(p.api)[0];
      const at = { story: "body", paraId: s.paragraphs("body")[0].paraId, offset: 0 };
      s.beginUndoCapture(); s.setUndoCaptureMode("manual"); s.addUndoBoundary();
      s.insertText(at, "Nieuw "); s.addUndoBoundary();
      doel.ga(p.api); expect(s.selection()?.head.offset).toBe(11);
      expect(s.undo()).toBe(true); doel.ga(p.api); expect(s.selection()?.head.offset).toBe(5);
      expect(s.redo()).toBe(true); doel.ga(p.api); expect(s.selection()?.head.offset).toBe(11);
      terug.openDocx((await saveYrsDocx(s)).bytes, true);
      const r = ref(terug); bladwijzerDoelen(r.api)[0].ga(r.api);
      expect(terug.selection()?.head.offset).toBe(11);
    } finally { s.destroy(); terug.destroy(); }
  });
  it("weigert een inmiddels verwijderde bladwijzer zonder de cursor te verplaatsen", async () => {
    const s = await createYrsSession();
    try {
      s.openDocx(bron(), true);
      const p = ref(s), doel = bladwijzerDoelen(p.api)[0];
      const at = { paraId: s.paragraphs("body")[0].paraId, offset: 0 };
      // De runtime ondersteunt deze bronmetadata; het publieke stijltype
      // beschrijft uitsluitend de gewone alineaopmaak.
      s.setParagraphAttrs({ story: "body", start: at, end: at }, { bookmarks: [] } as never);
      const voor = s.selection();
      expect(() => doel.ga(p.api)).toThrow();
      expect(s.selection()).toEqual(voor);
      expect(p.focus).not.toHaveBeenCalled();
    } finally { s.destroy(); }
  });
});
