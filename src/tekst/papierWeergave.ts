/** Donker papier verandert alleen de schilderlaag, nooit het document of de afbeeldingen. */
import type { DisplayPage } from "@betteroffice/docx/layout/render";

/** Keer de lichtheid om en behoud de kleurtoon, verzadiging en transparantie. */
export function donkerePapierkleur(kleur: string, voorgrond = false): string {
  const hex = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(kleur);
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i.exec(kleur);
  let r: number, g: number, b: number, alpha: number | undefined;
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  } else if (rgb) {
    [r, g, b] = rgb.slice(1, 4).map((v) => Math.min(255, Number(v)) / 255);
    alpha = rgb[4] === undefined ? undefined : Number(rgb[4]);
    if (alpha === 0) return kleur;
  } else return kleur;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), verschil = max - min, licht = (max + min) / 2;
  const verzadiging = verschil === 0 ? 0 : verschil / (1 - Math.abs(2 * licht - 1));
  let hoek = verschil === 0 ? 0 : max === r ? ((g - b) / verschil + 6) % 6 : max === g ? (b - r) / verschil + 2 : (r - g) / verschil + 4;
  // Verzadigd blauw blijft bij alleen omkeren te donker voor donker papier.
  const nieuw = Math.max((232 - 201 * licht) / 255, voorgrond && verzadiging > 0.1 ? 0.75 : 0);
  const c = (1 - Math.abs(2 * nieuw - 1)) * verzadiging, x = c * (1 - Math.abs(hoek % 2 - 1)), m = nieuw - c / 2;
  const delen = hoek < 1 ? [c, x, 0] : hoek < 2 ? [x, c, 0] : hoek < 3 ? [0, c, x] : hoek < 4 ? [0, x, c] : hoek < 5 ? [x, 0, c] : [c, 0, x];
  const waarden = delen.map((v) => Math.round((v + m) * 255));
  return alpha === undefined ? `#${waarden.map((v) => v.toString(16).padStart(2, "0")).join("")}` : `rgba(${waarden.join(", ")}, ${alpha})`;
}

const KLEUREN = new Set(["color", "fill", "stroke", "background"]);
const ONGEWIJZIGD = new Set(["glyphs", "text", "path", "font", "fallbackFont"]);
function schilderlaag(waarde: unknown): unknown {
  if (!waarde || typeof waarde !== "object" || ArrayBuffer.isView(waarde)) return waarde;
  if ((waarde as { kind?: string }).kind === "image") return waarde;
  const lijst = Array.isArray(waarde);
  let anders = false;
  const uit: Record<string, unknown> | unknown[] = lijst ? [] : {};
  for (const [naam, oud] of Object.entries(waarde)) {
    const nieuw = KLEUREN.has(naam) && typeof oud === "string" ? donkerePapierkleur(oud, naam === "color" || naam === "stroke") : ONGEWIJZIGD.has(naam) ? oud : schilderlaag(oud);
    anders ||= nieuw !== oud;
    (uit as Record<string, unknown>)[naam] = nieuw;
  }
  return anders ? uit : waarde;
}
const kopieen = new WeakMap<DisplayPage, DisplayPage>();
export function paginaVoorWeergave(pagina: DisplayPage, modus: string): DisplayPage {
  if (modus !== "dark") return pagina;
  let kopie = kopieen.get(pagina);
  if (!kopie) { kopie = schilderlaag(pagina) as DisplayPage;kopieen.set(pagina, kopie); }
  return kopie;
}

/** De vastgezette canvasadapter vraagt deze alleen voor de editor, nooit voor export. */
export function installeerPapierWeergave() {
  Object.defineProperty(globalThis, Symbol.for("openaec.office.canvasPalette"), {
    configurable: true, value: { pagina: paginaVoorWeergave },
  });
}
