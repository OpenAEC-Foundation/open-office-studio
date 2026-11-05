/** Vaste markeernamen uit een tekstbestand, als kleur voor het keuzeveld. */
const NAMEN: Readonly<Record<string, string>> = {
  black: "#000000", blue: "#0000ff", cyan: "#00ffff", green: "#00ff00",
  magenta: "#ff00ff", red: "#ff0000", yellow: "#ffff00", white: "#ffffff",
  darkblue: "#000080", darkcyan: "#008080", darkgreen: "#008000",
  darkmagenta: "#800080", darkred: "#800000", darkyellow: "#808000",
  darkgray: "#808080", lightgray: "#c0c0c0",
};

export function markeerKleur(waarde: unknown) {
  if (typeof waarde !== "string") return "#f6d32d";
  const hex = waarde.replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex}` : NAMEN[waarde.toLowerCase()] ?? "#f6d32d";
}
