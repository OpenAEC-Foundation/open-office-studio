/** SpreadsheetML HSL luminance tint, independent of workbook editing. */
export function kleurTint(hex: string, tint: number): string {
  const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255),
    [r, g, b] = rgb;
  const max = Math.max(...rgb),
    min = Math.min(...rgb),
    d = max - min,
    l = (max + min) / 2;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  let h = !d
    ? 0
    : max === r
      ? ((g - b) / d + 6) % 6
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  const lum = Math.max(
    0,
    Math.min(1, tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint),
  );
  const c = (1 - Math.abs(2 * lum - 1)) * s,
    x = c * (1 - Math.abs((h % 2) - 1)),
    m = lum - c / 2;
  const kanalen =
    h < 1
      ? [c, x, 0]
      : h < 2
        ? [x, c, 0]
        : h < 3
          ? [0, c, x]
          : h < 4
            ? [0, x, c]
            : h < 5
              ? [x, 0, c]
              : [c, 0, x];
  return (
    "#" +
    kanalen
      .map((n) =>
        Math.round((n + m) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
