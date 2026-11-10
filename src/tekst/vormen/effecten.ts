/** De native bridge bewaart Shape-effecten; de Canvas-painter gebruikt CSS en pixels. */
const EMU_PER_PX = 9525;
const thema: Record<string, string> = {
  dk1: "000000",
  dark1: "000000",
  text1: "000000",
  tx1: "000000",
  lt1: "FFFFFF",
  light1: "FFFFFF",
  background1: "FFFFFF",
  bg1: "FFFFFF",
  dk2: "44546A",
  dark2: "44546A",
  text2: "44546A",
  tx2: "44546A",
  lt2: "E7E6E6",
  light2: "E7E6E6",
  background2: "E7E6E6",
  bg2: "E7E6E6",
  accent1: "4472C4",
  accent2: "ED7D31",
  accent3: "A5A5A5",
  accent4: "FFC000",
  accent5: "5B9BD5",
  accent6: "70AD47",
  hlink: "0563C1",
  hyperlink: "0563C1",
  folhlink: "954F72",
  followedhyperlink: "954F72",
};
const begrens = (n: number, min = 0, max = 1) =>
  Math.max(min, Math.min(max, n));
const nummer = (x: unknown, standaard = 0) =>
  typeof x === "number" && Number.isFinite(x) ? x : standaard;
export function tekenVormEffect(effect: unknown): unknown {
  if (!effect || typeof effect !== "object") return effect;
  const e = effect as Record<string, unknown>,
    c = e.color;
  // Reeds opgeloste displaylijst-effecten hebben een CSS-kleur en pixelmaten.
  if (!c || typeof c !== "object" || Array.isArray(c)) return effect;
  const kleur = c as Record<string, unknown>,
    rgb = typeof kleur.rgb === "string" ? kleur.rgb.replace(/^#/, "") : null;
  const basis =
    rgb && /^(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(rgb)
      ? rgb
      : (thema[String(kleur.themeColor ?? "").toLowerCase()] ?? "000000");
  const hex = basis.length === 8 ? basis.slice(2) : basis;
  let kanalen = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)),
    alpha =
      (basis.length === 8 ? parseInt(basis.slice(0, 2), 16) / 255 : 1) *
      begrens(nummer(e.opacity, 1));
  // Zoals bij de gewone vormvulling is rgb naast themeColor al gecachet.
  if (!rgb || !kleur.themeColor) {
    const shade =
      typeof kleur.themeShade === "string"
        ? parseInt(kleur.themeShade, 16) / 255
        : null;
    const tint =
      typeof kleur.themeTint === "string"
        ? parseInt(kleur.themeTint, 16) / 255
        : null;
    if (shade !== null && Number.isFinite(shade))
      kanalen = kanalen.map((x) => x * begrens(shade));
    if (tint !== null && Number.isFinite(tint))
      kanalen = kanalen.map((x) => x + (255 - x) * begrens(tint));
  }
  if (Array.isArray(kleur.transforms))
    for (const t of kleur.transforms) {
      if (!t || typeof t !== "object") continue;
      const v = nummer(t.value, 1);
      if (t.kind === "alpha")
        alpha = begrens(v) * begrens(nummer(e.opacity, 1));
      else if (t.kind === "alphaMod") alpha *= begrens(v);
      else if (t.kind === "alphaOff") alpha += v;
      else if (t.kind === "shade") kanalen = kanalen.map((x) => x * begrens(v));
      else if (t.kind === "tint")
        kanalen = kanalen.map((x) => x + (255 - x) * begrens(v));
    }
  return {
    ...e,
    color: `rgba(${kanalen.map((x) => Math.round(begrens(x, 0, 255))).join(",")},${begrens(alpha)})`,
    blurRadius: Math.max(0, nummer(e.blurRadius)) / EMU_PER_PX,
    distance: Math.max(0, nummer(e.distance)) / EMU_PER_PX,
    size: Math.max(0, nummer(e.size)) / EMU_PER_PX,
  };
}
