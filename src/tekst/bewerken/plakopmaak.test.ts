import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createYrsSession } from "@betteroffice/docx/yrs";
import { maakPlaksessie, pasPlakOpmaakToe } from "./plakopmaak";

const bytes = new Uint8Array(readFileSync("docs/voorbeelden/Ontwerpnotitie.docx"));

describe("plakopmaak op de werkelijke documentposities", () => {
  it("maakt na een leidende tabel precies de nieuwe tekst vet, inclusief de laatste letter", async () => {
    const s = await createYrsSession(); s.openDocx(bytes, true);
    try {
      const laatste = s.paragraphSpans("body").at(-1)!, tekst = "Nieuw 😀", start = { story: "body", paraId: laatste.paraId, offset: laatste.length };
      const tabelVoor = s.storySegments("body").filter(p => p.kind === "embed");
      s.insertText(start, tekst);
      const eind = { ...start, offset: start.offset + tekst.length }, gelezen = s.readParagraphs({ story: "body", view: "accepted" });
      if (!gelezen.ok) throw Error("Geen tekst");
      const plak = maakPlaksessie(gelezen.paragraphs, start, eind, "<p><b>Nieuw 😀</b></p>", null, { x: 0, y: 0 }, s);
      expect(plak?.stukken[0].tekst).toBe(tekst);
      pasPlakOpmaakToe(s, plak!, "behouden");
      expect(s.selectionContext({ story: "body", start, end: eind }).bold).toBe(true);
      expect(s.selectionContext({ story: "body", start: { ...start, offset: start.offset - 1 }, end: start }).bold).toBe(false);
      expect(s.storySegments("body").filter(p => p.kind === "embed")).toEqual(tabelVoor);
    } finally { s.destroy(); }
  });

  it("formatteert geaccepteerde tekst zonder bijgehouden verwijderingen of buurtekst te wijzigen", async () => {
    const s = await createYrsSession(); s.openDocx(bytes, true);
    try {
      const p = s.paragraphs("body")[0], start = { story: "body", paraId: p.paraId, offset: 0 };
      s.insertText(start, "abcd😀ef");
      s.deleteRange({ story: "body", start: { ...start, offset: 2 }, end: { ...start, offset: 4 } }, { name: "Proef", date: "2026-11-03T08:00:00Z" });
      const verwijderd = s.storySegments("body").filter(p => p.kind === "text" && p.attributes.del);
      expect(verwijderd).toHaveLength(1);
      const eind = { ...start, offset: 8 }, gelezen = s.readParagraphs({ story: "body", view: "accepted" });
      const buur = { story: "body", start: eind, end: { ...eind, offset: 9 } }, buurVoor = s.selectionContext(buur);
      if (!gelezen.ok) throw Error("Geen tekst");
      const plak = maakPlaksessie(gelezen.paragraphs, start, eind, "<p><u>ab😀ef</u></p>", null, { x: 0, y: 0 }, s);
      expect(plak?.stukken[0].tekst).toBe("ab😀ef");
      pasPlakOpmaakToe(s, plak!, "behouden");
      expect(s.storySegments("body").filter(p => p.kind === "text" && p.attributes.del)).toEqual(verwijderd);
      expect(s.selectionContext({ story: "body", start: { ...start, offset: 4 }, end: eind }).underline).toBe(true);
      expect(s.selectionContext(buur)).toEqual(buurVoor);
    } finally { s.destroy(); }
  });

  it("behoudt de bron bij een niet overeenkomende geaccepteerde tekstprojectie", async () => {
    const s = await createYrsSession(); s.openDocx(bytes, true);
    try {
      const p = s.paragraphs("body")[0], start = { story: "body", paraId: p.paraId, offset: 0 }, voor = s.storySegments("body");
      expect(maakPlaksessie([{ ...p, text: "Andere projectie" }], start, { ...start, offset: 5 }, "<b>Andere</b>", null, { x: 0, y: 0 }, s)).toBeNull();
      expect(s.storySegments("body")).toEqual(voor);
    } finally { s.destroy(); }
  });
});
