/**
 * Het hostcontract van de gehoste bouw (bijvoorbeeld een werkplek die Open Office Studio in een iframe laadt): zet de
 * host `window.openaecHost` met `save`, dan gaat opslaan rechtstreeks naar de opslag van de host in plaats van een
 * download. Zonder host blijft opslaan in de browser een download.
 *
 * Optioneel: `open` levert het document waarmee de app start, `saveAs` bewaart onder een nieuwe naam, `melding` toont
 * een melding in de host. De OpenAEC SuperCloud-werkplek levert deze host via postMessage (src/werkplek.ts).
 */
export interface HostBestand {
  naam: string;
  bytes: Uint8Array;
  /** Versie in de opslag van de host; wordt bij opslaan als basisversie teruggegeven. */
  versie?: number;
  alleenLezen?: boolean;
}

export interface HostBewaard {
  naam?: string;
  versie?: number;
  /** De host bewaarde een conflictkopie omdat iemand anders intussen opsloeg. */
  conflict?: boolean;
}

export type HostMeldingSoort = "info" | "waarschuwing" | "fout";

export interface OfficeHost {
  save(naam: string, bytes: Uint8Array, basisVersie?: number): Promise<HostBewaard | void>;
  open?(): Promise<HostBestand | null>;
  saveAs?(naam: string, bytes: Uint8Array): Promise<HostBewaard | void>;
  melding?(soort: HostMeldingSoort, tekst: string): void;
}

/** De soorten die de host als document opslaat; andere exports blijven een download. */
export const HOST_SOORTEN = ["docx", "xlsx", "pptx", "md"];

export function officeHost(): OfficeHost | undefined {
  const host = (window as { openaecHost?: Partial<OfficeHost> }).openaecHost;
  return host && typeof host.save === "function" ? (host as OfficeHost) : undefined;
}

/** Versies van documenten uit de host, per bestandsnaam. */
const versies = new Map<string, { versie?: number; alleenLezen?: boolean }>();
/** Na een conflict werkt het tabblad (met de oude naam) verder in de conflictkopie. */
const doorverwijzing = new Map<string, string>();

const huidigeNaam = (naam: string) => doorverwijzing.get(naam) ?? naam;

export function noteerHostBestand(bestand: Pick<HostBestand, "naam" | "versie" | "alleenLezen">) {
  versies.set(bestand.naam, { versie: bestand.versie, alleenLezen: bestand.alleenLezen });
  doorverwijzing.delete(bestand.naam);
}

export function hostBestandBekend(naam: string) {
  return versies.has(huidigeNaam(naam));
}

/**
 * Bewaart via de host. Een bekend document gaat met zijn basisversie naar `save`; een nieuwe naam gaat naar
 * `saveAs` als de host dat kent. De nieuwe versie wordt onthouden voor de volgende keer.
 */
export async function bewaarBijHost(
  host: OfficeHost,
  naam: string,
  bytes: Uint8Array,
): Promise<{ naam: string; conflict: boolean }> {
  const doel = huidigeNaam(naam);
  const bekend = versies.get(doel);
  const uit =
    !bekend && host.saveAs
      ? await host.saveAs(doel, bytes)
      : await host.save(doel, bytes, bekend?.versie);
  const nieuweNaam = (uit && uit.naam) || doel;
  const conflict = !!(uit && uit.conflict);
  noteerHostBestand({ naam: nieuweNaam, versie: uit ? uit.versie : undefined });
  if (nieuweNaam !== doel) {
    // Bij een conflict is het document als kopie bewaard; die kopie is vanaf nu het werkdocument.
    if (conflict) versies.delete(doel);
    doorverwijzing.set(naam, nieuweNaam);
  }
  return { naam: nieuweNaam, conflict };
}
