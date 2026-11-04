/** Voer de werkelijke vastgezette invoercallback uit, inclusief haar eigen wachtrijgroepering. */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createYrsSession, type YrsSession } from "@betteroffice/docx/yrs";

const bron = readFileSync("node_modules/@betteroffice/docx-react/dist/index.mjs", "utf8");
const begin = bron.indexOf("U=useCallback((h,H,z=false)"), eind = bron.indexOf(",Se=useCallback", begin);
if (begin < 0 || eind < 0) throw Error("Controleer de invoercallback na een SDK-update");
const callback = bron.slice(begin + 2, eind);
const bytes = new Uint8Array(readFileSync("docs/voorbeelden/Ontwerpnotitie.docx"));

async function proef(opties: { native?: boolean; worker?: boolean; suggesting?: boolean; composing?: boolean; expliciet?: boolean; readonly?: boolean } = {}) {
  const s = await createYrsSession({ clientId: 75 }); s.openDocx(bytes, true);
  const positie = { story: "body", paraId: s.paragraphs("body")[0].paraId, offset: 7 };
  s.setSelection(positie);
  let actueel = true;
  const taken: (() => Promise<void>)[] = [], publiceer = vi.fn(), resident = vi.fn(async () => null);
  const native = vi.fn(async (u: YrsSession, p: typeof positie, tekst: string) => {
    const r = u.insertText(p, tekst); u.setSelection({ story: p.story, ...r.range!.end }); return true;
  });
  const he = { current: new Map(opties.expliciet ? [[`body\0${positie.paraId}`, { clear: false, delta: { italic: true } }]] : []) };
  const context = {
    useCallback: (fn: unknown) => fn, Ue: { current: { reset() {} } }, u: s, n: !!opties.readonly,
    Ee: () => false, Nt() {}, ke: () => s.selection(),
    g: (story: string) => ({ paragraphs: s.paragraphSpans(story).map((p, i) => ({ ...p, displayStart: i * 10000 })) }),
    ea: (selectie: ReturnType<YrsSession["selection"]>) => ({ story: selectie!.anchor.story,
      start: { paraId: selectie!.anchor.paraId, offset: selectie!.anchor.offset },
      end: { paraId: selectie!.head.paraId, offset: selectie!.head.offset } }),
    he, f: !!opties.suggesting, vt: () => undefined, yt: publiceer, G: { current: !!opties.composing },
    Wl: (id: string) => id === "body" || id.startsWith("body:"),
    k: opties.worker === false ? null : resident, _openaecNativeTekst: opties.native === false ? null : native,
    $: () => actueel, dn: vi.fn(), i: { current: true }, W: (fn: () => Promise<void>) => { taken.push(fn); }, kt: { current: null },
  };
  const typ = new Function(...Object.keys(context), `return ${callback}`)(...Object.values(context));
  return { s, typ, native, resident, publiceer, positie,
    sluit() { actueel = false; },
    async leeg() { while (taken.length) await taken.shift()!(); },
  };
}

describe("native gewone tekst in de bestaande invoerwachtrij", () => {
  it("groepeert wachtende tekens eenmaal en gebruikt Rust vóór de worker", async () => {
    const p = await proef();
    try {
      p.typ("A", 1); p.typ("B", 2); p.typ("C", 3);
      expect(p.native).not.toHaveBeenCalled(); await p.leeg();
      expect(p.native).toHaveBeenCalledOnce(); expect(p.native.mock.calls[0][2]).toBe("ABC");
      expect(p.resident).not.toHaveBeenCalled(); expect(p.publiceer).toHaveBeenCalledOnce();
    } finally { p.s.destroy(); }
  });
  it("werkt ook als de worker ontbreekt", async () => {
    const p = await proef({ worker: false });
    try { p.typ("ABC", 1); await p.leeg(); expect(p.native).toHaveBeenCalledOnce(); }
    finally { p.s.destroy(); }
  });
  it("behoudt de oorspronkelijke webroute zonder desktopprovider", async () => {
    const p = await proef({ native: false });
    try { p.typ("ABC", 1); await p.leeg(); expect(p.native).not.toHaveBeenCalled(); expect(p.resident).toHaveBeenCalledOnce(); }
    finally { p.s.destroy(); }
  });
  it.each([{ suggesting: true }, { composing: true }, { expliciet: true }, { readonly: true }])("behoudt de bestaande route bij %j", async opties => {
    const p = await proef(opties);
    try { p.typ("ABC", 1); await p.leeg(); expect(p.native).not.toHaveBeenCalled(); expect(p.resident).not.toHaveBeenCalled(); }
    finally { p.s.destroy(); }
  });
  it.each(["één 😀", "A\nB"])("behoudt de oorspronkelijke route voor %j", async tekst => {
    const p = await proef();
    try { p.typ(tekst, 1); await p.leeg(); expect(p.native).not.toHaveBeenCalled(); expect(p.resident).not.toHaveBeenCalled(); }
    finally { p.s.destroy(); }
  });
  it("gebruikt de vervangroute bij geselecteerde tekst", async () => {
    const p = await proef();
    try {
      p.s.setSelection(p.positie, { ...p.positie, offset: 12 });
      p.typ("ABC", 1); await p.leeg(); expect(p.native).not.toHaveBeenCalled(); expect(p.resident).not.toHaveBeenCalled();
    } finally { p.s.destroy(); }
  });
  it("gebruikt ook de bestaande route voor gewone tekst in een tabelcel", async () => {
    const p = await proef();
    try {
      const story = p.s.storyIds().find(id => id.startsWith("body:"))!;
      p.s.setSelection({ story, paraId: p.s.paragraphs(story)[0].paraId, offset: 1 });
      p.typ("ABC", 1); await p.leeg(); expect(p.native).toHaveBeenCalledOnce();
      expect(p.native.mock.calls[0][1].story).toBe(story);
    } finally { p.s.destroy(); }
  });
  it("behoudt de oorspronkelijke koptekstbewerking buiten de hoofdtekst", async () => {
    const p = await proef();
    try {
      p.s.createStory("hf:proef", "Koptekst", "Normal", "left");
      p.s.setSelection({ story: "hf:proef", paraId: p.s.paragraphs("hf:proef")[0].paraId, offset: 3 });
      p.typ("ABC", 1); await p.leeg();
      expect(p.native).not.toHaveBeenCalled(); expect(p.resident).not.toHaveBeenCalled();
      expect(p.s.paragraphs("hf:proef")[0].text).toBe("KopABCtekst");
    } finally { p.s.destroy(); }
  });
  it("valt bij een afgewezen maar nog actuele opdracht terug op de bestaande worker", async () => {
    const p = await proef(); p.native.mockResolvedValue(false);
    try { p.typ("ABC", 1); await p.leeg(); expect(p.resident).toHaveBeenCalledOnce(); }
    finally { p.s.destroy(); }
  });
  it("publiceert of hervat geen invoer na het sluiten van de editor", async () => {
    const p = await proef(); p.native.mockImplementation(async () => { p.sluit(); return false; });
    try { p.typ("ABC", 1); await p.leeg(); expect(p.resident).not.toHaveBeenCalled(); expect(p.publiceer).not.toHaveBeenCalled(); }
    finally { p.s.destroy(); }
  });
});
