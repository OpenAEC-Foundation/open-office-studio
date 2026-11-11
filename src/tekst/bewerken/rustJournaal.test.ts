import { describe, expect, it, vi } from "vitest";
import type { YrsSession } from "@betteroffice/docx/yrs";
import { journaalOptIn, maakRustJournaal, type JournaalInvoke } from "./rustJournaal";
import type { RustTekstAanvraag } from "./rustTekst";
import type { RustPlakAntwoord } from "./rustPlakken";
const m = { schema: 3, beschikbaar: true, standaardIngeschakeld: false, levensduurCodering: "decimaal", maxVolgnummer: Number.MAX_SAFE_INTEGER };
const s = () => ({} as YrsSession);
const vraag = (schema = 3): RustTekstAanvraag => ({ schema: schema as 2 | 3, requestId: "opdracht", documentId: "doc", sourceVersion: "bron", snapshotSha256: "a".repeat(64), snapshot: "AAAA", clientId: 1, position: { story: "body", paraId: "p0", offset: 0 }, text: "x" });
function uitgesteld<T>() {
  let klaar!: (v: T) => void;
  return { wacht: new Promise<T>(r => { klaar = r; }), klaar: (v: T) => klaar(v) };
}
function host(anders?: JournaalInvoke) {
  let leven = 0;
  return vi.fn<JournaalInvoke>(async (command, args) => {
    if (anders) return anders(command, args);
    if (command === "writer_journaal_mogelijkheden") return m;
    if (command === "writer_journaal_openen") return { documentId: "doc", levensduur: String(++leven) };
    if (command === "writer_journaal_vergeten") return null;
    const e = args!.gegevens as { koppeling: { levensduur: string }; volgnummer: number; aanvraag: RustTekstAanvraag };
    return { ...e.aanvraag, route: "gereed", levensduur: e.koppeling.levensduur, volgnummer: e.volgnummer, delta: "AAAA", caret: e.aanvraag.position, preparationMs: 0 };
  });
}
function maak(invoke = host(), optIn = true) {
  const transport = vi.fn(async () => ({ schema: 2 }) as RustPlakAntwoord), vergeten = vi.fn();
  return { j: maakRustJournaal({ documentId: "doc", optIn, invoke, transport, vergeten }), invoke, transport, vergeten };
}

describe("expliciete Writer-handshake en levensduur", () => {
  it("kiest alleen de exacte tijdelijke URL-optie", () => {
    for (const q of ["", "?writerBronjournaal=true", "?writerBronjournaal=0", "?anders=1"]) expect(journaalOptIn(q)).toBe(false);
    expect(journaalOptIn("?anders=1&writerBronjournaal=1")).toBe(true);
  });
  it("opent niets zonder opt-in en houdt de bestaande route", async () => {
    const { j, invoke } = maak(host(), false);j.activeer();await j.gereed();expect(j.begin(s()).schema).toBe(2);expect(invoke).not.toHaveBeenCalled();j.stop();
  });
  it.each([null, { ...m, beschikbaar: false }, { ...m, schema: 2 }, { ...m, standaardIngeschakeld: true }, { ...m, levensduurCodering: "getal" }, { ...m, maxVolgnummer: 42 }])("opent niet na ongeschikte mogelijkheden %j", async meta => {
    const invoke = host(async () => meta), { j } = maak(invoke);j.activeer();await j.gereed();expect(j.begin(s()).schema).toBe(2);expect(invoke).toHaveBeenCalledTimes(1);j.stop();
  });
  it("laat vroege invoer op 2 en gebruikt pas na opening een aparte bron op 3", async () => {
    const w = uitgesteld<unknown>(), normaal = host();
    const invoke = host((c, a) => c === "writer_journaal_openen" ? w.wacht : normaal(c, a));
    const { j } = maak(invoke);j.activeer();const sessie = s(), vroeg = j.begin(sessie);expect(vroeg.schema).toBe(2);
    await vi.waitFor(() => expect(invoke.mock.calls.some(([c]) => c === "writer_journaal_openen")).toBe(true));
    w.klaar({ documentId: "doc", levensduur: "18446744073709551615" });await j.gereed();
    const nieuw = j.begin(sessie);expect(nieuw.schema).toBe(3);expect(vroeg.actueel()).toBe(true);expect(nieuw.bron).not.toBe(vroeg.bron);
    await nieuw.transport(vraag());expect(invoke.mock.calls.at(-1)![1]).toMatchObject({ gegevens: { koppeling: { levensduur: "18446744073709551615" }, volgnummer: 1 } });j.stop();await j.gereed();
  });
  it("ruimt een late opening na sluiten op en opent niet vanzelf opnieuw", async () => {
    const w = uitgesteld<unknown>(), normaal = host();const invoke = host((c, a) => c === "writer_journaal_openen" ? w.wacht : normaal(c, a));
    const { j } = maak(invoke);j.activeer();await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));j.stop();
    w.klaar({ documentId: "doc", levensduur: "9" });await j.gereed();
    expect(invoke.mock.calls.at(-1)).toEqual(["writer_journaal_vergeten", { gegevens: { documentId: "doc", levensduur: "9" } }]);
    expect(j.begin(s()).actueel()).toBe(false);expect(invoke.mock.calls.filter(([c]) => c === "writer_journaal_openen")).toHaveLength(1);
  });
  it("wacht bij reactiveren op opruiming van de vorige late opening", async () => {
    const w = uitgesteld<unknown>(), normaal = host();let eerste = true;
    const invoke = host((c, a) => { if (c === "writer_journaal_openen" && eerste) { eerste = false; return w.wacht; } return normaal(c, a); });
    const { j } = maak(invoke);j.activeer();await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));j.stop();j.activeer();
    w.klaar({ documentId: "doc", levensduur: "9" });await j.gereed();
    expect(invoke.mock.calls.map(([c]) => c)).toEqual(["writer_journaal_mogelijkheden", "writer_journaal_openen", "writer_journaal_vergeten", "writer_journaal_mogelijkheden", "writer_journaal_openen"]);
    expect(j.begin(s()).schema).toBe(3);j.stop();await j.gereed();
  });
  it("trekt een oude sessie in voordat dezelfde editor een andere sessie gebruikt", async () => {
    const { j } = maak();j.activeer();await j.gereed();const a = j.begin(s());expect(a.schema).toBe(3);
    const nieuw = s(), vroeg = j.begin(nieuw);expect(a.actueel()).toBe(false);expect(vroeg.schema).toBe(2);await j.gereed();
    expect(j.begin(nieuw).schema).toBe(3);j.stop();await j.gereed();
  });
  it("serialiseert gelijktijdige opdrachten en bewaart het volgnummer", async () => {
    const w = uitgesteld<unknown>(), normaal = host();let eerste = true;
    const invoke = host(async (c, a) => { const r = await normaal(c, a);if (c === "writer_journaal_voorbereiden" && eerste) { eerste = false;await w.wacht; }return r; });
    const { j } = maak(invoke);j.activeer();await j.gereed();const r = j.begin(s()), a = r.transport(vraag()), b = r.transport({ ...vraag(), requestId: "twee" });
    await vi.waitFor(() => expect(invoke.mock.calls.filter(([c]) => c === "writer_journaal_voorbereiden")).toHaveLength(1));w.klaar(null);await Promise.all([a, b]);
    expect(invoke.mock.calls.filter(([c]) => c === "writer_journaal_voorbereiden").map(([, a]) => (a!.gegevens as { volgnummer: number }).volgnummer)).toEqual([1, 2]);j.stop();await j.gereed();
  });
  it.each(["levensduur", "volgnummer", "requestId", "documentId", "sourceVersion", "snapshotSha256", "clientId", "route"])("weigert afwijkende %s en raadt geen vervolg na die fout", async veld => {
    const normaal = host(), invoke = host(async (c, a) => { const r = await normaal(c, a);return c === "writer_journaal_voorbereiden" ? { ...(r as object), [veld]: "onjuist" } : r; });
    const { j, transport } = maak(invoke);j.activeer();await j.gereed();const r = j.begin(s());
    await expect(r.transport(vraag())).rejects.toThrow();await expect(r.transport(vraag())).rejects.toThrow();
    expect(invoke.mock.calls.filter(([c]) => c === "writer_journaal_voorbereiden")).toHaveLength(1);expect(transport).not.toHaveBeenCalled();j.stop();await j.gereed();
  });
  it.each(["0", "01", "+1", "18446744073709551616", 1])("weigert een ongeldige openingslevensduur %j", async levensduur => {
    const normaal = host(), invoke = host((c, a) => c === "writer_journaal_openen" ? Promise.resolve({ documentId: "doc", levensduur }) : normaal(c, a));
    const { j } = maak(invoke);j.activeer();await j.gereed();expect(j.begin(s()).schema).toBe(2);j.stop();await j.gereed();
  });
  it("geeft alleen na expliciete capaciteit een verse schema-2-bron en heropent niets", async () => {
    const { j, invoke } = maak();j.activeer();await j.gereed();const sessie = s(), vroeg = j.begin(sessie), terug = vroeg.terugval!();
    expect(terug.schema).toBe(2);expect(terug.bron).not.toBe(vroeg.bron);expect(vroeg.actueel()).toBe(false);expect(terug.actueel()).toBe(true);await j.gereed();
    expect(j.begin(sessie).schema).toBe(2);expect(invoke.mock.calls.filter(([c]) => c === "writer_journaal_openen")).toHaveLength(1);j.stop();
  });
  it("weert een reeds berekend antwoord na stoppen", async () => {
    const w = uitgesteld<unknown>(), normaal = host();const invoke = host(async (c, a) => { const r = await normaal(c, a);if (c === "writer_journaal_voorbereiden") await w.wacht;return r; });
    const { j } = maak(invoke);j.activeer();await j.gereed();const r = j.begin(s()), p = r.transport(vraag());
    await vi.waitFor(() => expect(invoke.mock.calls.some(([c]) => c === "writer_journaal_voorbereiden")).toBe(true));j.stop();w.klaar(null);await expect(p).rejects.toThrow();expect(r.actueel()).toBe(false);await j.gereed();
  });
});
