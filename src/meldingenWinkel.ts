import type { Rapport } from "./import/rapport";

/**
 * Meldingen rechtsonder (toasts, OpenAEC Blueprint `toast`): zwevend boven de
 * statusbalk, zodat het document niet verschuift. Elke melding hoort bij een
 * tabblad (of bij het hele venster) en is alleen zichtbaar als dat tabblad
 * actief is. Info en Gelukt verdwijnen vanzelf zodra ze een tijdje in beeld
 * zijn geweest; Let op en Fout blijven tot de gebruiker ze sluit.
 */
export type Toon = "info" | "succes" | "waarschuwing" | "fout";

export interface MeldingActie {
  label: string;
  actie: () => void;
}

export interface Melding {
  id: number;
  /** Tabblad-id, of null voor een melding van het hele venster. */
  tabblad: number | null;
  toon: Toon;
  tekst: string;
  /** Knoppen vóór de sluitknop, zoals "Opslaan als". */
  acties?: MeldingActie[];
  /** Rapport over onvolledige ondersteuning; de melding krijgt "Details". */
  rapport?: { rapport: Rapport; bestandsnaam: string };
  /** Milliseconden in beeld tot de melding vanzelf sluit; null = blijft. */
  duur: number | null;
}

export type NieuweMelding = Omit<Melding, "id" | "duur"> & { duur?: number | null };

/** Hoe lang een info- of gelukt-melding in beeld blijft. */
export const STANDAARDDUUR = 6000;
/** Meer meldingen per tabblad zijn niet nuttig; de oudste vallen weg. */
export const MAX_PER_TABBLAD = 5;

export function standaardDuur(toon: Toon): number | null {
  return toon === "info" || toon === "succes" ? STANDAARDDUUR : null;
}

/** Fouten onderbreken (role="alert"); de rest wordt beleefd voorgelezen. */
export function rol(toon: Toon): "alert" | "status" {
  return toon === "fout" ? "alert" : "status";
}

/**
 * Voegt een melding toe. Dezelfde tekst voor hetzelfde tabblad vervangt de
 * oude (die komt onderaan opnieuw in beeld) in plaats van te stapelen.
 */
export function voegToe(
  lijst: readonly Melding[],
  nieuw: NieuweMelding,
  id: number,
): Melding[] {
  const melding: Melding = {
    ...nieuw,
    id,
    duur: nieuw.duur === undefined ? standaardDuur(nieuw.toon) : nieuw.duur,
  };
  const zonder = lijst.filter(
    (m) =>
      !(
        m.tabblad === melding.tabblad &&
        m.tekst === melding.tekst &&
        !!m.rapport === !!melding.rapport
      ),
  );
  const volgende = [...zonder, melding];
  const vanTabblad = volgende.filter((m) => m.tabblad === melding.tabblad);
  if (vanTabblad.length <= MAX_PER_TABBLAD) return volgende;
  const weg = new Set(
    vanTabblad.slice(0, vanTabblad.length - MAX_PER_TABBLAD).map((m) => m.id),
  );
  return volgende.filter((m) => !weg.has(m.id));
}

/** Meldingen voor het actieve tabblad plus die van het hele venster. */
export function zichtbaar(
  lijst: readonly Melding[],
  actief: number | null,
): Melding[] {
  return lijst.filter((m) => m.tabblad === null || m.tabblad === actief);
}

export function verwijder(lijst: readonly Melding[], id: number): Melding[] {
  const volgende = lijst.filter((m) => m.id !== id);
  return volgende.length === lijst.length ? (lijst as Melding[]) : volgende;
}

/** Alle meldingen van een gesloten of verplaatst tabblad. */
export function vergeetTabblad(
  lijst: readonly Melding[],
  tabblad: number,
): Melding[] {
  const volgende = lijst.filter((m) => m.tabblad !== tabblad);
  return volgende.length === lijst.length ? (lijst as Melding[]) : volgende;
}

/** Het rapport na openen als blijvende melding met de knop Details. */
export function rapportMelding(
  tabblad: number,
  rapport: Rapport,
  bestandsnaam: string,
): NieuweMelding {
  return { tabblad, toon: "waarschuwing", tekst: rapport.kop, rapport: { rapport, bestandsnaam } };
}

/**
 * Teller die alleen loopt terwijl de melding in beeld is en niet onder de
 * muis of de focus staat (WCAG 2.2.1). `nu` is injecteerbaar voor tests.
 */
export class Afteller {
  private verbruikt = 0;
  private sinds: number | null = null;
  constructor(
    readonly duur: number,
    private readonly nu: () => number = () => Date.now(),
  ) {}
  start() {
    if (this.sinds === null) this.sinds = this.nu();
  }
  pauzeer() {
    if (this.sinds === null) return;
    this.verbruikt += this.nu() - this.sinds;
    this.sinds = null;
  }
  /** Resterende tijd in milliseconden (nooit negatief). */
  resterend() {
    const lopend = this.sinds === null ? 0 : this.nu() - this.sinds;
    return Math.max(0, this.duur - this.verbruikt - lopend);
  }
  get loopt() {
    return this.sinds !== null;
  }
}

/**
 * Toon voor meldingen zonder eigen toon (Email Studio meldt alleen tekst):
 * een mislukte actie is een fout, de rest informatie.
 */
export function raadToon(tekst: string): Toon {
  return /mislukt|\bkon\b.*\bniet\b|niet gelukt|niet mogelijk|fout|failed|error|could not/i.test(tekst)
    ? "fout"
    : "info";
}
