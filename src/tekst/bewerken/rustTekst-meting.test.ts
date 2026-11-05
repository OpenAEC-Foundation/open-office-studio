/** Meting draait mee met echte SDK-bronmutaties en behoudt de oorspronkelijke wachtrij. */
import { readFileSync } from "node:fs";
import { Buffer } from "buffer";
import { createYrsSession, type YrsSession } from "@betteroffice/docx/yrs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { maakRustTekstKoppeling, type RustTekstAanvraag } from "./rustTekst";
import { invoerMeting } from "./invoerMeting";

const bytes = new Uint8Array(readFileSync("public/templates/nieuw.docx"));
async function antwoord(a: RustTekstAanvraag) {
  const s = await createYrsSession({ clientId: a.clientId });
  try {
    s.applyUpdate(Buffer.from(a.snapshot, "base64"));
    const r = s.insertText(a.position, a.text);
    return { ...a, delta: Buffer.from(s.encodeStateAsUpdate()).toString("base64"),
      caret: { story: r.range!.story, ...r.range!.end }, preparationMs: 7 };
  } finally { s.destroy(); }
}
afterEach(() => { invoerMeting.stop(); vi.restoreAllMocks(); });

async function bron() {
  const s = await createYrsSession({ clientId: 74 }); s.openDocx(bytes, true);
  s.beginUndoCapture(); s.setSelection({ story: "body", paraId: s.paragraphs("body")[0].paraId, offset: 0 });
  return s;
}
const stand = (s: YrsSession) => Object.fromEntries(s.storyIds().sort().map(id => [id, s.storySegments(id)]));

describe("tijdregistratie in de werkelijke tekstkoppeling", () => {
  it("behoudt bytegelijke bronupdates en dezelfde selectie met de meting aan en uit", async () => {
    const basis = await bron(), snapshot = basis.encodeStateAsUpdate(), positie = basis.selection()!.head;
    basis.destroy();
    const uitkomsten = [], antwoorden: Awaited<ReturnType<typeof antwoord>>[] = [];
    for (const meten of [false, true]) {
      const s = await createYrsSession({ clientId: 75 }); s.applyUpdate(snapshot); s.setSelection(positie);
      let nummer = 0;
      // Speel dezelfde werkelijke delta's af: nieuwe SDK-antwoorden kunnen
      // mapopmaak in een andere klokvolgorde aanleggen, los van de meetlaag.
      const k = maakRustTekstKoppeling({ gewijzigd() {}, transport: async a => {
        if (!meten) { const r = await antwoord(a); antwoorden.push(r); return r; }
        const r = antwoorden[nummer++];
        return { ...a, delta: r.delta, caret: r.caret, preparationMs: r.preparationMs };
      } }); k.activeer();
      if (meten) invoerMeting.start();
      try {
        for (const tekst of ["Eerste ", "😀 tweede"])
          expect(await k.tekst(s, s.selection()!.head, tekst, undefined, () => true)).toBe(true);
        uitkomsten.push({ bytes: s.encodeStateAsUpdate(), vector: s.encodeStateVector(), selectie: s.selection(), inhoud: stand(s) });
        if (meten) expect(invoerMeting.stop().monsters).toHaveLength(2);
      } finally { k.stop(); s.destroy(); }
    }
    expect(uitkomsten[1]).toEqual(uitkomsten[0]);
  });
  it("onderscheidt native binnenwerk en heen-en-terugtijd met behoud van inhoud en Undo/Redo", async () => {
    const s = await bron(), voor = stand(s); let nu = 10;
    vi.spyOn(performance, "now").mockImplementation(() => nu);
    const k = maakRustTekstKoppeling({ gewijzigd() {}, transport: async a => { const r = await antwoord(a); nu += 100; return r; } });
    k.activeer(); invoerMeting.start();
    try {
      expect(await k.tekst(s, s.selection()!.head, "ABC", undefined, () => true)).toBe(true);
      const na = stand(s), r = invoerMeting.stop();
      expect(s.paragraphs("body")[0].text).toBe("ABC");
      expect(r.monsters).toHaveLength(1);
      expect(r.monsters[0]).toMatchObject({ uitkomst: "rust", pogingen: 1, duurMs: 100, rustBinnenMs: 7, stappen: { transport: 100 } });
      expect(s.undo()).toBe(true); expect(stand(s)).toEqual(voor);
      expect(s.redo()).toBe(true); expect(stand(s)).toEqual(na);
    } finally { k.stop(); s.destroy(); }
  });
  it("past na het stoppen van de editor geen laat antwoord toe", async () => {
    const s = await bron(), voor = stand(s); let vrij!: () => void, gestart!: () => void;
    const wacht = new Promise<void>(r => { vrij = r; }), aan = new Promise<void>(r => { gestart = r; });
    const k = maakRustTekstKoppeling({ gewijzigd() {}, transport: async a => { const r = await antwoord(a); gestart(); await wacht; return r; } });
    k.activeer(); invoerMeting.start();
    try {
      const werk = k.tekst(s, s.selection()!.head, "ABC", undefined, () => true);
      await aan; k.stop(); vrij(); expect(await werk).toBe(false);
      expect(stand(s)).toEqual(voor);
      expect(invoerMeting.stop().monsters[0].uitkomst).toBe("afgebroken");
    } finally { k.stop(); s.destroy(); }
  });
  it("behoudt de oorspronkelijke fout en ongewijzigde bron bij transportafwijzing", async () => {
    const s = await bron(), voor = stand(s), fout = new Error("Proefafwijzing"), gemeld = vi.fn();
    const k = maakRustTekstKoppeling({ gewijzigd() {}, fout: gemeld, transport: async () => { throw fout; } });
    k.activeer(); invoerMeting.start();
    try {
      await expect(k.tekst(s, s.selection()!.head, "ABC", undefined, () => true)).rejects.toBe(fout);
      expect(gemeld).toHaveBeenCalledExactlyOnceWith(fout); expect(stand(s)).toEqual(voor);
      expect(invoerMeting.stop().monsters[0].uitkomst).toBe("fout");
    } finally { k.stop(); s.destroy(); }
  });
});
