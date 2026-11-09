import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createYrsSession, type YrsSession } from "@betteroffice/docx/yrs";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import type { Controleur } from "../controleur";
import { SpellingSessie, type Alinea } from "./sessie";

const BRON = readFileSync("public/templates/nieuw.docx");
function spelling(s: YrsSession) {
  const ref = {
    getEditorRef: () => ({ getYrsSession: () => s }),
  } as unknown as DocxEditorRef;
  return new SpellingSessie(
    () => ref,
    () => ({}) as Controleur,
  );
}
function alinea(s: YrsSession, paraId: string): Alinea {
  const r = s.readParagraphs({
    view: "accepted",
    story: "body",
    paraIds: [paraId],
  });
  if (!r.ok) throw new Error("Proefalinea ontbreekt");
  return {
    story: "body",
    paraId,
    tekst: r.paragraphs[0].text,
    taal: "nl",
    fouten: [],
  };
}

describe("spelling-offsets met echte invoer en revisies", () => {
  it("leest een verhaal eenmaal in plaats van een alinea voor elk foutwoord op te zoeken", async () => {
    const s = await createYrsSession();
    try {
      s.openDocx(BRON, true);
      const paraId = s.paragraphs("body")[0].paraId;
      s.insertText({ story: "body", paraId, offset: 0 }, "huiz ".repeat(100));
      const spans = vi.fn(s.paragraphSpans.bind(s)),
        zoek = vi.fn(s.locateParagraph.bind(s));
      const bron = new Proxy(s, {
        get(target, key) {
          if (key === "paragraphSpans") return spans;
          if (key === "locateParagraph") return zoek;
          const value = Reflect.get(target, key, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      const controle = spelling(bron),
        a = alinea(s, paraId);
      for (let i = 0; i < 100; i++) expect(controle.rauw(a, i * 5)).toBe(i * 5);
      expect(spans).toHaveBeenCalledTimes(1);
      expect(zoek).not.toHaveBeenCalled();
    } finally {
      s.destroy();
    }
  });
  it("bewaart begin-/eindgrenzen van verwijderde tekst, ook na Undo/Redo", async () => {
    const s = await createYrsSession();
    try {
      s.openDocx(BRON, true);
      s.beginUndoCapture();
      const paraId = s.paragraphs("body")[0].paraId;
      s.insertText({ story: "body", paraId, offset: 0 }, "Een oude huiz");
      s.addUndoBoundary();
      const controle = spelling(s),
        oud = alinea(s, paraId);
      expect(controle.rauw(oud, 4)).toBe(4);
      s.deleteRange(
        {
          story: "body",
          start: { paraId, offset: 4 },
          end: { paraId, offset: 9 },
        },
        { name: "Auteur", date: "2026-11-09T10:00:00Z" },
      );
      s.addUndoBoundary();
      const a = alinea(s, paraId),
        versie = s.version();
      expect(a.tekst).toBe("Een huiz");
      for (let i = 0; i < 20; i++) {
        expect(controle.rauw(a, 4)).toBe(9);
        expect(controle.rauw(a, 4, true)).toBe(4);
        expect(controle.rauw(a, 8, true)).toBe(13);
      }
      expect(s.version()).toBe(versie);
      expect(s.undo()).toBe(true);
      expect(controle.rauw(alinea(s, paraId), 4)).toBe(4);
      expect(s.redo()).toBe(true);
      expect(controle.rauw(alinea(s, paraId), 4)).toBe(9);
    } finally {
      s.destroy();
    }
  });
  it("telt een tabel vóór de alinea mee zonder de geaccepteerde tekst te wijzigen", async () => {
    const s = await createYrsSession();
    try {
      s.openDocx(BRON, true);
      const paraId = s.paragraphs("body")[0].paraId;
      s.insertText({ story: "body", paraId, offset: 0 }, "huiz");
      const controle = spelling(s);
      expect(controle.rauw(alinea(s, paraId), 0)).toBe(0);
      s.insertTable({ story: "body", paraId, offset: 0 }, 1, 1);
      const a = alinea(s, paraId);
      expect(a.tekst).toBe("huiz");
      expect(controle.rauw(a, 0)).toBe(1);
      expect(controle.rauw(a, 4, true)).toBe(5);
    } finally {
      s.destroy();
    }
  });
});
