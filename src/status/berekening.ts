import { ZOOM_MAX, ZOOM_MIN } from "../documentzoom";
import type { Statistiek } from "./statusinfo";
import { formatGetal } from "../i18n/opmaak";
import type { Taal } from "../i18n/talen";

/**
 * De zoomschuif loopt van 0 tot 100 met 100% in het midden, zoals in
 * gangbare kantoorsuites: links 10–100%, rechts 100–500%.
 */
export function schuifNaarZoom(stand: number) {
  const s = Math.min(100, Math.max(0, stand));
  // Dicht bij het midden klikt de schuif vast op 100%.
  if (Math.abs(s - 50) <= 1) return 1;
  const zoom =
    s <= 50
      ? ZOOM_MIN + (1 - ZOOM_MIN) * (s / 50)
      : 1 + (ZOOM_MAX - 1) * ((s - 50) / 50);
  // Rond af op hele procenten.
  return Math.round(zoom * 100) / 100;
}

export function zoomNaarSchuif(zoom: number) {
  const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
  const stand =
    z <= 1
      ? ((z - ZOOM_MIN) / (1 - ZOOM_MIN)) * 50
      : 50 + ((z - 1) / (ZOOM_MAX - 1)) * 50;
  return Math.round(stand * 10) / 10;
}

type Cel = { kind: string; value?: unknown };

/** Verwerkt ook losse blokken zonder de hele selectie in het geheugen te houden. */
export class StatistiekTeller {
  private aantal = 0;
  private getallen = 0;
  private som = 0;
  private minimum: number | null = null;
  private maximum: number | null = null;

  tel(cel: Cel) {
    if (cel.kind === "empty") return;
    this.aantal++;
    if (
      cel.kind !== "number" ||
      typeof cel.value !== "number" ||
      !Number.isFinite(cel.value)
    )
      return;
    this.getallen++;
    this.som += cel.value;
    this.minimum =
      this.minimum === null ? cel.value : Math.min(this.minimum, cel.value);
    this.maximum =
      this.maximum === null ? cel.value : Math.max(this.maximum, cel.value);
  }

  resultaat(): Statistiek {
    return {
      aantal: this.aantal,
      getallen: this.getallen,
      som: this.som,
      gemiddelde: this.getallen ? this.som / this.getallen : null,
      minimum: this.minimum,
      maximum: this.maximum,
    };
  }
}

/** Som, gemiddelde, aantal, minimum en maximum van een selectie. */
export function selectieStatistiek(
  rijen: readonly (readonly Cel[])[],
): Statistiek {
  const teller = new StatistiekTeller();
  for (const rij of rijen) for (const cel of rij) teller.tel(cel);
  return teller.resultaat();
}

/** Getal in de notatie van de interfacetaal, met hooguit tien decimalen. */
export function getal(waarde: number, taal?: Taal) {
  // Drijvende-kommaruis (0,1 + 0,2) niet tonen.
  return formatGetal(
    Number(waarde.toPrecision(12)),
    { maximumFractionDigits: 10 },
    taal,
  );
}
