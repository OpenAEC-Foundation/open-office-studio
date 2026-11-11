/** SDK-orakel voor de frontendovergang; geen bewijs voor de native capaciteitspiek. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Buffer } from "buffer";
import { expect, it, vi } from "vitest";
import { applyClipboardFragment, createYrsSession } from "@betteroffice/docx/yrs";
import { maakRustTekstKoppeling, type RustTekstAanvraag } from "./rustTekst";
import type { JournaalInvoke } from "./rustJournaal";
import type { RustTransportAntwoord } from "./rustPlakken";
const meta = { schema: 3, beschikbaar: true, standaardIngeschakeld: false, levensduurCodering: "decimaal", maxVolgnummer: Number.MAX_SAFE_INTEGER };
const binding = (a: RustTekstAanvraag) => ({ schema: a.schema, requestId: a.requestId, documentId: a.documentId, sourceVersion: a.sourceVersion, snapshotSha256: a.snapshotSha256, clientId: a.clientId });

it("gaat na een gebonden capaciteitssignaal met een nieuwe volledige bron werkelijk verder op schema 2", async () => {
  const s = await createYrsSession({ clientId: 71 });s.openDocx(new Uint8Array(readFileSync("public/templates/nieuw.docx")), true);
  const p = { story: "body", paraId: s.paragraphs("body")[0].paraId, offset: 0 };s.setSelection(p);
  let cache: Uint8Array | null = null;
  const transport = vi.fn(async (a: RustTekstAanvraag): Promise<RustTransportAntwoord> => {
    expect(a.schema).toBe(2);
    const kopie = await createYrsSession({ clientId: a.clientId });
    try {
      if (a.basis) kopie.applyUpdate(cache!);
      kopie.applyUpdate(Buffer.from(a.snapshot, "base64"));
      cache = new Uint8Array(kopie.encodeStateAsUpdate());const vector = new Uint8Array(kopie.encodeStateVector());
      const basis = createHash("sha256").update(cache).digest("hex");
      const punt = { paraId: a.position.paraId, offset: a.position.offset };
      const caret = applyClipboardFragment(kopie, { story: a.position.story, start: punt, end: punt }, { paragraphs: [{ text: a.text }] });
      return { ...binding(a), basis, bronvector: Buffer.from(vector).toString("base64"), caret, delta: Buffer.from(kopie.encodeStateAsUpdate(vector)).toString("base64"), preparationMs: 0 };
    } finally { kopie.destroy(); }
  });
  const invoke = vi.fn<JournaalInvoke>(async (c, args) => {
    if (c === "writer_journaal_mogelijkheden") return meta;
    if (c === "writer_journaal_openen") return { documentId: "doc", levensduur: "7" };
    if (c === "writer_journaal_vergeten") return null;
    const a = (args!.gegevens as { aanvraag: RustTekstAanvraag }).aanvraag;
    expect(a.schema).toBe(3);
    return { ...binding(a), route: "bestaandeRoute", fallbackSchema: 2, requiresFull: true, reden: "bron", levensduur: "7", volgnummer: 1 };
  });
  const k = maakRustTekstKoppeling({ documentId: "doc", transport, journaal: { optIn: true, invoke }, gewijzigd: vi.fn() });
  k.activeer();await k.gereed();
  try {
    expect(await k.tekst(s, p, "A", undefined, () => true)).toBe(true);
    expect(await k.tekst(s, s.selection()!.head, "B", undefined, () => true)).toBe(true);
    expect(s.paragraphs("body")[0].text).toBe("AB");
    expect(transport.mock.calls).toHaveLength(2);expect(transport.mock.calls[0][0].basis).toBeUndefined();expect(transport.mock.calls[1][0].basis).toMatch(/^[a-f0-9]{64}$/);
    expect(invoke.mock.calls.filter(([c]) => c === "writer_journaal_voorbereiden")).toHaveLength(1);
    expect(invoke.mock.calls.filter(([c]) => c === "writer_journaal_openen")).toHaveLength(1);
  } finally { k.stop();await k.gereed();s.destroy(); }
});

it.each([{ fallbackSchema: 3 }, { requiresFull: false }, { reden: "onbekend" }, { retryFull: true }])("weigert een misvormde capaciteitsovergang %j zonder bestaande route", async afwijking => {
  const s = await createYrsSession({ clientId: 71 });s.openDocx(new Uint8Array(readFileSync("public/templates/nieuw.docx")), true);
  const p = { story: "body", paraId: s.paragraphs("body")[0].paraId, offset: 0 };s.setSelection(p);const voor = new Uint8Array(s.encodeStateAsUpdate());
  const invoke: JournaalInvoke = async (c, args) => {
    if (c === "writer_journaal_mogelijkheden") return meta;
    if (c === "writer_journaal_openen") return { documentId: "doc", levensduur: "7" };
    if (c === "writer_journaal_vergeten") return null;
    const a = (args!.gegevens as { aanvraag: RustTekstAanvraag }).aanvraag;
    return { ...binding(a), route: "bestaandeRoute", fallbackSchema: 2, requiresFull: true, reden: "bron", levensduur: "7", volgnummer: 1, ...afwijking };
  };
  const transport = vi.fn(async (): Promise<RustTransportAntwoord> => { throw Error("Geen terugval toegestaan"); });
  const k = maakRustTekstKoppeling({ documentId: "doc", transport, journaal: { optIn: true, invoke }, gewijzigd: vi.fn() });k.activeer();await k.gereed();
  try { await expect(k.tekst(s, p, "FOUT", undefined, () => true)).rejects.toThrow();expect(transport).not.toHaveBeenCalled();expect(new Uint8Array(s.encodeStateAsUpdate())).toEqual(voor); }
  finally { k.stop();await k.gereed();s.destroy(); }
});
