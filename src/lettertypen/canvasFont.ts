/**
 * Familienamen met een los getal ("Source Serif 4", "Source Sans 3") zijn in
 * de CSS-fontopgave alleen geldig tussen aanhalingstekens. De tekst- en
 * rekenbladengine zetten `ctx.font` zonder aanhalingstekens; de browser
 * negeert zo'n opgave dan stil en tekent in het vorige lettertype (vaak
 * 10px sans-serif), met de tekens op de breedtes van het juiste lettertype.
 *
 * Deze aanvulling op de `font`-setter van canvas probeert een geweigerde
 * opgave opnieuw met aangehaalde familienamen. Geldige opgaven gaan
 * ongewijzigd door. Herhaalde absolute opgaven mogen hun native setter
 * overslaan als de huidige canvasfont nog dezelfde is.
 */

const GENERIEK =
  /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|emoji|math|fangsong|ui-[a-z-]+|inherit|initial|unset)$/i;
const OPGAVE =
  /^(.*?(?:\d*\.)?\d+(?:px|pt|pc|em|rem|ex|ch|%|vw|vh|in|cm|mm|q)(?:\s*\/\s*\S+)?\s+)(.+)$/i;

/** De opgave met elke niet-generieke familie tussen aanhalingstekens, of null als er niets te doen is. */
export function citeerFamilies(font: string): string | null {
  const m = OPGAVE.exec(font.trim());
  if (!m) return null;
  const families = m[2]
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  const geciteerd = families.map((f) =>
    /^["']/.test(f) || GENERIEK.test(f)
      ? f
      : `"${f.replace(/["\\]/g, "\\$&")}"`,
  );
  const uit = `${m[1]}${geciteerd.join(", ")}`;
  return uit === font ? null : uit;
}

let geinstalleerd = false;

/** Relatieve groottes/gewichten kunnen veranderen door CSS van het canvas. */
function vasteOpgave(font: string) {
  const voor = OPGAVE.exec(font.trim())?.[1];
  return (
    !!voor &&
    /\d(?:px|pt|pc|in|cm|mm|q)\s+$/i.test(voor) &&
    !/\b(?:bolder|lighter)\b|\//i.test(voor)
  );
}

type FontGetter = (this: object) => string;
type FontSetter = (this: object, waarde: string) => void;

/** Bewaart alleen bewezen geldige absolute opgaven, met begrensd geheugengebruik. */
export function fontSetterMetCitering(
  get: FontGetter,
  set: FontSetter,
): FontSetter {
  const geldig = new Map<string, { opgave: string; canoniek: string }>();
  const bewaar = (bron: string, opgave: string, canoniek: string) => {
    if (Math.max(bron.length, opgave.length, canoniek.length) > 512) return;
    if (geldig.size >= 256) geldig.clear();
    geldig.set(bron, { opgave, canoniek });
  };
  return function (waarde) {
    if (typeof waarde !== "string") {
      set.call(this, waarde);
      return;
    }
    // Altijd de echte toestand lezen: save/restore, reset en canvas.width
    // kunnen de font wijzigen zonder deze setter aan te roepen.
    const voor = get.call(this);
    const bekend = geldig.get(waarde);
    if (bekend) {
      if (bekend.canoniek !== voor) set.call(this, bekend.opgave);
      return;
    }
    const vast = vasteOpgave(waarde);
    if (vast && waarde === voor) {
      bewaar(waarde, waarde, voor);
      return;
    }
    set.call(this, waarde);
    let na = get.call(this);
    if (na !== voor) {
      if (vast) bewaar(waarde, waarde, na);
      return;
    }
    const geciteerd = citeerFamilies(waarde);
    if (!geciteerd) return;
    set.call(this, geciteerd);
    na = get.call(this);
    if (vast && na !== voor) bewaar(waarde, geciteerd, na);
  };
}

export function installeerFontCitering() {
  if (geinstalleerd || typeof window === "undefined") return;
  geinstalleerd = true;
  const prototypes = [
    globalThis.CanvasRenderingContext2D?.prototype,
    (
      globalThis as {
        OffscreenCanvasRenderingContext2D?: { prototype: object };
      }
    ).OffscreenCanvasRenderingContext2D?.prototype,
  ].filter(Boolean) as object[];
  for (const proto of prototypes) {
    const d = Object.getOwnPropertyDescriptor(proto, "font");
    if (!d?.get || !d.set) continue;
    const { get, set } = d;
    Object.defineProperty(proto, "font", {
      ...d,
      set: fontSetterMetCitering(get, set),
    });
  }
}
