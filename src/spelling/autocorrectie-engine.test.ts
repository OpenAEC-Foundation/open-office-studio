import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createYrsSession, saveYrsDocx } from "@betteroffice/docx/yrs";
import { autocorrectie } from "./autocorrectie";

describe("autocorrectie met hoofdletters en echte DOCX-opslag (#21)", () => {
  it.each([
    ["Voor EIGELIJK ", "Voor EIGENLIJK ", "nl"],
    ["We DONT ", "We DON'T ", "en-GB"],
    ["Voor GEINTERESSEERD!", "Voor GEÏNTERESSEERD!", "nl"],
  ] as const)("behoudt %s, Undo/Redo en heropenen", async (tekst, verwacht, taal) => {
    const s = await createYrsSession();
    try {
      s.openDocx(readFileSync("public/templates/nieuw.docx"), true);
      s.beginUndoCapture();
      const paraId = s.paragraphs("body")[0].paraId;
      s.insertText({ story: "body", paraId, offset: 0 }, tekst);
      s.addUndoBoundary();
      const gelezen = s.readParagraphs({ view: "accepted", story: "body", paraIds: [paraId] });
      if (!gelezen.ok) throw new Error("Proefalinea ontbreekt");
      const c = autocorrectie(gelezen.paragraphs[0].text, tekst.length, { taal });
      expect(c).not.toBeNull();
      // Dezelfde versie- en tekstbewaking als SpellingSessie.autocorrigeer.
      const uit = s.applyEdits({
        expectVersion: gelezen.version,
        steps: [{
          op: "replaceText",
          target: { kind: "range", story: "body", view: "accepted",
            start: { paraId, offset: c!.start }, end: { paraId, offset: c!.eind } },
          text: c!.nieuw, expect: { text: c!.oud },
        }],
      });
      expect(uit.ok).toBe(true);
      s.addUndoBoundary();
      expect(s.paragraphs("body")[0].text).toBe(verwacht);
      expect(s.undo()).toBe(true);
      expect(s.paragraphs("body")[0].text).toBe(tekst);
      expect(s.redo()).toBe(true);
      expect(s.paragraphs("body")[0].text).toBe(verwacht);
      const terug = await createYrsSession();
      try {
        terug.openDocx((await saveYrsDocx(s)).bytes, true);
        expect(terug.paragraphs("body")[0].text).toBe(verwacht);
      } finally { terug.destroy(); }
    } finally { s.destroy(); }
  });
});
