import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createYrsSession, type YrsSession } from "@betteroffice/docx/yrs";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import { sectieStand } from "./engine";
import { actieveSectie } from "../actieveSectie";

let s: YrsSession;
let ref: DocxEditorRef;
beforeEach(async () => {
  s = await createYrsSession();
  s.openDocx(readFileSync("tests/fixtures/secties.docx"), true);
  const secties = s.listSections();
  ref = {
    getDocument: () => ({ package: { document: {
      finalSectionProperties: secties.at(-1)!.resolved,
      sections: secties.map(x => ({ properties: x.resolved, content: [] })),
    } } }),
    getEditorRef: () => ({ getYrsSession: () => s,
      getSelectionRange: () => ({ from: 0, to: 0 }),
      displayPositionToYrsLoc: () => s.selection()?.head ?? null }),
  } as unknown as DocxEditorRef;
});
afterEach(() => s.destroy());
function cursor(index: number) {
  s.setSelection({ story: "body", paraId: s.paragraphs("body")[index].paraId, offset: 0 });
}

describe("pagina-instellingen horen bij de sectie van de cursor (#44, #55)", () => {
  it("leest de twee kolommen en staande pagina van de eerste sectie", () => {
    cursor(0);
    expect(sectieStand(ref)).toMatchObject({ kolommen: 2, liggend: false, breedte: 11906, aantalSecties: 2 });
  });
  it("volgt de laatste sectie en daarna opnieuw de eerste", () => {
    cursor(5);
    expect(sectieStand(ref)).toMatchObject({ kolommen: 3, liggend: true, breedte: 16838 });
    cursor(1);
    expect(sectieStand(ref)).toMatchObject({ kolommen: 2, liggend: false, breedte: 11906 });
  });
  it("behandelt de afsluitende alinea nog als deel van de eerste sectie", () => {
    cursor(2);
    expect(sectieStand(ref).kolommen).toBe(2);
    cursor(3);
    expect(sectieStand(ref).kolommen).toBe(3);
  });
  it("vindt ook de sectie van een cursor in een geneste tabel", () => {
    cursor(5);
    expect(sectieStand(ref).kolommen).toBe(3);
    const plaats = { story: "body", paraId: s.paragraphs("body")[0].paraId, offset: 0 };
    const cel = s.insertTable(plaats, 1, 1).createdStoryIds[0];
    const binnen = s.insertTable({ story: cel, paraId: s.paragraphs(cel)[0].paraId, offset: 0 }, 1, 1).createdStoryIds[0];
    s.setSelection({ story: binnen, paraId: s.paragraphs(binnen)[0].paraId, offset: 0 });
    expect(sectieStand(ref).kolommen).toBe(2);
  });
  it("ververst de gelezen eigenschappen wanneer de documentversie wijzigt", () => {
    cursor(5);
    expect(sectieStand(ref).liggend).toBe(true);
    s.setSectionProperties(2, { orientation: "portrait", pageWidth: 11906, pageHeight: 16838 });
    expect(sectieStand(ref)).toMatchObject({ liggend: false, breedte: 11906 });
  });
  it("weigert een verdwenen cursoralinea zonder de laatste sectie te kiezen", () => {
    const onbekend = { ...ref, getEditorRef: () => ({ getYrsSession: () => s,
      getSelectionRange: () => ({ from: 0, to: 0 }),
      displayPositionToYrsLoc: () => ({ story: "body", paraId: "verdwenen", offset: 0 }),
    }) } as unknown as DocxEditorRef;
    const versie = s.version();
    expect(actieveSectie(onbekend)).toBeNull();
    expect(s.version()).toBe(versie);
  });
});
