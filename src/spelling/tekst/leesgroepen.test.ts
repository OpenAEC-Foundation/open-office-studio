import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import type { Controleur } from "../controleur";
import { SpellingSessie } from "./sessie";

beforeEach(() => vi.stubGlobal("window", { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout }));
afterEach(() => vi.unstubAllGlobals());

function proef() {
  const verhalen = ["body", ...Array.from({ length: 64 }, (_, i) => `body:t0:r${i}c0`)];
  const data = { tekst: "oudfout", versie: "vast" };
  const lees = vi.fn(({ story }: { story: string }) => ({ ok: true, version: data.versie, paragraphs: [{ story, paraId: story + ":p0", text: data.tekst }] }));
  const native = { storyIds: () => verhalen, selection: () => null, version: () => data.versie };
  const editor = { getEditorRef: () => ({ getYrsSession: () => native, getSelectionRange: () => null }) } as unknown as DocxEditorRef;
  const controleer = vi.fn(async (invoer: { tekst: string }[]) => invoer.map(a => [{ tekst: a.tekst, start: 0, eind: a.tekst.length, taal: "nl", punt: false }]));
  const sessie = new SpellingSessie(() => editor, () => ({ controleer }) as unknown as Controleur);
  const plan = vi.spyOn(sessie, "plan").mockImplementation(() => {});
  const ctx = { run: async (f: (v: unknown) => Promise<void>) => f({ read: { readParagraphs: lees }, setState() {} }) } as unknown as Parameters<SpellingSessie["bijContext"]>[0];
  sessie.bijContext(ctx);
  return { sessie, data, lees, controleer, plan, ctx, verhalen };
}

describe("grote spellinglezing blijft onderbreekbaar en brongebonden", () => {
  it("geeft een geplande gebruikersactie tijd voordat alle cellen zijn gelezen, met behoud van alle fouten", async () => {
    const p = proef(); let tijdensActie = -1;
    window.setTimeout(() => { tijdensActie = p.lees.mock.calls.length; }, 0);
    await p.sessie.controleer();
    expect(tijdensActie).toBeGreaterThan(0);
    expect(tijdensActie).toBeLessThan(p.verhalen.length);
    expect(p.lees.mock.calls.map(([r]) => r.story)).toEqual(p.verhalen);
    expect(p.sessie.zichtbareFouten()).toHaveLength(p.verhalen.length);
  });

  it("publiceert geen gemengde lezing bij invoer tussen groepen, ook met dezelfde versiegetter", async () => {
    const p = proef();
    window.setTimeout(() => { p.data.tekst = "nieuwfout"; p.sessie.bijWijziging(p.ctx); }, 0);
    await p.sessie.controleer();
    expect(p.controleer).not.toHaveBeenCalled();
    expect(p.sessie.zichtbareFouten()).toHaveLength(0);
    await p.sessie.controleer();
    expect(p.sessie.zichtbareFouten()).toHaveLength(p.verhalen.length);
    expect(p.sessie.zichtbareFouten().every(x => x.fout.tekst === "nieuwfout")).toBe(true);
  });

  it("laat een oud woordenboekantwoord geen nieuwere invoer schoonmaken", async () => {
    const p = proef(); let klaar!: (v: Awaited<ReturnType<typeof p.controleer>>) => void;
    p.controleer.mockImplementationOnce(() => new Promise(resolve => { klaar = resolve; }));
    const werk = p.sessie.controleer();
    await vi.waitFor(() => expect(p.controleer).toHaveBeenCalledOnce());
    p.data.tekst = "nieuweinvoer"; p.sessie.bijWijziging(p.ctx);
    klaar(p.verhalen.map(() => [{ tekst: "oudfout", start: 0, eind: 7, taal: "nl", punt: false }]));
    await werk;
    expect(p.sessie.zichtbareFouten()).toHaveLength(0);
    await p.sessie.controleer();
    expect(p.sessie.zichtbareFouten()).toHaveLength(p.verhalen.length);
    expect(p.sessie.zichtbareFouten().every(x => x.fout.tekst === "nieuweinvoer")).toBe(true);
  });

  it("stopt een oude lezing bij sluiten en hervat met de nieuwe documentinhoud", async () => {
    const p = proef();
    window.setTimeout(() => p.sessie.stop(), 0);
    await p.sessie.controleer();
    expect(p.controleer).not.toHaveBeenCalled();
    p.data.tekst = "herstart"; p.sessie.start(); await p.sessie.controleer();
    expect(p.sessie.zichtbareFouten()).toHaveLength(p.verhalen.length);
    expect(p.sessie.zichtbareFouten().every(x => x.fout.tekst === "herstart")).toBe(true);
  });

  it("geeft geen volledige foutentelling als één verhaal niet gelezen kon worden", async () => {
    const p = proef();
    p.lees.mockImplementationOnce(() => ({ ok: false, version: "vast", paragraphs: [] }));
    await p.sessie.controleer();
    expect(p.controleer).not.toHaveBeenCalled();
    expect(p.sessie.zichtbareFouten()).toHaveLength(0);
    await p.sessie.controleer();
    expect(p.sessie.zichtbareFouten()).toHaveLength(p.verhalen.length);
  });

  it("weigert ook gemengde documentversies zonder voorafgaande wijzigingsmelding", async () => {
    const p = proef();
    window.setTimeout(() => { p.data.versie = "nieuw"; p.data.tekst = "nieuwfout"; }, 0);
    await p.sessie.controleer();
    expect(p.controleer).not.toHaveBeenCalled();
    await p.sessie.controleer();
    expect(p.sessie.zichtbareFouten()).toHaveLength(p.verhalen.length);
    expect(p.sessie.zichtbareFouten().every(x => x.fout.tekst === "nieuwfout")).toBe(true);
  });

  it("publiceert na sluiten geen reeds onderweg zijnd woordenboekantwoord", async () => {
    const p = proef(); let klaar!: (v: Awaited<ReturnType<typeof p.controleer>>) => void;
    p.controleer.mockImplementationOnce(() => new Promise(resolve => { klaar = resolve; }));
    const werk = p.sessie.controleer();
    await vi.waitFor(() => expect(p.controleer).toHaveBeenCalledOnce());
    p.sessie.stop();
    klaar(p.verhalen.map(() => [{ tekst: "oudfout", start: 0, eind: 7, taal: "nl", punt: false }]));
    await werk;
    expect(p.sessie.zichtbareFouten()).toHaveLength(0);
  });
});
