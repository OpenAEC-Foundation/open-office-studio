import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createYrsSession, saveYrsDocx } from "@betteroffice/docx/yrs";
import { parseDocx } from "@betteroffice/docx/docx";
import { Pakket } from "../../grafieken/pakket";
import { datumVeld, VELDEN, veldWaarde, veldPayload, voegVeldIn, werkVeldCachesBij, type VeldOmgeving } from "./model";

const basis = readFileSync("public/templates/nieuw.docx");
const omgeving: VeldOmgeving = { bestandsnaam: "C:\\Documenten\\Proef.docx", auteur: "Ada Lovelace", titel: "First & second <report>", locale: "nl-NL", nu: new Date(2026, 10, 9, 14, 5, 8), paginas: 6, pagina: () => ({ nummer: 4, label: "iv" }) };
describe("general native document fields (#44)", () => {
  it("formats dates, section page numbers, metadata and Word case switches", () => {
    expect(datumVeld(omgeving.nu!, "dddd d MMMM yyyy HH:mm:ss", "nl-NL")).toBe("maandag 9 november 2026 14:05:08");
    expect(veldWaarde(' PAGE ', omgeving, "body", 0)).toBe("iv");
    expect(veldWaarde(' PAGE \\* ROMAN ', omgeving, "body", 0)).toBe("IV");
    expect(veldWaarde(' NUMPAGES ', omgeving, "body", 0)).toBe("6");
    expect(veldWaarde(' FILENAME ', omgeving, "body", 0)).toBe("Proef.docx");
    expect(veldWaarde(' AUTHOR \\* Upper ', omgeving, "body", 0)).toBe("ADA LOVELACE");
    expect(veldWaarde(' REF Bookmark ', omgeving, "body", 0)).toBeNull();
  });
  it("inserts native fields with a reversible step and retains them after saving/reopening", async () => {
    const s = await createYrsSession();
    try {
      s.openDocx(basis, true); const p = s.paragraphs("body")[0].paraId;
      for (const [offset, soort] of VELDEN.entries()) voegVeldIn(s, { story: "body", start: { paraId: p, offset }, end: { paraId: p, offset } }, soort, omgeving);
      const count = () => s.storySegments("body").filter(x => x.kind === "embed" && x.embedKind === "field").length;
      expect(count()).toBe(7); expect(s.undo()).toBe(true); expect(count()).toBe(6); expect(s.redo()).toBe(true); expect(count()).toBe(7);
      const bytes = (await saveYrsDocx(s)).bytes, xml = new Pakket(bytes).lees("word/document.xml");
      expect(xml).toContain("FILENAME"); expect(xml).toContain("First &amp; second &lt;report&gt;");
      const again = await createYrsSession();
      try { again.openDocx(bytes, true); expect(again.storySegments("body").filter(x => x.kind === "embed" && x.embedKind === "field")).toHaveLength(7); } finally { again.destroy(); }
    } finally { s.destroy(); }
  });
  it("updates cached values and model data once, skips locked/unknown fields and preserves instructions", async () => {
    const s = await createYrsSession();
    try {
      s.openDocx(basis, true);
      const payload = veldPayload("TITLE", omgeving, "body", 0), locked = { ...veldPayload("AUTHOR", omgeving, "body", 1), fldLock: true };
      s.applyRawOps("body", [{ op: "insertEmbed", index: 0, kind: "field", payload }, { op: "insertEmbed", index: 1, kind: "field", payload: locked }, { op: "insertEmbed", index: 2, kind: "field", payload: { fieldType: "UNKNOWN", instruction: " CUSTOM_UNTOUCHED ", displayText: "Keep me" } }]);
      const result = werkVeldCachesBij(s, { ...omgeving, titel: "Changed title", auteur: "Changed author" });
      expect(result).toMatchObject({ gewijzigd: 1, onopgelost: [], verhalen: ["body"] });
      const saved = (await saveYrsDocx(s)).bytes, xml = new Pakket(saved).lees("word/document.xml");
      expect(xml).toContain("Changed title"); expect(xml).not.toContain("Changed author"); expect(xml).toContain("Ada Lovelace"); expect(xml).toContain("CUSTOM_UNTOUCHED");
      expect(werkVeldCachesBij(s, { ...omgeving, titel: "Changed title" }).gewijzigd).toBe(0);
      const doc = await parseDocx(saved, { preloadFonts: false }); expect(doc.package.document.content).toHaveLength(1);
      expect(s.undo()).toBe(true);
      expect(new Pakket((await saveYrsDocx(s)).bytes).lees("word/document.xml")).toContain("First &amp; second");
    } finally { s.destroy(); }
  });
});
