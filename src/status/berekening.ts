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
  const zoom = s <= 50 ? ZOOM_MIN + (1 - ZOOM_MIN) * (s / 50) : 1 + (ZOOM_MAX - 1) * ((s - 50) / 50);
  // Rond af op hele procenten.
  return Math.round(zoom * 100) / 100;
}

export function zoomNaarSchuif(zoom: number) {
  const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
  const stand = z <= 1 ? ((z - ZOOM_MIN) / (1 - ZOOM_MIN)) * 50 : 50 + ((z - 1) / (ZOOM_MAX - 1)) * 50;
  return Math.round(stand * 10) / 10;
}

type Cel = { kind: string; value?: unknown };

/** Som, gemiddelde, aantal, minimum en maximum van een selectie. */
export function selectieStatistiek(rijen: readonly (readonly Cel[])[]): Statistiek {
  let aantal = 0;
  let getallen = 0;
  let som = 0;
  let minimum: number | null = null;
  let maximum: number | null = null;
  for (const rij of rijen)
    for (const cel of rij) {
      if (cel.kind === "empty") continue;
      aantal++;
      if (cel.kind !== "number" || typeof cel.value !== "number" || !Number.isFinite(cel.value))
        continue;
      getallen++;
      som += cel.value;
      minimum = minimum === null ? cel.value : Math.min(minimum, cel.value);
      maximum = maximum === null ? cel.value : Math.max(maximum, cel.value);
    }
  return {
    aantal,
    getallen,
    som,
    gemiddelde: getallen ? som / getallen : null,
    minimum,
    maximum,
  };
}

/** Getal in de notatie van de interfacetaal, met hooguit tien decimalen. */
export function getal(waarde: number, taal?: Taal) {
  // Drijvende-kommaruis (0,1 + 0,2) niet tonen.
  return formatGetal(Number(waarde.toPrecision(12)), { maximumFractionDigits: 10 }, taal);
}
