import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import { createYrsSession, saveYrsDocx, type YrsSession } from "@betteroffice/docx/yrs";
import { unzipSync, strFromU8 } from "fflate";
import { bewaarFormule, formuleDoel } from "./opdrachten";

function ref(s: YrsSession) {
  return { getEditorRef: () => ({ getYrsSession: () => s, syncYrsInputState: () => {}, relayout: () => {} }) } as unknown as DocxEditorRef;
}
describe("bewerkbare vergelijkingen in DOCX (#53)", () => {
  it("voegt in, bewerkt, bewaart/heropent en ondersteunt één Undo-stap", async () => {
    const s = await createYrsSession(), terug = await createYrsSession();
    try {
      s.openDocx(readFileSync("public/templates/nieuw.docx"), true);
      const at = { story: "body", paraId: s.paragraphs("body")[0].paraId, offset: 0 };
      s.setSelection(at);
      const api = ref(s);
      bewaarFormule(api, formuleDoel(api), "frac(α,2)", false);
      expect(formuleDoel(api).invoer).toBe("frac(α,2)");
      bewaarFormule(api, formuleDoel(api), "sqrt(sup(x,2))", true);
      expect(formuleDoel(api).display).toBe(true);
      expect(s.undo()).toBe(true); expect(formuleDoel(api).invoer).toBe("frac(α,2)");
      expect(s.redo()).toBe(true); expect(formuleDoel(api).invoer).toBe("sqrt(sup(x,2))");
      const bytes = (await saveYrsDocx(s)).bytes;
      expect(strFromU8(unzipSync(bytes)["word/document.xml"])).toContain("<m:rad>");
      terug.openDocx(bytes, true);
      const loc = { story: "body", paraId: terug.paragraphs("body")[0].paraId, offset: 0 };
      terug.setSelection(loc, { ...loc, offset: 1 });
      expect(formuleDoel(ref(terug)).invoer).toBe("sqrt(sup(x,2))");
    } finally { s.destroy(); terug.destroy(); }
  });
  it("weigert een verouderd doel en ongeldige invoer zonder documentmutatie", async () => {
    const s = await createYrsSession();
    try {
      s.openDocx(readFileSync("public/templates/nieuw.docx"), true);
      const at = { story: "body", paraId: s.paragraphs("body")[0].paraId, offset: 0 };
      s.setSelection(at);
      const api = ref(s), doel = formuleDoel(api);
      s.insertText(at, "Behoud");
      const voor = s.storySegments("body");
      expect(() => bewaarFormule(api, doel, "sqrt(x)", false)).toThrow("changed");
      s.setSelection(at);
      expect(() => bewaarFormule(api, formuleDoel(api), "sqrt(", false)).toThrow();
      expect(s.storySegments("body")).toEqual(voor);
    } finally { s.destroy(); }
  });
});
