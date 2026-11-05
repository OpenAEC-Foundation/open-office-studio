import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import type { Controleur } from "../controleur";
import { SpellingSessie } from "./sessie";

beforeEach(() => vi.stubGlobal("window", { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout }));
afterEach(() => vi.unstubAllGlobals());

type Groepsantwoord = { ok: boolean; version: string; view: string; truncated: boolean;
  stories: { story: string; ok: boolean; paragraphs: { story: string; paraId: string; text: string }[] }[] };
function proef(groepsgewijs = false) {
  const verhalen = ["body", ...Array.from({ length: 64 }, (_, i) => `body:t0:r${i}c0`)];
  const data = { tekst: "oudfout", versie: "vast" };
  const lees = vi.fn(({ story }: { story: string }) => ({ ok: true, version: data.versie, paragraphs: [{ story, paraId: story + ":p0", text: data.tekst }] }));
  const maakGroep = (ids: readonly string[]): Groepsantwoord => ({ ok: true, version: data.versie, view: "accepted", truncated: false,
    stories: ids.map(story => ({ story, ok: true, paragraphs: [{ story, paraId: story + ":p0", text: data.tekst }] })) });
  const leesGroep = vi.fn(({ stories }: { stories: readonly string[] }) => maakGroep(stories));
  const abort = new AbortController();
  const native = { storyIds: () => verhalen, selection: () => null, version: () => data.versie };
  const editor = { getEditorRef: () => ({ getYrsSession: () => native, getSelectionRange: () => null }) } as unknown as DocxEditorRef;
  const controleer = vi.fn(async (invoer: { tekst: string }[]) => invoer.map(a => [{ tekst: a.tekst, start: 0, eind: a.tekst.length, taal: "nl", punt: false }]));
  const sessie = new SpellingSessie(() => editor, () => ({ controleer }) as unknown as Controleur);
  const plan = vi.spyOn(sessie, "plan").mockImplementation(() => {});
  const ctx = { run: async (f: (v: unknown) => Promise<void>) => f({ read: { readParagraphs: lees, ...(groepsgewijs ? { readStories: leesGroep } : {}) }, lifetimeSignal: abort.signal, setState() {} }) } as unknown as Parameters<SpellingSessie["bijContext"]>[0];
  sessie.bijContext(ctx);
  return { sessie, data, lees, controleer, plan, ctx, verhalen, leesGroep, maakGroep, abort };
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


describe("gegroepeerde spellingverhalen uit de Rust-leeslaag", () => {
  it("behoudt ieder verhaal en de foutentelling met tijd voor gebruikersacties tussen groepen", async () => {
    const p = proef(true); let tijdensActie = 0;
    window.setTimeout(() => { tijdensActie = p.leesGroep.mock.calls.length; }, 0);
    await p.sessie.controleer();
    expect(p.lees).not.toHaveBeenCalled();
    expect(p.leesGroep.mock.calls.flatMap(([r]) => r.stories)).toEqual(p.verhalen);
    expect(p.leesGroep.mock.calls.every(([r]) => r.stories.length <= 32)).toBe(true);
    expect(tijdensActie).toBeGreaterThan(0); expect(tijdensActie).toBeLessThan(p.leesGroep.mock.calls.length);
    expect(p.sessie.zichtbareFouten()).toHaveLength(p.verhalen.length);
  });

  it("behoudt de gevraagde volgorde als de groepsantwoorden in een andere volgorde staan", async () => {
    const p = proef(true); p.leesGroep.mockImplementation(({ stories }) => {
      const r = p.maakGroep(stories); r.stories.reverse(); return r;
    });
    await p.sessie.controleer();
    expect(p.sessie.zichtbareFouten().map(v => v.alinea.story)).toEqual(p.verhalen);
  });

  for (const fout of ["ontbreekt", "dubbel", "ongevraagd", "geweigerd", "verkeerde alinea", "verkeerde weergave", "hele groep geweigerd"]) {
    it(`publiceert geen gedeeltelijke telling bij ${fout}`, async () => {
      const p = proef(true); p.leesGroep.mockImplementationOnce(({ stories }) => {
        const r = p.maakGroep(stories);
        if (fout === "ontbreekt") r.stories.pop();
        if (fout === "dubbel") r.stories[1] = r.stories[0];
        if (fout === "ongevraagd") r.stories[1] = { ...r.stories[1], story: "vreemd" };
        if (fout === "geweigerd") r.stories[0].ok = false;
        if (fout === "verkeerde alinea") r.stories[0].paragraphs[0].story = "vreemd";
        if (fout === "verkeerde weergave") r.view = "original";
        if (fout === "hele groep geweigerd") r.ok = false;
        return r;
      });
      await p.sessie.controleer(); expect(p.controleer).not.toHaveBeenCalled();
      expect(p.sessie.zichtbareFouten()).toHaveLength(0);
      await p.sessie.controleer(); expect(p.sessie.zichtbareFouten()).toHaveLength(p.verhalen.length);
    });
  }

  it("leest een afgekorte groep opnieuw via de bestaande volledige, onderbreekbare route", async () => {
    const p = proef(true); p.leesGroep.mockImplementation(({ stories }) => ({ ...p.maakGroep(stories), truncated: true, stories: [] }));
    await p.sessie.controleer();
    expect(p.lees.mock.calls.map(([r]) => r.story)).toEqual(p.verhalen);
    expect(p.sessie.zichtbareFouten()).toHaveLength(p.verhalen.length);
  });

  it("weigert een onleesbaar verhaal ook na terugval van een afgekorte groep", async () => {
    const p = proef(true); p.leesGroep.mockImplementationOnce(({ stories }) => ({ ...p.maakGroep(stories), truncated: true }));
    p.lees.mockImplementationOnce(() => ({ ok: false, version: "vast", paragraphs: [] }));
    await p.sessie.controleer(); expect(p.controleer).not.toHaveBeenCalled();
  });

  for (const oorzaak of ["invoer", "nieuwe versie", "sluiten", "afgebroken levensduur"]) {
    it(`verwerpt een groepslezing na ${oorzaak} tussen groepen`, async () => {
      const p = proef(true);
      window.setTimeout(() => {
        p.data.tekst = "nieuwfout";
        if (oorzaak === "invoer") p.sessie.bijWijziging(p.ctx);
        if (oorzaak === "nieuwe versie") p.data.versie = "nieuw";
        if (oorzaak === "sluiten") p.sessie.stop();
        if (oorzaak === "afgebroken levensduur") p.abort.abort();
      }, 0);
      await p.sessie.controleer(); expect(p.controleer).not.toHaveBeenCalled();
      expect(p.sessie.zichtbareFouten()).toHaveLength(0);
    });
  }
});
