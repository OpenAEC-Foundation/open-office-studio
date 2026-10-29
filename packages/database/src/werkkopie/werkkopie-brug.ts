/**
 * Brug tussen een `Werkkopie` en een MessagePort, zodat een andere worker
 * (bijvoorbeeld de VBA-runtime) rechtstreeks met de werkkopie praat zonder
 * via de UI-thread te gaan.
 *
 *   // Kant van de werkkopie (bijv. de databaseworker):
 *   koppelWerkkopie(werkkopie, poort);
 *   // Andere kant (bijv. de VBA-worker):
 *   const werkkopie = await werkkopieViaPoort(poort);
 *
 * Fouten komen aan als `WerkkopieFout` met dezelfde code.
 */
import i18next from "i18next";
import { WerkkopieFout, type WerkkopieFoutcode, type Werkkopie } from "./contract.ts";

export const WERKKOPIE_METHODEN = [
  "tabellen",
  "relaties",
  "querys",
  "query",
  "voerQueryUit",
  "parametersVan",
  "rijen",
  "rij",
  "voegToe",
  "wijzig",
  "verwijder",
  "maakTabel",
  "verwijderTabel",
  "voegVeldToe",
  "hernoemVeld",
  "verwijderVeld",
  "wijzigVeld",
  "zetPrimaireSleutel",
  "maakRelatie",
  "verwijderRelatie",
  "bewaarQuery",
  "verwijderQuery",
  "begin",
  "bevestig",
  "terugdraaien",
  "ontwerpen",
  "bewaarOntwerp",
  "verwijderOntwerp",
  "modules",
  "bewaarModule",
  "verwijderModule",
  "gewijzigd",
  "exporteer",
  "sluit",
] as const satisfies readonly (keyof Werkkopie)[];
export type WerkkopieMethode = (typeof WERKKOPIE_METHODEN)[number];
// Elke contractmethode moet in de lijst staan (anders is hij via een poort onbereikbaar).
type Ontbrekend = Exclude<keyof Werkkopie, WerkkopieMethode | "bron">;
const _volledig: [Ontbrekend] extends [never] ? true : Ontbrekend = true;
void _volledig;

export interface FoutBericht {
  code: WerkkopieFoutcode;
  melding: string;
}
interface Verzoek {
  werkkopie: 1;
  id: number;
  methode: WerkkopieMethode | "bron";
  args: unknown[];
}
interface Antwoord {
  werkkopie: 1;
  id: number;
  resultaat?: unknown;
  fout?: FoutBericht;
}

/** Minimale poortvorm: browser-MessagePort en Node-MessagePort voldoen allebei. */
export interface Poort {
  postMessage(bericht: unknown, overdracht?: Transferable[]): void;
  addEventListener(type: "message", luisteraar: (event: MessageEvent) => void): void;
  removeEventListener(type: "message", luisteraar: (event: MessageEvent) => void): void;
  start?(): void;
  close?(): void;
}

const CODES = new Set<WerkkopieFoutcode>([
  "syntaxis",
  "niet-ondersteund",
  "onbekend-object",
  "beperking",
  "parameter-ontbreekt",
  "alleen-lezen",
  "intern",
]);

export function foutAlsBericht(fout: unknown): FoutBericht {
  if (fout instanceof WerkkopieFout) return { code: fout.code, melding: fout.message };
  return { code: "intern", melding: fout instanceof Error ? fout.message : String(fout) };
}
export function foutUitBericht(bericht: Partial<FoutBericht> | string): WerkkopieFout {
  if (typeof bericht === "string") return new WerkkopieFout("intern", bericht);
  const code = bericht.code && CODES.has(bericht.code) ? bericht.code : "intern";
  return new WerkkopieFout(code, bericht.melding ?? i18next.t("database:bridge.unknownError"));
}

/** Voert een contractmethode uit op naam; onbekende namen worden geweigerd. */
export async function voerWerkkopieMethodeUit(werkkopie: Werkkopie, methode: string, args: unknown[] = []): Promise<unknown> {
  if (methode === "bron") return werkkopie.bron;
  if (!(WERKKOPIE_METHODEN as readonly string[]).includes(methode))
    throw new WerkkopieFout("intern", i18next.t("database:bridge.unknownMethod", { method: methode }));
  const functie = werkkopie[methode as WerkkopieMethode] as ((...a: unknown[]) => Promise<unknown>) | undefined;
  if (typeof functie !== "function")
    throw new WerkkopieFout("niet-ondersteund", i18next.t("database:bridge.methodMissing", { method: methode }));
  return functie.apply(werkkopie, args);
}

/** Overdraagbare buffers in een resultaat (alleen bij export, om kopiëren te vermijden). */
function overdracht(methode: string, resultaat: unknown): Transferable[] {
  return methode === "exporteer" && resultaat instanceof Uint8Array ? [resultaat.buffer as ArrayBuffer] : [];
}

/**
 * Laat `werkkopie` verzoeken beantwoorden die via `poort` binnenkomen.
 * Geeft een functie terug die de koppeling weer losmaakt.
 * `sluit` via de poort sluit de werkkopie niet, maar alleen de koppeling,
 * tenzij `sluitToegestaan` waar is.
 */
export function koppelWerkkopie(
  werkkopie: Werkkopie,
  poort: Poort,
  opties: { sluitToegestaan?: boolean } = {},
): () => void {
  const luisteraar = async (event: MessageEvent) => {
    const verzoek = event.data as Verzoek;
    if (!verzoek || verzoek.werkkopie !== 1 || typeof verzoek.id !== "number") return;
    let antwoord: Antwoord;
    let lijst: Transferable[] = [];
    try {
      if (verzoek.methode === "sluit" && !opties.sluitToegestaan) {
        antwoord = { werkkopie: 1, id: verzoek.id, resultaat: undefined };
        ontkoppel();
      } else {
        const resultaat = await voerWerkkopieMethodeUit(werkkopie, verzoek.methode, verzoek.args ?? []);
        antwoord = { werkkopie: 1, id: verzoek.id, resultaat };
        lijst = overdracht(verzoek.methode, resultaat);
      }
    } catch (fout) {
      antwoord = { werkkopie: 1, id: verzoek.id, fout: foutAlsBericht(fout) };
    }
    poort.postMessage(antwoord, lijst);
  };
  const ontkoppel = () => {
    poort.removeEventListener("message", luisteraar);
  };
  poort.addEventListener("message", luisteraar);
  poort.start?.();
  return ontkoppel;
}

export interface PoortWerkkopie extends Required<Omit<Werkkopie, "bron">> {
  readonly bron: Werkkopie["bron"];
  /** Stopt met luisteren op de poort; openstaande verzoeken worden afgewezen. */
  ontkoppel(): void;
}

/**
 * Maakt een `Werkkopie` die elk verzoek via `poort` naar een gekoppelde
 * werkkopie stuurt. `tijdslimiet` (ms, standaard geen) wijst een verzoek af
 * dat te lang duurt; de werkkopie aan de andere kant loopt dan wel door.
 */
export async function werkkopieViaPoort(poort: Poort, opties: { tijdslimiet?: number } = {}): Promise<PoortWerkkopie> {
  let volgende = 0;
  let gesloten: string | null = null;
  const wachtend = new Map<number, { klaar: (w: unknown) => void; fout: (f: Error) => void; timer?: ReturnType<typeof setTimeout> }>();
  const luisteraar = (event: MessageEvent) => {
    const antwoord = event.data as Antwoord;
    if (!antwoord || antwoord.werkkopie !== 1) return;
    const verzoek = wachtend.get(antwoord.id);
    if (!verzoek) return;
    wachtend.delete(antwoord.id);
    if (verzoek.timer) clearTimeout(verzoek.timer);
    if (antwoord.fout) verzoek.fout(foutUitBericht(antwoord.fout));
    else verzoek.klaar(antwoord.resultaat);
  };
  poort.addEventListener("message", luisteraar);
  poort.start?.();
  const vraag = (methode: WerkkopieMethode | "bron", args: unknown[]) => {
    if (gesloten) return Promise.reject(new WerkkopieFout("intern", gesloten));
    const id = ++volgende;
    return new Promise<unknown>((klaar, fout) => {
      const timer = opties.tijdslimiet
        ? setTimeout(() => {
            wachtend.delete(id);
            fout(new WerkkopieFout("beperking", i18next.t("database:bridge.timeout", { count: Math.round(opties.tijdslimiet! / 1000), method: methode })));
          }, opties.tijdslimiet)
        : undefined;
      wachtend.set(id, { klaar, fout, timer });
      poort.postMessage({ werkkopie: 1, id, methode, args } satisfies Verzoek);
    });
  };
  const bron = (await vraag("bron", [])) as Werkkopie["bron"];
  const ontkoppel = (reden = i18next.t("database:bridge.disconnected")) => {
    gesloten = reden;
    poort.removeEventListener("message", luisteraar);
    for (const v of wachtend.values()) {
      if (v.timer) clearTimeout(v.timer);
      v.fout(new WerkkopieFout("intern", reden));
    }
    wachtend.clear();
  };
  const proxy = { bron, ontkoppel: () => ontkoppel() } as PoortWerkkopie;
  for (const methode of WERKKOPIE_METHODEN)
    (proxy as unknown as Record<string, unknown>)[methode] = async (...args: unknown[]) => {
      const resultaat = await vraag(methode, args);
      if (methode === "sluit") ontkoppel(i18next.t("database:client.workingCopyClosed"));
      return resultaat;
    };
  return proxy;
}
