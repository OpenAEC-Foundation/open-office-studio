/** De transportdubbel houdt bevestigde bron en voorgestelde edit strikt apart. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Buffer } from "buffer";
import { describe, expect, it, vi } from "vitest";
import { applyClipboardFragment, createYrsSession, type YrsSession } from "@betteroffice/docx/yrs";
import { maakRustBron } from "./rustBron";
import { maakRustTekstKoppeling, type RustTekstAanvraag } from "./rustTekst";
import type { RustPlakAntwoord, RustTransportAntwoord } from "./rustPlakken";

const hash = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
async function bron() {
  const s = await createYrsSession({ clientId: 71 });
  s.openDocx(new Uint8Array(readFileSync("public/templates/nieuw.docx")), true);
  const p = s.paragraphs("body")[0], positie = { story: "body", paraId: p.paraId, offset: 0 };
  s.insertText(positie, "Voor 😀 na" + " woorden".repeat(2000));
  s.setSelection(positie);
  return { s, positie };
}

function werker() {
  let cache: { bytes: Uint8Array; basis: string; document: string; client: number } | null = null;
  const aanvragen: RustTekstAanvraag[] = [];
  const transport = vi.fn(async (a: RustTekstAanvraag): Promise<RustTransportAntwoord> => {
    aanvragen.push(a);
    const bytes = new Uint8Array(Buffer.from(a.snapshot, "base64"));
    expect(hash(bytes)).toBe(a.snapshotSha256);
    expect(a.schema).toBe(2);
    const binding = { schema: 2, requestId: a.requestId, documentId: a.documentId,
      sourceVersion: a.sourceVersion, snapshotSha256: a.snapshotSha256, clientId: a.clientId };
    if (a.basis && (!cache || a.basis !== cache.basis || a.documentId !== cache.document || a.clientId !== cache.client))
      return { ...binding, retryFull: true };
    const kopie = await createYrsSession({ clientId: a.clientId });
    try {
      if (a.basis) kopie.applyUpdate(cache!.bytes);
      kopie.applyUpdate(bytes);
      const bron = new Uint8Array(kopie.encodeStateAsUpdate()), vector = new Uint8Array(kopie.encodeStateVector());
      expect(Buffer.from(vector).toString("base64")).toBe(a.sourceVector);
      const basis = hash(bron);
      cache = { bytes: bron, basis, document: a.documentId, client: a.clientId };
      const punt = { paraId: a.position.paraId, offset: a.position.offset };
      const caret = applyClipboardFragment(kopie, { story: a.position.story, start: punt, end: punt }, { paragraphs: [{ text: a.text }] }, a.author);
      return { ...binding, basis, bronvector: Buffer.from(vector).toString("base64"), caret,
        delta: Buffer.from(kopie.encodeStateAsUpdate(vector)).toString("base64"), preparationMs: 0 };
    } finally { kopie.destroy(); }
  });
  return { transport, aanvragen, vergeet: () => { cache = null; } };
}

describe("bevestigde Rust-bronvector", () => {
  it("verstuurt na de eerste invoer een kleine delta en behoudt alle overige tekst", async () => {
    const b = await bron(), w = werker();
    const k = maakRustTekstKoppeling({ transport: w.transport, synchronisatie: { vergeten: w.vergeet }, gewijzigd: vi.fn() });
    k.activeer();
    try {
      const voor = b.s.paragraphs("body")[0].text;
      await k.tekst(b.s, b.positie, "A", undefined, () => true);
      await k.tekst(b.s, { ...b.positie, offset: 1 }, "B", undefined, () => true);
      expect(b.s.paragraphs("body")[0].text).toBe("AB" + voor);
      expect(w.aanvragen).toHaveLength(2);
      expect(w.aanvragen[0].basis).toBeUndefined();
      expect(w.aanvragen[1].basis).toMatch(/^[a-f0-9]{64}$/);
      expect(w.aanvragen[1].snapshot.length * 100).toBeLessThan(w.aanvragen[0].snapshot.length);
    } finally { k.stop(); b.s.destroy(); }
  });

  it("herhaalt met een volledige bron na verdringing zonder de invoer te verdubbelen", async () => {
    const b = await bron(), w = werker();
    const k = maakRustTekstKoppeling({ transport: w.transport, synchronisatie: { vergeten: w.vergeet }, gewijzigd: vi.fn() });
    k.activeer();
    try {
      const voor = b.s.paragraphs("body")[0].text;
      await k.tekst(b.s, b.positie, "A", undefined, () => true);
      w.vergeet();
      await k.tekst(b.s, { ...b.positie, offset: 1 }, "B", undefined, () => true);
      expect(b.s.paragraphs("body")[0].text).toBe("AB" + voor);
      expect(w.aanvragen).toHaveLength(3);
      expect(w.aanvragen.map(a => !!a.basis)).toEqual([false, true, false]);
    } finally { k.stop(); b.s.destroy(); }
  });

  it("neemt een antwoord na sluiten niet over en gebruikt bij hervatten een volledige bron", async () => {
    const b = await bron(), w = werker();
    let los!: () => void, gestart!: () => void;
    const wacht = new Promise<void>(r => { los = r; }), gereed = new Promise<void>(r => { gestart = r; });
    const transport = vi.fn(async (a: RustTekstAanvraag) => { const r = await w.transport(a); gestart(); await wacht; return r; });
    const k = maakRustTekstKoppeling({ transport, synchronisatie: { vergeten: w.vergeet }, gewijzigd: vi.fn() });
    k.activeer();
    try {
      const voor = b.s.paragraphs("body")[0].text;
      const invoer = k.tekst(b.s, b.positie, "AFGEWEZEN", undefined, () => true);
      await gereed; k.stop(); los(); expect(await invoer).toBe(false);
      expect(b.s.paragraphs("body")[0].text).toBe(voor);
      k.activeer();
      await k.tekst(b.s, b.positie, "WEL", undefined, () => true);
      expect(b.s.paragraphs("body")[0].text).toBe("WEL" + voor);
      expect(w.aanvragen[1].basis).toBeUndefined();
    } finally { los(); k.stop(); b.s.destroy(); }
  });

  it("hergebruikt de vector niet in een andere sessie en herbeginnen doet geen native opruimactie", async () => {
    const a = await bron(), b = await bron(), vergeten = vi.fn();
    const koppeling = maakRustBron(vergeten);
    try {
      const vector = Buffer.from(a.s.encodeStateVector()).toString("base64");
      koppeling.bevestig(a.s, { sourceVector: vector } as never, { basis: "a".repeat(64), bronvector: vector } as RustPlakAntwoord);
      expect(koppeling.lees(a.s).basis).toBe("a".repeat(64));
      expect(koppeling.lees(b.s).basis).toBeUndefined();
      koppeling.herbegin(); expect(vergeten).not.toHaveBeenCalled();
      koppeling.vergeet(); expect(vergeten).toHaveBeenCalledOnce();
    } finally { a.s.destroy(); b.s.destroy(); }
  });

  it("behoudt delta’s bij geldige hydratie van dezelfde replica", async () => {
    const b = await bron(), w = werker();
    const k = maakRustTekstKoppeling({ transport: w.transport, synchronisatie: { vergeten: w.vergeet }, gewijzigd: vi.fn() });
    k.activeer();
    try {
      const voor = b.s.paragraphs("body")[0].text;
      await k.tekst(b.s, b.positie, "A", undefined, () => true);
      const oud = b.s.version();
      b.s.loadState(new Uint8Array([0, 0]));
      expect(b.s.version()).not.toBe(oud);
      await k.tekst(b.s, { ...b.positie, offset: 1 }, "B", undefined, () => true);
      expect(b.s.paragraphs("body")[0].text).toBe("AB" + voor);
      expect(w.aanvragen.map(a => !!a.basis)).toEqual([false, true]);
    } finally { k.stop(); b.s.destroy(); }
  });

  it("behandelt bronversies als ondoorzichtige tokens", async () => {
    const b = await bron(), w = werker(), origineel = b.s.version.bind(b.s);
    const versie = vi.spyOn(b.s, "version").mockImplementation(() => "token:" + origineel());
    const k = maakRustTekstKoppeling({ transport: w.transport, synchronisatie: { vergeten: w.vergeet }, gewijzigd: vi.fn() });
    k.activeer();
    try {
      const voor = b.s.paragraphs("body")[0].text;
      await k.tekst(b.s, b.positie, "A", undefined, () => true);
      await k.tekst(b.s, { ...b.positie, offset: 1 }, "B", undefined, () => true);
      expect(b.s.paragraphs("body")[0].text).toBe("AB" + voor);
      expect(w.aanvragen.map(a => !!a.basis)).toEqual([false, true]);
    } finally { versie.mockRestore(); k.stop(); b.s.destroy(); }
  });

  it("weigert een ongeldige bronbevestiging vóór de documentmutatie", async () => {
    const b = await bron(), w = werker();
    const k = maakRustTekstKoppeling({ transport: async a => ({ ...await w.transport(a), bronvector: "////" }) as RustPlakAntwoord,
      synchronisatie: { vergeten: w.vergeet }, gewijzigd: vi.fn() });
    k.activeer();
    try {
      const voor = new Uint8Array(b.s.encodeStateAsUpdate());
      await expect(k.tekst(b.s, b.positie, "FOUT", undefined, () => true)).rejects.toThrow();
      expect(new Uint8Array(b.s.encodeStateAsUpdate())).toEqual(voor);
    } finally { k.stop(); b.s.destroy(); }
  });
});
