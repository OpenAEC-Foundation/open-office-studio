import { describe, expect, it, vi } from "vitest";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import type { Controleur } from "../controleur";
import { SpellingSessie } from "./sessie";

async function proef() {
  const alinea = (paraId: string, story = "body") => ({ paraId, story, text: "zzfout hier." });
  const alineas = [alinea("A1"), alinea("A2"), alinea("T1", "body:t0:r0c0")];
  const native = {
    storyIds: () => ["body", "body:t0:r0c0"],
    version: () => "1",
    readParagraphs: vi.fn((q: { story: string; paraIds?: string[] }) => ({
      ok: true, version: "1",
      paragraphs: alineas.filter(p => p.story === q.story && (!q.paraIds || q.paraIds.includes(p.paraId))),
    })),
    paragraphSpans: vi.fn((story: string) => alineas.filter(p => p.story === story).map(p => ({ paraId: p.paraId, length: p.text.length }))),
  };
  const ed = {
    getYrsSession: () => native,
    getSelectionRange: vi.fn((): { from: number; to: number } | null => ({ from: 10, to: 10 })),
    displayPositionToYrsLoc: vi.fn((): { story: string; paraId: string; offset: number } | null => ({ story: "body", paraId: "A1", offset: 10 })),
  };
  const editor = { getEditorRef: () => ed } as unknown as DocxEditorRef;
  const controleur = {
    controleer: async (invoer: unknown[]) => invoer.map(() => [{ tekst: "zzfout", start: 0, eind: 6, taal: "nl", punt: false }]),
  } as unknown as Controleur;
  const sessie = new SpellingSessie(() => editor, () => controleur);
  const context = {
    run: async (f: (s: unknown) => unknown) => f({ read: native, setState() {} }),
  } as unknown as Parameters<SpellingSessie["bijWijziging"]>[0];
  // Eerst echt controleren: de cache en zichtbare fouten komen uit de
  // normale publieke levenscyclus, niet uit ingevulde private velden.
  vi.spyOn(sessie, "plan").mockImplementation(() => {});
  sessie.bijContext(context);
  await sessie.controleer();
  expect(sessie.zichtbareFouten()).toHaveLength(3);
  native.readParagraphs.mockClear();
  native.paragraphSpans.mockClear();
  return { sessie, context, native, ed };
}

describe("spelling: een wijziging markeren zonder tekstprojectie op het invoerpad", () => {
  it("verbergt de oude fout van de gewijzigde alinea zonder tekst en lengtes te lezen", async () => {
    const p = await proef();
    p.sessie.bijWijziging(p.context);
    expect(p.sessie.zichtbareFouten().map(f => f.alinea.paraId)).toEqual(["A2", "T1"]);
    expect(p.sessie.plan).toHaveBeenCalledWith(350);
    expect(p.native.readParagraphs).not.toHaveBeenCalled();
    expect(p.native.paragraphSpans).not.toHaveBeenCalled();
  });

  it("markeert ook een tabelcel zonder geaccepteerde cursoroffset te berekenen", async () => {
    const p = await proef();
    p.ed.displayPositionToYrsLoc.mockReturnValue({ story: "body:t0:r0c0", paraId: "T1", offset: 9 });
    p.sessie.bijWijziging(p.context);
    expect(p.sessie.zichtbareFouten().map(f => f.alinea.paraId)).toEqual(["A1", "A2"]);
    expect(p.native.readParagraphs).not.toHaveBeenCalled();
    expect(p.native.paragraphSpans).not.toHaveBeenCalled();
  });

  it.each(["selectie ontbreekt", "locatie ontbreekt", "locatie geeft fout"])("houdt de veilige volledige hercontrole bij %s", async (soort) => {
    const p = await proef();
    if (soort === "selectie ontbreekt") p.ed.getSelectionRange.mockReturnValue(null);
    if (soort === "locatie ontbreekt") p.ed.displayPositionToYrsLoc.mockReturnValue(null);
    if (soort === "locatie geeft fout") p.ed.displayPositionToYrsLoc.mockImplementation(() => { throw new Error("Locatie niet gereed"); });
    expect(() => p.sessie.bijWijziging(p.context)).not.toThrow();
    expect(p.sessie.zichtbareFouten()).toEqual([]);
    expect(p.sessie.plan).toHaveBeenCalledWith(350);
  });
});
