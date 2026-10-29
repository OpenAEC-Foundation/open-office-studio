/** Rekenwerk van de diasorteerder (#76), los van React en de engine. */

/**
 * De volgorde na het verplaatsen van `gekozen` naar invoegpunt `voor` (een
 * index in de huidige volgorde; `aantal` = achteraan). De gekozen dia's
 * blijven onderling in hun volgorde.
 */
export function nieuweVolgorde<T>(volgorde: readonly T[], gekozen: ReadonlySet<number>, voor: number): T[] {
  const blijft: T[] = [];
  const mee: T[] = [];
  let invoeg = 0;
  volgorde.forEach((item, i) => {
    if (gekozen.has(i)) mee.push(item);
    else {
      if (i < voor) invoeg++;
      blijft.push(item);
    }
  });
  return [...blijft.slice(0, invoeg), ...mee, ...blijft.slice(invoeg)];
}

/**
 * De `moveSlide`-stappen (id, doelindex) die `huidig` in `doel` veranderen;
 * elke stap haalt de dia weg en zet hem op de doelindex. Hooguit één stap per
 * dia, en geen stappen als er niets verandert.
 */
export function verplaatsStappen<T>(huidig: readonly T[], doel: readonly T[]): [T, number][] {
  const lijst = [...huidig];
  const stappen: [T, number][] = [];
  for (let k = 0; k < doel.length; k++) {
    if (lijst[k] === doel[k]) continue;
    const van = lijst.indexOf(doel[k]);
    if (van < 0) continue;
    lijst.splice(van, 1);
    lijst.splice(k, 0, doel[k]);
    stappen.push([doel[k], k]);
  }
  return stappen;
}

/** Klik op een miniatuur: alleen, met Ctrl (wisselen) of met Shift (reeks vanaf het anker). */
export function kies(
  huidig: ReadonlySet<number>,
  anker: number,
  index: number,
  { ctrl, shift }: { ctrl?: boolean; shift?: boolean },
): { selectie: Set<number>; anker: number } {
  if (shift) {
    const van = Math.min(anker, index);
    const tot = Math.max(anker, index);
    const reeks = new Set<number>(ctrl ? huidig : []);
    for (let i = van; i <= tot; i++) reeks.add(i);
    return { selectie: reeks, anker };
  }
  if (ctrl) {
    const nieuw = new Set(huidig);
    if (nieuw.has(index) && nieuw.size > 1) nieuw.delete(index);
    else nieuw.add(index);
    return { selectie: nieuw, anker: index };
  }
  return { selectie: new Set([index]), anker: index };
}

/** Pijltoetsen in een raster met `kolommen` kolommen. */
export function stapInRaster(index: number, toets: string, kolommen: number, aantal: number): number {
  const k = Math.max(1, kolommen);
  const doel =
    toets === "ArrowLeft"
      ? index - 1
      : toets === "ArrowRight"
        ? index + 1
        : toets === "ArrowUp"
          ? index - k
          : toets === "ArrowDown"
            ? index + k
            : toets === "Home"
              ? 0
              : toets === "End"
                ? aantal - 1
                : index;
  return Math.max(0, Math.min(aantal - 1, doel));
}

/** Indexen na het wegnemen van `weg`: een selectie die over blijft, of de dia ervoor. */
export function naVerwijderen(aantalVoor: number, weg: ReadonlySet<number>): number {
  const eerste = Math.min(...weg);
  const over = aantalVoor - weg.size;
  return Math.max(0, Math.min(over - 1, eerste));
}

/** Breedte van een miniatuur bij een schuifstand van 0–100 (logaritmisch, 96–480 px). */
export const MINIATUUR = { min: 96, max: 480, standaard: 200 };
export function miniatuurBreedte(stand: number) {
  const t = Math.max(0, Math.min(100, stand)) / 100;
  return Math.round(MINIATUUR.min * Math.pow(MINIATUUR.max / MINIATUUR.min, t));
}
export function schuifStand(breedte: number) {
  const b = Math.max(MINIATUUR.min, Math.min(MINIATUUR.max, breedte));
  return Math.round((Math.log(b / MINIATUUR.min) / Math.log(MINIATUUR.max / MINIATUUR.min)) * 100);
}
