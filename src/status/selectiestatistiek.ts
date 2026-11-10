import type { WorkbookHandle } from "@betteroffice/xlsx";
import type { Bereik } from "../lint/rekenblad-logica";
import type { Statistiek } from "./statusinfo";
import { StatistiekTeller } from "./berekening";

export const MAX_STATUS_CELLEN = 200_000;
const BLOK_CELLEN = 500;
const MIN_BLOK_CELLEN = 128;
const DOEL_MS = 12;
const pauze = () => new Promise<void>((klaar) => setTimeout(klaar, 0));
type Lezer = Pick<WorkbookHandle, "version" | "readCells">;

/** Eén selectie per handle: begrensde lezingen, onderbreekbaar en herbruikbaar bij scrollen. */
export class SelectieStatistieken {
  private volgnummer = 0;
  private taak: {
    sleutel: string;
    resultaat: Promise<Statistiek | null>;
    klaar: boolean;
  } | null = null;

  constructor(
    private readonly bron: Lezer,
    private readonly wacht = pauze,
    private readonly nu = () => performance.now(),
  ) {}

  get bezig() {
    return this.taak !== null && !this.taak.klaar;
  }

  stop() {
    this.volgnummer++;
    this.taak = null;
  }

  lees(sheetId: string, b: Bereik): Promise<Statistiek | null> {
    const versie = this.bron.version();
    const sleutel = JSON.stringify([
      versie,
      sheetId,
      b.top,
      b.left,
      b.bottom,
      b.right,
    ]);
    if (this.taak?.sleutel === sleutel) return this.taak.resultaat;
    const nummer = ++this.volgnummer;
    const resultaat = this.bereken(sheetId, { ...b }, versie, nummer);
    this.taak = { sleutel, resultaat, klaar: false };
    // Een tijdelijke weigering of afgebroken lezing mag een latere poging niet blokkeren.
    void resultaat.then(
      (r) => {
        if (this.volgnummer !== nummer) return;
        if (r && this.taak) this.taak.klaar = true;
        else this.taak = null;
      },
      () => {
        if (this.volgnummer === nummer) this.taak = null;
      },
    );
    return resultaat;
  }

  private async bereken(
    sheetId: string,
    b: Bereik,
    versie: string,
    nummer: number,
  ): Promise<Statistiek | null> {
    const breedte = b.right - b.left + 1,
      hoogte = b.bottom - b.top + 1;
    const cellen = breedte * hoogte;
    if (breedte < 1 || hoogte < 1 || cellen < 2 || cellen > MAX_STATUS_CELLEN)
      return null;
    const geldig = () =>
      nummer === this.volgnummer && versie === this.bron.version();
    const teller = new StatistiekTeller();
    // Rijvolgorde blijft gelijk, ook bij zeer brede selecties (afronding van de som).
    let budget = MIN_BLOK_CELLEN;
    let row = b.top,
      col = b.left;
    while (row <= b.bottom) {
      const kolommen = Math.min(b.right - col + 1, budget);
      const rijen =
        kolommen === breedte ? Math.max(1, Math.floor(budget / breedte)) : 1;
      await this.wacht();
      if (!geldig()) return null;
      const begin = this.nu();
      const eindRij = Math.min(row + rijen - 1, b.bottom);
      const eindKolom = col + kolommen - 1;
      const lezing = this.bron.readCells({
        ranges: [
          {
            sheetId,
            range: {
              kind: "rowCol",
              start: { row, col },
              end: {
                row: eindRij,
                col: eindKolom,
              },
            },
          },
        ],
      });
      if (!lezing.ok || !geldig()) return null;
      for (const rij of lezing.ranges[0].cells)
        for (const cel of rij) teller.tel(cel.value);
      // De eerste kleine lezing meet de machine. Onder CPU-druk kleiner,
      // bij ruimte weer groter; nooit meer dan de bestaande 500 cellen.
      const duur = this.nu() - begin;
      if (duur > DOEL_MS) {
        const gelezen = (eindRij - row + 1) * kolommen;
        budget = Math.max(
          MIN_BLOK_CELLEN,
          Math.min(BLOK_CELLEN, Math.floor((gelezen * DOEL_MS) / duur)),
        );
      } else if (duur < DOEL_MS / 2) budget = Math.min(BLOK_CELLEN, budget * 2);
      col += kolommen;
      if (col > b.right) {
        col = b.left;
        row = eindRij + 1;
      }
    }
    return geldig() ? teller.resultaat() : null;
  }
}
