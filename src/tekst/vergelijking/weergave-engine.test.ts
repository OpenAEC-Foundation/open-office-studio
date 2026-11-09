import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import { createYrsSession, saveYrsDocx, type YrsSession } from "@betteroffice/docx/yrs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { bewaarFormule, formuleDoel } from "./opdrachten";
import { werkFormuleWeergaveBij } from "./weergave";
import { leesFormule, omml } from "./model";

function ref(s: YrsSession) { return { getEditorRef: () => ({ getYrsSession: () => s, syncYrsInputState() {}, relayout() {} }) } as unknown as DocxEditorRef; }
describe("equation view data stays separate from author edits", () => {
  it("hydrates imported OMML, preserves Undo and allows an already open equation editor to save", async () => {
    const z = unzipSync(readFileSync("public/templates/nieuw.docx"));
    z["word/document.xml"] = strToU8(strFromU8(z["word/document.xml"]).replace(/<w:body>[\s\S]*?<w:sectPr/, `<w:body><w:p>${omml(leesFormule("frac(a,b)"))}</w:p><w:sectPr`));
    const s = await createYrsSession();
    try {
      s.openDocx(zipSync(z), true); const api = ref(s), at = { story: "body", paraId: s.paragraphs("body")[0].paraId, offset: 0 };
      s.setSelection(at, { ...at, offset: 1 });
      const doel = formuleDoel(api);
      expect(await werkFormuleWeergaveBij(api)).toBe(1);
      expect(await werkFormuleWeergaveBij(api)).toBe(0);
      const math = s.storySegments("body").find(d => d.kind === "embed" && d.embedKind === "math");
      expect(math?.kind === "embed" && math.payload.renderSvg).toMatch(/^data:image\/svg\+xml;base64,/);
      expect(s.canUndo()).toBe(false);
      bewaarFormule(api, doel, "sum(i=1,n,sup(i,2))", true);
      expect(s.undo()).toBe(true); expect(s.undo()).toBe(false);
      const out = strFromU8(unzipSync((await saveYrsDocx(s)).bytes)["word/document.xml"]);
      expect(out).toContain("<m:f>"); expect(out).not.toContain("renderSvg"); expect(out).not.toContain("data:image/svg");
    } finally { s.destroy(); }
  });
});
