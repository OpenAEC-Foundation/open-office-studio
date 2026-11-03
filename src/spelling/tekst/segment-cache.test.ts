import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import { createYrsSession } from "@betteroffice/docx/yrs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { Controleur } from "../controleur";
import { naarRauw, SpellingSessie, type Alinea, type Segment } from "./sessie";
import { foutenInBereik } from "./bereik";

function proef(aantal = 500) {
  let versie = "1";
  const segmenten = new Map<string, Segment[]>();
  const lengtes = new Map<string, { paraId: string; length: number }[]>([["body", Array.from({ length: aantal }, (_, i) => ({ paraId: String(i), length: 20 }))]]);
  const native = {
    version: vi.fn(() => versie),
    paragraphSpans: vi.fn((story: string) => lengtes.get(story) ?? []),
    locateParagraph: vi.fn((story: string, paraId: string) => {
      const p = lengtes.get(story)?.find(p => p.paraId === paraId);
      if (!p) throw new Error("Alinea niet gevonden");
      return { start: 0, end: p.length };
    }),
    storySegments: vi.fn((story: string) => segmenten.get(story) ?? []),
  };
  let actief = native;
  const editor = { getEditorRef: () => ({ getYrsSession: () => actief }) } as unknown as DocxEditorRef;
  const sessie = new SpellingSessie(() => editor, () => ({}) as Controleur);
  const alinea = (paraId = "0", tekst = "abcdefghijklmnopqrst", story = "body"): Alinea => ({ story, paraId, tekst, taal: "nl", fouten: [] });
  return { sessie, native, lengtes, segmenten, alinea, versie: (v: string) => { versie = v; }, vervang: (s: typeof native) => { actief = s; } };
}

describe("spellingoffsets per native sessie en versie", () => {
  it("vraagt de native versie maar eenmaal op tijdens één zichtbare-foutenberekening", () => {
    const p = proef();
    p.sessie.alineas = Array.from({ length: 500 }, (_, i) => ({ ...p.alinea(String(i)), fouten: [{ tekst: "abcde", start: 0, eind: 5, taal: "nl" as const, punt: false }] }));
    const uit = foutenInBereik(p.sessie, { yrsLocToDisplayPosition: p => Number(p.paraId) * 100 + p.offset }, [49900, 49920]);
    expect(uit.map(f => f.alinea.paraId)).toEqual(["499"]);
    expect(p.native.version).toHaveBeenCalledTimes(1);
    expect(p.native.paragraphSpans).toHaveBeenCalledTimes(1);
    expect(p.native.locateParagraph).not.toHaveBeenCalled();
  });

  it("behoudt de offsets van de echte Rust-engine bij Unicode, verwijderingen en tabellen", async () => {
    const pakket = unzipSync(new Uint8Array(readFileSync("public/templates/nieuw.docx")));
    const xml = strFromU8(pakket["word/document.xml"]);
    const sectie = xml.match(/<w:sectPr(?:\s[^>]*)?>[\s\S]*?<\/w:sectPr>|<w:sectPr\b[^>]*\/>/)![0];
    const inhoud = '<w:p><w:r><w:t>A😀bc</w:t></w:r></w:p><w:p><w:r><w:t>voor</w:t></w:r><w:del w:id="1" w:author="Proefauteur"><w:r><w:delText>weg </w:delText></w:r></w:del><w:r><w:t>na</w:t></w:r></w:p><w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="3000"/></w:tblGrid><w:tr><w:tc><w:tcPr/><w:p><w:r><w:t>cel</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p/>';
    pakket["word/document.xml"] = strToU8(xml.replace(/<w:body>[\s\S]*?<\/w:body>/, `<w:body>${inhoud}${sectie}</w:body>`));
    const native = await createYrsSession();
    try {
      native.openDocx(zipSync(pakket), true);
      const editor = { getEditorRef: () => ({ getYrsSession: () => native }) } as unknown as DocxEditorRef;
      const sessie = new SpellingSessie(() => editor, () => ({}) as Controleur);
      expect(native.storyIds().length).toBeGreaterThan(1);
      let getoetst = 0;
      for (const story of native.storyIds()) {
        const gelezen = native.readParagraphs({ view: "accepted", story });
        expect(gelezen.ok).toBe(true);
        if (!gelezen.ok) continue;
        const perAlinea = new Map<string, Segment[]>();
        let delen: Segment[] = [];
        for (const d of native.storySegments(story)) {
          if (d.kind === "pilcrow") { perAlinea.set(d.paraId, delen); delen = []; }
          else delen.push(d as Segment);
        }
        for (const p of gelezen.paragraphs) {
          const alinea: Alinea = { story, paraId: p.paraId, tekst: p.text, taal: "nl", fouten: [] };
          const span = native.locateParagraph(story, p.paraId);
          for (let offset = 0; offset <= p.text.length; offset++) for (const eind of [false, true]) {
            const oud = span.end - span.start === p.text.length ? offset : naarRauw(perAlinea.get(p.paraId) ?? [], offset, eind);
            expect(sessie.rauw(alinea, offset, eind)).toBe(oud);
            getoetst++;
          }
        }
      }
      expect(getoetst).toBeGreaterThan(30);
    } finally { native.destroy(); }
  });

  it("leest 500 alinealengtes eenmaal in plaats van bij iedere woordgrens", () => {
    const p = proef();
    for (let i = 0; i < 500; i++) {
      const a = p.alinea(String(i));
      for (const offset of [0, 5, 10, 20]) expect(p.sessie.rauw(a, offset)).toBe(offset);
    }
    expect(p.native.locateParagraph).not.toHaveBeenCalled();
    expect(p.native.paragraphSpans).toHaveBeenCalledTimes(1);
    expect(p.native.storySegments).not.toHaveBeenCalled();
  });

  it("vernieuwt na bewerken en ongedaan maken, ook bij dezelfde alinea-id", () => {
    const p = proef(1), a = p.alinea("0", "abcdef");
    p.lengtes.set("body", [{ paraId: "0", length: 6 }]);
    expect(p.sessie.rauw(a, 3)).toBe(3);
    p.versie("2"); p.lengtes.set("body", [{ paraId: "0", length: 10 }]);
    p.segmenten.set("body", [{ kind: "text", text: "abc" }, { kind: "text", text: "weg ", attributes: { del: true } }, { kind: "text", text: "def" }, { kind: "pilcrow", paraId: "0" } as Segment]);
    expect(p.sessie.rauw(a, 3)).toBe(7);
    expect(p.sessie.rauw(a, 3, true)).toBe(3);
    p.versie("3"); p.lengtes.set("body", [{ paraId: "0", length: 6 }]);
    expect(p.sessie.rauw(a, 3)).toBe(3);
    expect(p.native.paragraphSpans).toHaveBeenCalledTimes(3);
    expect(p.native.storySegments).toHaveBeenCalledTimes(1);
  });

  it("hergebruikt geen segmenten van een andere sessie met dezelfde versie", () => {
    const p = proef(1), a = p.alinea("0", "abcdef");
    p.lengtes.set("body", [{ paraId: "0", length: 10 }]);
    p.segmenten.set("body", [{ kind: "text", text: "abc" }, { kind: "text", text: "weg ", attributes: { del: true } }, { kind: "text", text: "def" }, { kind: "pilcrow", paraId: "0" } as Segment]);
    expect(p.sessie.rauw(a, 3)).toBe(7);
    const tweede = { ...p.native, storySegments: vi.fn(() => [{ kind: "text", text: "abcdef" }, { kind: "text", text: "weg ", attributes: { del: true } }, { kind: "pilcrow", paraId: "0" } as Segment]) };
    p.vervang(tweede);
    expect(p.sessie.rauw(a, 3)).toBe(3);
    expect(tweede.storySegments).toHaveBeenCalledTimes(1);
  });

  it("houdt verhalen apart en rekent een tabel vóór een lege alinea mee", () => {
    const p = proef(1);
    p.lengtes.set("body", [{ paraId: "0", length: 1 }]);
    p.lengtes.set("body:t0:r0c0", [{ paraId: "0", length: 0 }]);
    p.segmenten.set("body", [{ kind: "embed", embedKind: "table" }, { kind: "pilcrow", paraId: "0" } as Segment]);
    expect(p.sessie.rauw(p.alinea("0", ""), 0)).toBe(1);
    expect(p.sessie.rauw(p.alinea("0", "", "body:t0:r0c0"), 0)).toBe(0);
    expect(p.native.paragraphSpans).toHaveBeenCalledTimes(2);
    expect(p.native.storySegments).toHaveBeenCalledTimes(1);
  });

  it("valt terug op de oorspronkelijke opzoekroute bij ontbrekende of dubbele ids", () => {
    const p = proef(1);
    p.lengtes.set("body", [{ paraId: "0", length: 20 }, { paraId: "0", length: 5 }]);
    expect(p.sessie.rauw(p.alinea(), 5)).toBe(5);
    expect(p.sessie.rauw(p.alinea("ontbreekt"), 5)).toBe(5);
    expect(p.native.locateParagraph).toHaveBeenCalledTimes(2);
  });

  it("blijft de bestaande route gebruiken als de compacte index nog niet beschikbaar is", () => {
    const p = proef(1);
    p.native.paragraphSpans.mockImplementation(() => { throw new Error("Index nog niet gereed"); });
    expect(p.sessie.rauw(p.alinea(), 5)).toBe(5);
    expect(p.native.locateParagraph).toHaveBeenCalledTimes(1);
  });
});
