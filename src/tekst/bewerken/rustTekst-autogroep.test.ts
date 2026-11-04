/** Werkelijke automatische Undo-groepering bij traag terugbezorgde tekstantwoorden. */
import { readFileSync } from "node:fs";
import { Buffer } from "buffer";
import { createYrsSession, type YrsSession } from "@betteroffice/docx/yrs";
import { describe, expect, it, vi } from "vitest";
import { maakRustTekstKoppeling, type RustTekstAanvraag } from "./rustTekst";
import type { RustPlakAntwoord } from "./rustPlakken";

const bytes = new Uint8Array(readFileSync("public/templates/nieuw.docx"));
const stand = (s: YrsSession) => Object.fromEntries(s.storyIds().sort().map(id => [id, s.storySegments(id)]));

async function antwoord(a: RustTekstAanvraag): Promise<RustPlakAntwoord> {
  const s = await createYrsSession({ clientId: a.clientId });
  try {
    s.applyUpdate(Buffer.from(a.snapshot, "base64"));
    const r = s.insertText(a.position, a.text, a.author);
    const caret = r.range ? { story: r.range.story, ...r.range.end } : { ...a.position, offset: a.position.offset + a.text.length };
    return { ...a, delta: Buffer.from(s.encodeStateAsUpdate()).toString("base64"), caret, preparationMs: 0 };
  } finally { s.destroy(); }
}

async function proef(handmatig = false) {
  let klok = 10_000;
  const tijd = vi.spyOn(Date, "now").mockImplementation(() => klok);
  const s = await createYrsSession({ clientId: 73 });
  s.openDocx(bytes, true); s.beginUndoCapture();
  if (handmatig) s.setUndoCaptureMode("manual");
  const p = s.paragraphs("body")[0];
  s.setSelection({ story: "body", paraId: p.paraId, offset: 0 });
  const voor = stand(s), grenzen = vi.spyOn(s, "addUndoBoundary");
  const k = maakRustTekstKoppeling({ gewijzigd: vi.fn(), transport: async a => {
    const uit = await antwoord(a);
    // Dezelfde invoer kan veel later terugkomen door transport of een bezette UI.
    klok += 1000;
    return uit;
  } });
  k.activeer();
  return {
    s, voor, grenzen, k,
    tekst(text: string, eerste: number, laatste = eerste) {
      // De optionele tijdspan komt van de echte toelating van de invoerwachtrij.
      return Reflect.apply(k.tekst, k, [s, s.selection()!.head, text, undefined, () => true, [eerste, laatste]]) as Promise<boolean>;
    },
    stop() { k.stop(); s.destroy(); tijd.mockRestore(); },
  };
}

describe("Undo groepeert native tekst op invoertijd", () => {
  it("houdt snelle invoer bij elkaar wanneer de antwoorden meer dan 500 ms uit elkaar aankomen", async () => {
    const p = await proef();
    try {
      expect(p.s.undoCaptureMode()).toBe("auto");
      expect(await p.tekst("A", 100)).toBe(true);
      expect(await p.tekst("B", 120)).toBe(true);
      const na = stand(p.s);
      expect(p.grenzen).not.toHaveBeenCalled();
      expect(p.s.undo()).toBe(true); expect(stand(p.s)).toEqual(p.voor);
      expect(p.s.redo()).toBe(true); expect(stand(p.s)).toEqual(na);
      expect(p.s.undoCaptureMode()).toBe("auto");
    } finally { p.stop(); }
  });

  it("behoudt een nieuwe Undo-stap na een echte invoerpauze", async () => {
    const p = await proef();
    try {
      await p.tekst("A", 100);
      const naA = stand(p.s);
      await p.tekst("B", 1000);
      expect(p.s.undo()).toBe(true); expect(stand(p.s)).toEqual(naA);
      expect(p.s.undo()).toBe(true); expect(stand(p.s)).toEqual(p.voor);
    } finally { p.stop(); }
  });

  it("verandert de expliciete handmatige capturemodus niet", async () => {
    const p = await proef(true);
    try {
      await p.tekst("A", 100); await p.tekst("B", 1000);
      expect(p.s.undo()).toBe(true); expect(stand(p.s)).toEqual(p.voor);
      expect(p.s.undoCaptureMode()).toBe("manual");
    } finally { p.stop(); }
  });

  it("ruimt een gepinde tijd op wanneer een gewone bronmutatie faalt", async () => {
    const p = await proef(), fout = new Error("Delta geweigerd");
    const wissen = vi.spyOn(p.s, "clearUndoInputTime"), pinnen = vi.spyOn(p.s, "setUndoInputTime");
    const toepassen = vi.spyOn(p.s, "applyLocalUpdate").mockImplementationOnce(() => { throw fout; });
    try {
      await expect(p.tekst("A", 100)).rejects.toBe(fout);
      expect(pinnen).toHaveBeenCalledExactlyOnceWith(100, 100);
      expect(wissen).toHaveBeenCalledOnce(); expect(stand(p.s)).toEqual(p.voor);
    } finally { toepassen.mockRestore(); p.stop(); }
  });

  it("houdt de toegelaten tijdspan vast wanneer een aanroeper zijn array later verandert", async () => {
    const p = await proef(), pinnen = vi.spyOn(p.s, "setUndoInputTime"), tijdspan = [100, 120];
    try {
      const werk = Reflect.apply(p.k.tekst, p.k, [p.s, p.s.selection()!.head, "A", undefined, () => true, tijdspan]);
      tijdspan[0] = 5000; tijdspan[1] = 6000;
      expect(await werk).toBe(true); expect(pinnen).toHaveBeenCalledExactlyOnceWith(100, 120);
    } finally { p.stop(); }
  });

  it("roept een getrapte Wasm-instantie niet opnieuw aan om de tijd te wissen", async () => {
    const p = await proef(), fout = new WebAssembly.RuntimeError("Eigen proeftrap");
    const wissen = vi.spyOn(p.s, "clearUndoInputTime");
    const toepassen = vi.spyOn(p.s, "applyLocalUpdate").mockImplementationOnce(() => { throw fout; });
    try {
      await expect(p.tekst("A", 100)).rejects.toBe(fout);
      expect(wissen).not.toHaveBeenCalled();
    } finally { toepassen.mockRestore(); p.stop(); }
  });

  it.each([[NaN, 100], [100, 99], [-1, 0], [0, Infinity]])("weigert ongeldige invoertijd %j vóór een snapshot wordt gemaakt", async (eerste, laatste) => {
    const p = await proef(), snapshot = vi.spyOn(p.s, "encodeStateAsUpdate");
    try {
      expect(() => p.tekst("A", eerste, laatste)).toThrow("invoertijd");
      expect(snapshot).not.toHaveBeenCalled(); expect(stand(p.s)).toEqual(p.voor);
    } finally { p.stop(); }
  });
});
