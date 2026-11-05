/** De spellingtoelevering leest in beide routes dezelfde echte documentinhoud. */
import { readFileSync } from "node:fs";
import { createYrsSession } from "@betteroffice/docx/yrs";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { Controleur } from "../controleur";
import { SpellingSessie } from "./sessie";

let bron: Awaited<ReturnType<typeof createYrsSession>>;
const uit: { gegroepeerd: boolean; invoer: unknown; versie: string; vector: Uint8Array; leesgroepen: number }[] = [];
let oorspronkelijkeVector: Uint8Array;
beforeAll(async () => {
  vi.stubGlobal("window", { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout });
  bron = await createYrsSession({ clientId: 995 });
  bron.openDocx(new Uint8Array(readFileSync("docs/tests/writer-doortypen/bron.docx")), true);
  oorspronkelijkeVector = bron.encodeStateVector();
  for (const gegroepeerd of [false, true]) {
    let invoer: unknown, leesgroepen = 0;
    const controleer = vi.fn(async (a: { tekst: string; taal: string }[]) => { invoer = a; return a.map(() => []); });
    const editor = { getEditorRef: () => ({ getYrsSession: () => bron, getSelectionRange: () => null }) } as unknown as DocxEditorRef;
    const sessie = new SpellingSessie(() => editor, () => ({ controleer }) as unknown as Controleur);
    vi.spyOn(sessie, "plan").mockImplementation(() => {});
    const ctx = { run: async (f: (v: unknown) => Promise<void>) => f({ read: {
      readParagraphs: (r: Parameters<typeof bron.readParagraphs>[0]) => Promise.resolve(bron.readParagraphs(r)),
      ...(gegroepeerd ? { readStories: (r: Parameters<typeof bron.readStories>[0]) => { leesgroepen++; return Promise.resolve(bron.readStories(r)); } } : {}),
    }, setState() {} }) } as unknown as Parameters<SpellingSessie["bijContext"]>[0];
    sessie.bijContext(ctx);
    await sessie.controleer();
    expect(controleer).toHaveBeenCalledOnce(); expect(sessie.probleem).toBeNull();
    uit.push({ gegroepeerd, invoer, versie: bron.version(), vector: bron.encodeStateVector(), leesgroepen });
    sessie.stop();
  }
}, 30_000);
afterAll(() => { bron?.destroy(); vi.unstubAllGlobals(); });

it("behoudt alle 3.329 alinea's, hun volgorde en gekozen talen via de werkelijke spellingsessie", () => {
  expect(bron.storyIds()).toHaveLength(1537);
  expect(uit[0].invoer).toHaveLength(3329);
  expect(uit[1].invoer).toEqual(uit[0].invoer);
  expect(uit[1].leesgroepen).toBeGreaterThan(0); expect(uit[1].leesgroepen).toBeLessThan(1537);
});
it("wijzigt geen bronversie of documentvector door groepering", () => {
  expect(uit[0].versie).toBe(uit[1].versie);
  for (const r of uit) expect(r.vector).toEqual(oorspronkelijkeVector);
});
