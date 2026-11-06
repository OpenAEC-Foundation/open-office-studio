/** Ook bij kleine of sterk uitgezoomde sporen blijft het midden selecteerbaar. */
export function kopRandBreedte(grootte: number): number {
  return Math.max(0, Math.min(4, grootte / 4));
}

/** Welke grens de muis aanwijst; null is het selecteerbare midden. */
export function kopRand(grootte: number, positie: number): "vorige" | "huidige" | null {
  if (grootte <= 0 || !Number.isFinite(grootte) || !Number.isFinite(positie)) return null;
  const rand = kopRandBreedte(grootte);
  if (positie >= grootte - rand) return "huidige";
  if (positie <= rand) return "vorige";
  return null;
}
