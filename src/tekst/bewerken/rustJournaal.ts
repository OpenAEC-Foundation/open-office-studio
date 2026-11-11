/** Expliciete schema-3-handshake. Geen voorkeuren, automatische heropening of foutterugval. */
import type { YrsSession } from "@betteroffice/docx/yrs";
import { maakRustBron } from "./rustBron";
import type { RustBronKoppeling, RustTransportAntwoord } from "./rustPlakken";
import type { RustTekstAanvraag } from "./rustTekst";

export type JournaalInvoke = (command: string, argumenten?: Record<string, unknown>) => Promise<unknown>;
export interface TekstVoorbereiding {
  schema: 2 | 3;
  bron: RustBronKoppeling;
  transport: (aanvraag: RustTekstAanvraag) => Promise<RustTransportAntwoord>;
  actueel: () => boolean;
  terugval?: () => TekstVoorbereiding;
}
interface Koppeling { documentId: string; levensduur: string }
interface Lease { koppeling: Koppeling; bron: RustBronKoppeling; volgnummer: number; keten: Promise<void>; fout?: Error }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
function koppeling(v: unknown, documentId: string): Koppeling {
  if (!object(v) || Object.keys(v).length !== 2 || v.documentId !== documentId
    || typeof v.levensduur !== "string" || !/^[1-9][0-9]{0,19}$/.test(v.levensduur)
    || BigInt(v.levensduur) > 18_446_744_073_709_551_615n)
    throw Error("De Writer-werker gaf geen geldige levensduurbinding");
  return { documentId, levensduur: v.levensduur };
}
function alsFout(v: unknown): Error {
  if (v instanceof Error) return v;
  return Error(object(v) && typeof v.melding === "string" ? v.melding : "De Writer-journaalopdracht is mislukt");
}
function controleer(v: unknown, a: RustTekstAanvraag, k: Koppeling, volgnummer: number): RustTransportAntwoord {
  if (!object(v) || v.schema !== 3 || a.schema !== 3 || v.levensduur !== k.levensduur || v.volgnummer !== volgnummer
    || (["requestId", "documentId", "sourceVersion", "snapshotSha256", "clientId"] as const).some(veld => v[veld] !== a[veld]))
    throw Error("Het Writer-journaalantwoord hoort niet bij deze opdracht");
  if (v.route === "gereed") {
    if (v.retryFull === true || "fallbackSchema" in v) throw Error("Ongeldige gereedmelding van het Writer-bronjournaal");
  } else if (v.route === "volledigeBron") {
    if (v.retryFull !== true || "fallbackSchema" in v) throw Error("Ongeldig volledig-bronverzoek van het Writer-bronjournaal");
  } else if (v.route === "bestaandeRoute") {
    if (v.fallbackSchema !== 2 || v.requiresFull !== true || v.retryFull === true
      || !["bron", "bevestigdJournaal", "journaalEnVoorstel"].includes(String(v.reden)))
      throw Error("Ongeldige capaciteitsovergang van het Writer-bronjournaal");
  } else throw Error("Onbekende antwoordroute van het Writer-bronjournaal");
  return v as unknown as RustTransportAntwoord;
}

/** Alleen in een eigen testvenster expliciet via de URL kiezen; nooit opslaan. */
export function journaalOptIn(zoektekst: string): boolean {
  return new URLSearchParams(zoektekst).get("writerBronjournaal") === "1";
}

export function maakRustJournaal(opties: {
  documentId: string; optIn: boolean; invoke: JournaalInvoke;
  transport: (aanvraag: RustTekstAanvraag) => Promise<RustTransportAntwoord>;
  vergeten: () => void;
}) {
  let actief = false, generatie = 0, sessie: YrsSession | null = null;
  let lease: Lease | null = null, oud = maakRustBron(opties.vergeten);
  let opening: Promise<void> = Promise.resolve();
  const plan = (taak: () => Promise<void>) => {
    // Een late opening eerst opruimen voordat dezelfde documentnaam opnieuw opent.
    // De invoer wacht hier niet op en mag intussen de bestaande route gebruiken.
    opening = opening.then(taak, taak).catch(() => {});
  };
  const vergeten = async (k: Koppeling) => { await opties.invoke("writer_journaal_vergeten", { gegevens: k }); };
  const geldig = (g: number, s: YrsSession | null) => actief && generatie === g && sessie === s;
  function herbegin(s: YrsSession | null) {
    const vorig = lease; lease = null; sessie = s; const g = ++generatie;
    oud.vergeet(); oud = maakRustBron(opties.vergeten);
    if (vorig) plan(() => vergeten(vorig.koppeling));
    if (!opties.optIn) return;
    plan(async () => {
      if (!actief || generatie !== g) return;
      const m = await opties.invoke("writer_journaal_mogelijkheden");
      if (!actief || generatie !== g) return;
      if (!object(m) || m.schema !== 3 || m.beschikbaar !== true || m.standaardIngeschakeld !== false
        || m.levensduurCodering !== "decimaal" || m.maxVolgnummer !== Number.MAX_SAFE_INTEGER) return;
      const k = koppeling(await opties.invoke("writer_journaal_openen", {
        gegevens: { documentId: opties.documentId, optIn: true },
      }), opties.documentId);
      if (!actief || generatie !== g) { await vergeten(k); return; }
      lease = { koppeling: k, bron: maakRustBron(() => {}), volgnummer: 0, keten: Promise.resolve() };
    });
  }
  function bestaandeRoute(g: number, s: YrsSession, bron = oud): TekstVoorbereiding {
    return { schema: 2, bron, transport: opties.transport, actueel: () => geldig(g, s) };
  }
  return {
    activeer() { actief = true; herbegin(null); },
    stop() {
      actief = false; generatie++; sessie = null;
      const vorig = lease; lease = null; oud.vergeet(); oud = maakRustBron(opties.vergeten);
      if (vorig) plan(() => vergeten(vorig.koppeling));
    },
    gereed: () => opening,
    begin(s: YrsSession): TekstVoorbereiding {
      if (sessie === null) sessie = s;
      else if (sessie !== s) herbegin(s);
      const g = generatie, eigen = lease;
      if (!eigen) return bestaandeRoute(g, s);
      const actueel = () => geldig(g, s) && lease === eigen;
      return {
        schema: 3, bron: eigen.bron, actueel,
        transport(a) {
          // Ook gelijktijdige aanroepers geven de Rust-werker dezelfde volgorde.
          const taak = eigen.keten.then(async () => {
            if (!actueel()) throw Error("Deze Writer-koppeling is niet meer actief");
            if (eigen.fout) throw eigen.fout;
            if (eigen.volgnummer >= Number.MAX_SAFE_INTEGER) throw Error("Het Writer-volgnummer is uitgeput");
            const n = ++eigen.volgnummer;
            try {
              const r = controleer(await opties.invoke("writer_journaal_voorbereiden", {
                gegevens: { koppeling: eigen.koppeling, volgnummer: n, aanvraag: a },
              }), a, eigen.koppeling, n);
              if (!actueel()) throw Error("Deze Writer-koppeling is niet meer actief");
              return r;
            } catch (fout) {
              // Niet raden of een mislukte transportopdracht al was toegelaten.
              // De editor kan expliciet sluiten/heropenen; geen stille herhaling.
              eigen.fout = alsFout(fout); throw eigen.fout;
            }
          });
          eigen.keten = taak.then(() => {}, () => {});
          return taak;
        },
        terugval() {
          if (!actueel()) throw Error("De capaciteitsovergang hoort bij een oude Writer-koppeling");
          lease = null; plan(() => vergeten(eigen.koppeling));
          // Een eerdere schema-2-aanvraag mag deze nieuwe cache niet bevestigen.
          oud = maakRustBron(opties.vergeten);
          return bestaandeRoute(g, s);
        },
      };
    },
  };
}
