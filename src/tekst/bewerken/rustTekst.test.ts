import { readFileSync } from "node:fs";
import { Buffer } from "buffer";
import { describe, expect, it, vi } from "vitest";
import { createYrsSession, type YrsSession } from "@betteroffice/docx/yrs";
import { maakRustTekstKoppeling, type RustTekstAanvraag } from "./rustTekst";
import type { RustPlakAntwoord } from "./rustPlakken";

const bytes = new Uint8Array(readFileSync("docs/voorbeelden/Ontwerpnotitie.docx"));
const stand = (s: YrsSession) => Object.fromEntries(s.storyIds().sort().map(id => [id, s.storySegments(id)]));
async function bron() {
  const s = await createYrsSession({ clientId: 71 }); s.openDocx(bytes, true);
  s.beginUndoCapture(); s.setUndoCaptureMode("manual"); s.addUndoBoundary();
  const positie = { story: "body", paraId: s.paragraphs("body")[0].paraId, offset: 7 };
  s.setSelection(positie);
  return { s, positie, voor: stand(s) };
}
/** Onafhankelijke tekstroute voor transportvolgorde; de echte Rust-code heeft eigen codecproeven. */
async function antwoord(a: RustTekstAanvraag): Promise<RustPlakAntwoord> {
  const s = await createYrsSession({ clientId: a.clientId });
  try {
    s.applyUpdate(Buffer.from(a.snapshot, "base64"));
    const r = s.insertText(a.position, a.text, a.author);
    const caret = r.range ? { story: r.range.story, ...r.range.end } : { ...a.position, offset: a.position.offset + a.text.length };
    return { schema: 1, requestId: a.requestId, documentId: a.documentId, sourceVersion: a.sourceVersion,
      snapshotSha256: a.snapshotSha256, clientId: a.clientId, delta: Buffer.from(s.encodeStateAsUpdate()).toString("base64"), caret, preparationMs: 0 };
  } finally { s.destroy(); }
}
function uitgesteld<T>() {
  let klaar!: (a: T) => void;
  const wacht = new Promise<T>(r => { klaar = r; });
  return { klaar, wacht };
}

describe("gewone tekst met brongebonden Rust-antwoord", () => {
  it("groepeert meerdere gewone invoerantwoorden in dezelfde Undo-stap zonder plakgrenzen", async () => {
    const b = await bron(), grenzen = vi.spyOn(b.s, "addUndoBoundary"), gewijzigd = vi.fn();
    const k = maakRustTekstKoppeling({ transport: antwoord, gewijzigd }); k.activeer();
    try {
      expect(await k.tekst(b.s, b.positie, "Eerste ", undefined, () => true)).toBe(true);
      expect(await k.tekst(b.s, b.s.selection()!.head, "één 😀", undefined, () => true)).toBe(true);
      expect(grenzen).not.toHaveBeenCalled(); expect(gewijzigd).toHaveBeenCalledTimes(2);
      const na = stand(b.s); b.s.addUndoBoundary();
      expect(b.s.undo()).toBe(true); expect(stand(b.s)).toEqual(b.voor);
      expect(b.s.redo()).toBe(true); expect(stand(b.s)).toEqual(na);
    } finally { k.stop(); b.s.destroy(); }
  });

  it("houdt nieuw geselecteerde tekst intact bij een vertraagd antwoord op eerdere invoer", async () => {
    const b = await bron(), start = uitgesteld<RustTekstAanvraag>(), terug = uitgesteld<RustPlakAntwoord>();
    const k = maakRustTekstKoppeling({ transport: a => { start.klaar(a); return terug.wacht; }, gewijzigd: vi.fn() }); k.activeer();
    try {
      const werk = k.tekst(b.s, b.positie, "Invoer", undefined, () => true), a = await start.wacht;
      const ander = { story: "body", paraId: b.s.paragraphs("body")[2].paraId, offset: 2 };
      b.s.setSelection(ander, { ...ander, offset: 8 });
      const selectie = b.s.selection(); terug.klaar(await antwoord(a));
      expect(await werk).toBe(true); expect(b.s.selection()).toEqual(selectie);
      expect(b.s.paragraphs("body")[0].text).toContain("Invoer");
    } finally { k.stop(); b.s.destroy(); }
  });

  it("bereidt opnieuw voor wanneer de bron wijzigt en gebruikt de meebewogen invoegpositie", async () => {
    const b = await bron(), start = uitgesteld<RustTekstAanvraag>(), terug = uitgesteld<RustPlakAntwoord>();
    const aanvragen: RustTekstAanvraag[] = [];
    const k = maakRustTekstKoppeling({ transport: a => {
      aanvragen.push(a); if (aanvragen.length === 1) { start.klaar(a); return terug.wacht; } return antwoord(a);
    }, gewijzigd: vi.fn() }); k.activeer();
    try {
      const werk = k.tekst(b.s, b.positie, "Invoer", undefined, () => true), a = await start.wacht;
      const oud = await antwoord(a);
      b.s.insertText({ ...b.positie, offset: 0 }, "Voor "); terug.klaar(oud);
      expect(await werk).toBe(true); expect(aanvragen).toHaveLength(2);
      expect(aanvragen[1].position.offset).toBe(12);
      expect(b.s.paragraphs("body")[0].text).toContain("Invoer");
      expect(b.s.paragraphs("body")[0].text.startsWith("Voor ")).toBe(true);
    } finally { k.stop(); b.s.destroy(); }
  });

  it("neemt na sluiten/reactiveren geen laat antwoord over", async () => {
    const b = await bron(), start = uitgesteld<RustTekstAanvraag>(), terug = uitgesteld<RustPlakAntwoord>();
    const k = maakRustTekstKoppeling({ transport: a => { start.klaar(a); return terug.wacht; }, gewijzigd: vi.fn() }); k.activeer();
    try {
      const werk = k.tekst(b.s, b.positie, "Invoer", undefined, () => true), a = await start.wacht;
      k.stop(); k.activeer(); terug.klaar(await antwoord(a));
      expect(await werk).toBe(false); expect(stand(b.s)).toEqual(b.voor);
    } finally { k.stop(); b.s.destroy(); }
  });

  it.each(["", "A\nB", "A\rB"])("weigert ongeschikte gewone tekst %j vóór transport", async text => {
    const b = await bron(), transport = vi.fn(antwoord);
    const k = maakRustTekstKoppeling({ transport, gewijzigd: vi.fn() }); k.activeer();
    try {
      expect(() => k.tekst(b.s, b.positie, text, undefined, () => true)).toThrow();
      expect(transport).not.toHaveBeenCalled(); expect(stand(b.s)).toEqual(b.voor);
    } finally { k.stop(); b.s.destroy(); }
  });
});
