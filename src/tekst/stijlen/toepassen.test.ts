import { describe, expect, it } from "vitest";
import { alineaRondCursor, selecteerHeleAlinea } from "./toepassen";
import { createYrsSession } from "@betteroffice/docx/yrs";
import { readFileSync } from "node:fs";
import { Pakket } from "../pagina/ooxml";

describe("alineastijl op de hele alinea", () => {
  it("selecteert de alinea alleen bij een cursor zonder selectie", () => {
    expect(alineaRondCursor({ from: 12, to: 12 }, 10, 40)).toEqual({ van: 10, tot: 40 });
    expect(alineaRondCursor({ from: 12, to: 18 }, 10, 40)).toBeNull();
    // Lege alinea of onbekende posities: niets te selecteren.
    expect(alineaRondCursor({ from: 10, to: 10 }, 10, 10)).toBeNull();
    expect(alineaRondCursor({ from: 10, to: 10 }, null, 40)).toBeNull();
  });

  it("selecteert tekst en inline velden en zet de echte cursor daarna terug", async () => {
    const z = new Pakket(readFileSync("public/templates/nieuw.docx"));
    z.schrijf("word/document.xml", z.lees("word/document.xml").replace("<w:body>", '<w:body><w:p><w:r><w:t>A😀B</w:t></w:r><w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p>'));
    const s = await createYrsSession();
    try {
      s.openDocx(z.inpakken(), true);
      const paraId = s.paragraphs("body")[0].paraId, plek = { story: "body", paraId, offset: 1 };
      s.setSelection(plek);
      const editor = { getYrsSession: () => s, syncYrsInputState: () => {} };
      const herstel = selecteerHeleAlinea({ getEditorRef: () => editor } as never);
      expect(s.selection()).toEqual({ anchor: { ...plek, offset: 0 }, head: { ...plek, offset: 5 } });
      herstel?.();
      expect(s.selection()).toEqual({ anchor: plek, head: plek });
    } finally { s.destroy(); }
  });
});
