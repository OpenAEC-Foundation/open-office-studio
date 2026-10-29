/** Rasterlogica voor de tabelkiezer onder Invoegen → Tabel. */
import i18next from "../i18n/config";
import { formatGetal } from "../i18n/opmaak";

export interface Tabelgrootte {
  rijen: number;
  kolommen: number;
}

/** Afmeting van het keuzeraster: 10 kolommen bij 8 rijen, zoals in Word. */
export const RASTER = { kolommen: 10, rijen: 8 } as const;

/** Grenzen van de dialoog ‘Tabel invoegen…’. */
export const GRENZEN = { kolommen: 63, rijen: 500 } as const;

const klem = (waarde: number, max: number) =>
  Math.min(max, Math.max(1, Math.round(waarde)));

/** Houdt een grootte binnen 1…max (niet-getallen worden 1). */
export function begrens(
  grootte: Tabelgrootte,
  max: { rijen: number; kolommen: number } = GRENZEN,
): Tabelgrootte {
  return {
    rijen: klem(Number.isFinite(grootte.rijen) ? grootte.rijen : 1, max.rijen),
    kolommen: klem(
      Number.isFinite(grootte.kolommen) ? grootte.kolommen : 1,
      max.kolommen,
    ),
  };
}

/**
 * Nieuwe grootte na een pijltjestoets in het raster, of null voor een andere
 * toets. Zonder huidige keuze begint het raster bij 1 × 1.
 */
export function verplaats(
  huidig: Tabelgrootte | null,
  toets: string,
  raster: { rijen: number; kolommen: number } = RASTER,
): Tabelgrootte | null {
  const start = huidig ?? { rijen: 0, kolommen: 0 };
  const stap: Record<string, [number, number]> = {
    ArrowRight: [0, 1],
    ArrowLeft: [0, -1],
    ArrowDown: [1, 0],
    ArrowUp: [-1, 0],
  };
  if (toets === "Home") return begrens({ rijen: start.rijen || 1, kolommen: 1 }, raster);
  if (toets === "End")
    return begrens({ rijen: start.rijen || 1, kolommen: raster.kolommen }, raster);
  const delta = stap[toets];
  if (!delta) return null;
  if (!huidig) return { rijen: 1, kolommen: 1 };
  return begrens(
    { rijen: start.rijen + delta[0], kolommen: start.kolommen + delta[1] },
    raster,
  );
}

/** Cel (1-gebaseerd) onder een punt binnen het raster; null buiten het raster. */
export function celOnderPunt(
  x: number,
  y: number,
  cel: number,
  tussenruimte: number,
  raster: { rijen: number; kolommen: number } = RASTER,
): Tabelgrootte | null {
  if (x < 0 || y < 0) return null;
  const stap = cel + tussenruimte;
  const kolommen = Math.floor(x / stap) + 1;
  const rijen = Math.floor(y / stap) + 1;
  if (kolommen > raster.kolommen || rijen > raster.rijen) return null;
  return { rijen, kolommen };
}

/** Of een rastercel (1-gebaseerd) binnen de gekozen grootte valt. */
export const binnen = (
  grootte: Tabelgrootte | null,
  rij: number,
  kolom: number,
) => !!grootte && rij <= grootte.rijen && kolom <= grootte.kolommen;

/** ‘4 × 3’: kolommen × rijen, zoals Word het toont. */
export const afmetingTekst = (grootte: Tabelgrootte | null) =>
  grootte ? `${grootte.kolommen} × ${grootte.rijen}` : "";

/** Voorleestekst bij een grootte, in de interfacetaal ("2 kolommen bij 1 rij"). */
export function afmetingUitleg(grootte: Tabelgrootte | null) {
  if (!grootte) return i18next.t("ribbon:tablePicker.chooseSize");
  return i18next.t("ribbon:tablePicker.sizeDescription", {
    columns: i18next.t("ribbon:tablePicker.columns", {
      count: grootte.kolommen,
      n: formatGetal(grootte.kolommen),
    }),
    rows: i18next.t("ribbon:tablePicker.rows", {
      count: grootte.rijen,
      n: formatGetal(grootte.rijen),
    }),
  });
}

export const zelfdeGrootte = (a: Tabelgrootte | null, b: Tabelgrootte | null) =>
  a === b || (!!a && !!b && a.rijen === b.rijen && a.kolommen === b.kolommen);
