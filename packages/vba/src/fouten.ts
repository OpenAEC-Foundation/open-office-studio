/**
 * Foutsoorten van de VBA-module.
 *
 * - `VbaParseerFout`: de bron is geen geldige (of geen ondersteunde) VBA.
 * - `VbaFout`: een runtimefout met een VBA-foutnummer (`Err.Number`), die met
 *   `On Error` af te vangen is.
 * - `VbaAfbreking`: stappenlimiet, annulering, afscherming of `End`; nooit af te vangen.
 *
 * Meldingen komen uit i18next (namespace `vba`) in de taal die actief is op
 * het moment dat de fout ontstaat.
 */
import i18next from "i18next";

export interface Positie {
  module: string;
  regel: number;
  kolom: number;
}

export class VbaParseerFout extends Error {
  constructor(
    melding: string,
    readonly positie: Positie,
    /** Korte, broncodevrije omschrijving van de constructie, voor statistieken. */
    readonly constructie: string = "syntaxis",
  ) {
    super(
      i18next.t("vba:parse.atPosition", {
        module: positie.module,
        line: positie.regel,
        column: positie.kolom,
        message: melding,
      }),
    );
    this.name = "VbaParseerFout";
    this.#melding = melding;
  }
  readonly #melding: string;
  /** De melding zonder module en positie. */
  get kaleMelding() {
    return this.#melding;
  }
}

/** Foutnummers met een eigen standaardbeschrijving (sleutel `vba:runtime.e<nummer>`). */
const BEKENDE_FOUTEN = new Set([
  3, 5, 6, 9, 10, 11, 13, 20, 28, 35, 48, 52, 53, 68, 70, 75, 76, 91, 92, 94, 424, 429, 438, 440, 449, 450, 453, 457, 490,
  2293, 2302, 2450, 2451, 2456, 2501, 3010, 3020, 3021, 3024, 3061, 3075, 3078, 3251, 3265, 3270, 3367, 3420,
]);

/**
 * Standaardbeschrijving van een VBA-foutnummer in de actieve taal (in het
 * Nederlands zoals een Nederlandstalige Access ze toont), of undefined als het
 * nummer geen eigen tekst heeft. Wordt opgevraagd op het moment van de fout.
 */
export function foutTekst(nummer: number): string | undefined {
  return BEKENDE_FOUTEN.has(nummer) ? i18next.t(`vba:runtime.e${nummer}`) : undefined;
}

/** Als `foutTekst`, met "Toepassingsfout <nummer>" als terugval. */
export const foutTekstOfAlgemeen = (nummer: number) =>
  foutTekst(nummer) ?? i18next.t("vba:runtime.applicationError", { number: nummer });

export class VbaFout extends Error {
  /** Waar de fout optrad; wordt gevuld zodra de interpreter hem ziet. */
  positie?: Positie & { procedure?: string };
  constructor(
    readonly nummer: number,
    beschrijving?: string,
    readonly bron: string = "",
  ) {
    super(beschrijving ?? foutTekstOfAlgemeen(nummer));
    this.name = "VbaFout";
  }
  get beschrijving() {
    return this.message;
  }
}

export type AfbrekingReden =
  | "stappenlimiet"
  | "geannuleerd"
  | "afgeschermd"
  | "niet-ondersteund"
  | "end"
  | "stop"
  | "intern";

export class VbaAfbreking extends Error {
  positie?: Positie & { procedure?: string };
  /** Bij reden "afgeschermd": wat er geweigerd is (voor de modi `fout`/`overslaan`). */
  afscherming?: { naam: string; categorie: string; nummer: number; object?: boolean };
  constructor(
    readonly reden: AfbrekingReden,
    melding: string,
  ) {
    super(melding);
    this.name = "VbaAfbreking";
  }
}

export const fout = (nummer: number, beschrijving?: string) =>
  new VbaFout(nummer, beschrijving);

/** Een constructie die de interpreter (nog) niet kent; stopt de uitvoering. */
export const nietOndersteund = (wat: string) =>
  new VbaAfbreking(
    "niet-ondersteund",
    i18next.t("vba:runtime.unsupported", { what: wat }),
  );
