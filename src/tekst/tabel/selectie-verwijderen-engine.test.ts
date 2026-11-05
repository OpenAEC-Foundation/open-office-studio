import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createYrsSession } from "@betteroffice/docx/yrs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { herstelVerdwenenCelSelectie } from "../../../scripts/tekstengine-compatibiliteit";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import { tabelNaarTekst } from "./opdrachten";
import { leesCelSelectie } from "./navigatie";

describe("celselectie na verwijderen van de tabel", () => {
  it("bewaakt de aansluiting op de native selectie", () => {
    const bron = readFileSync("node_modules/@betteroffice/docx/dist/chunk-N5NWITJ6.mjs", "utf8");
    expect(herstelVerdwenenCelSelectie(bron)).toContain("()=>e$1.clear_cell_selection()");
    expect(() => herstelVerdwenenCelSelectie("andere engine")).toThrow("verdwenen celselecties");
    expect(() => herstelVerdwenenCelSelectie(bron + bron)).toThrow("verdwenen celselecties");
  });
  it("behoudt geldige selecties en laat andere fouten door", () => {
    const wis = vi.fn(), selectie = { anchor: { row: 1 }, head: { row: 2 } };
    expect(leesCelSelectie(() => selectie, wis)).toBe(selectie);
    expect(leesCelSelectie(() => null, wis)).toBeNull(); expect(wis).not.toHaveBeenCalled();
    expect(() => leesCelSelectie(() => { throw new Error("andere fout"); }, wis)).toThrow("andere fout");
    expect(wis).not.toHaveBeenCalled();
  });
  it("wist een niet meer oplosbare tabelselectie", () => {
    const wis = vi.fn();
    expect(leesCelSelectie(() => { throw "cell selection table no longer resolves"; }, wis)).toBeNull();
    expect(wis).toHaveBeenCalledOnce();
  });
  it("publiceert omzetting zonder een tekstselectie op verwijderde celverhalen", async () => {
    const s = await createYrsSession();
    try {
      s.openDocx(readFileSync("public/templates/nieuw.docx"), true);
      const paraId = s.paragraphs("body")[0].paraId;
      const r = s.insertTable({ story: "body", paraId, offset: 0 }, 2, 2);
      r.createdStoryIds.forEach((story, i) => s.insertText({ story, paraId: s.paragraphs(story)[0].paraId, offset: 0 }, "abcd"[i]));
      const story = r.createdStoryIds[0];
      s.setSelection({ story, paraId: s.paragraphs(story)[0].paraId, offset: 0 });
      const cel = { ...r.table, row: 0, column: 0 };
      s.setCellSelection({ anchor: cel, head: cel });
      const waarnemingen: boolean[] = [];
      const stop = s.onUpdate(() => {
        try { const hoofd = s.selection()?.head; waarnemingen.push(!hoofd || s.storyIds().includes(hoofd.story)); }
        catch { waarnemingen.push(false); }
      });
      const ref = { getEditorRef: () => ({ getYrsSession: () => s, syncYrsInputState: () => true, relayout: () => {} }), commands: { getState: () => ({ value: "editing" }) } } as unknown as DocxEditorRef;
      tabelNaarTekst(ref, { teken: "|" }); stop();
      expect(s.paragraphs("body").slice(0, 2).map(p => p.text)).toEqual(["a|b", "c|d"]);
      expect(waarnemingen.length).toBeGreaterThan(0); expect(waarnemingen.every(Boolean)).toBe(true);
      expect(s.undo()).toBe(true); expect(s.tablePayload("body", 0)).toBeTruthy();
    } finally { s.destroy(); }
  });
  it("kan de echte selectie na tabelverwijdering uitlezen zonder het document te veranderen", async () => {
    const geladen = await createYrsSession(); geladen.destroy();
    const { createEditSession } = await import(/* @vite-ignore */ pathToFileURL(resolve("node_modules/@betteroffice/docx/dist/wasm-edit.mjs")).href);
    const s = createEditSession(7);
    try {
      s.open_docx(readFileSync("public/templates/nieuw.docx"), true);
      const p = JSON.parse(s.paragraphs("body"))[0];
      const r = JSON.parse(s.insert_table("body", p.paraId, 0, 2, 2));
      const cel = { ...r.table, row: 1, column: 1 };
      s.set_cell_selection(JSON.stringify({ anchor: cel, head: cel }));
      s.delete_table(JSON.stringify(r.table));
      expect(() => s.cell_selection()).toThrow();
      const voor = s.story_segments("body");
      expect(leesCelSelectie(() => JSON.parse(s.cell_selection()), () => s.clear_cell_selection())).toBeNull();
      expect(JSON.parse(s.cell_selection())).toBeNull(); expect(s.story_segments("body")).toEqual(voor);
    } finally { s.free(); }
  });
});
