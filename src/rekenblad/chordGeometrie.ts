/** Alleen het DrawingML chord-preset; de brongeometrie blijft onaangeroerd. */
export interface ChordHoeken {
  begin: number;
  einde: number;
}
const OMWENTELING = 21600000;

/** De standaardpreset gebruikt letterlijke adj1/adj2; andere formules blijven onbekend. */
export function leesChordHoeken(
  waarden: readonly { naam?: string; formule?: string }[],
): ChordHoeken | undefined {
  const uit: ChordHoeken = { begin: 2700000, einde: 16200000 };
  const gezien = new Set<string>();
  for (const { naam, formule } of waarden) {
    if (naam !== "adj1" && naam !== "adj2") continue;
    const match = /^val\s+([+-]?\d+)$/.exec(formule?.trim() ?? "");
    const n = match ? Number(match[1]) : NaN;
    if (!Number.isSafeInteger(n) || gezien.has(naam)) return undefined;
    gezien.add(naam);
    uit[naam === "adj1" ? "begin" : "einde"] = Math.max(
      0,
      Math.min(OMWENTELING - 1, n),
    );
  }
  return uit;
}

/** Dezelfde elliptische boog voor SVG en het bestaande afdrukcanvas. */
export function chordGeometrie(w: number, h: number, hoeken: ChordHoeken) {
  if (
    ![w, h, hoeken.begin, hoeken.einde].every(Number.isFinite) ||
    w <= 0 ||
    h <= 0 ||
    hoeken.begin < 0 ||
    hoeken.einde < 0 ||
    hoeken.begin >= OMWENTELING ||
    hoeken.einde >= OMWENTELING
  )
    return null;
  const cx = w / 2,
    cy = h / 2,
    rx = w / 2,
    ry = h / 2;
  // DrawingML-hoeken meten de straal vanuit het middelpunt. Op een niet-ronde
  // ellips zijn dat andere hoeken dan de parameters van Canvas.ellipse().
  const parameter = (hoek: number) => {
    const a = (hoek * Math.PI) / 10800000;
    const t = Math.atan2(rx * Math.sin(a), ry * Math.cos(a));
    return t < 0 ? t + 2 * Math.PI : t;
  };
  const begin = parameter(hoeken.begin);
  let einde = parameter(hoeken.einde);
  const vol = hoeken.begin === hoeken.einde;
  if (vol) einde = begin + 2 * Math.PI;
  else if (einde < begin) einde += 2 * Math.PI;
  const start = { x: cx + rx * Math.cos(begin), y: cy + ry * Math.sin(begin) };
  const eind = { x: cx + rx * Math.cos(einde), y: cy + ry * Math.sin(einde) };
  const boog = (x: number, y: number, groot: boolean) =>
    `A ${rx} ${ry} 0 ${groot ? 1 : 0} 1 ${x} ${y}`;
  // Eén SVG-boog met gelijke eindpunten tekent niets; een volle omwenteling
  // heeft twee halve bogen nodig. Canvas gebruikt gewoon de volledige hoek.
  const pad =
    `M ${start.x} ${start.y} ` +
    (vol
      ? `${boog(2 * cx - start.x, 2 * cy - start.y, false)} ${boog(start.x, start.y, false)}`
      : boog(eind.x, eind.y, einde - begin > Math.PI)) +
    " Z";
  return { cx, cy, rx, ry, begin, einde, start, eind, pad };
}
