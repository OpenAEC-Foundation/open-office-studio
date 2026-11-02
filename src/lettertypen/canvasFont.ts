/**
 * Familienamen met een los getal ("Source Serif 4", "Source Sans 3") zijn in
 * de CSS-fontopgave alleen geldig tussen aanhalingstekens. De tekst- en
 * rekenbladengine zetten `ctx.font` zonder aanhalingstekens; de browser
 * negeert zo'n opgave dan stil en tekent in het vorige lettertype (vaak
 * 10px sans-serif), met de tekens op de breedtes van het juiste lettertype.
 *
 * Herstel zulke namen vóór de native instelling. Een herhaalde geldige
 * opgave mag geen tweede instelling uitlokken: canvas kan voor dezelfde
 * opgave dezelfde waarde teruggeven zonder dat de browser haar weigert.
 */

const GENERIEK = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|emoji|math|fangsong|ui-[a-z-]+|inherit|initial|unset)$/i;
const OPGAVE = /^(.*?(?:\d*\.)?\d+(?:px|pt|pc|em|rem|ex|ch|%|vw|vh|in|cm|mm|q)(?:\s*\/\s*\S+)?\s+)(.+)$/i;

/** Een komma binnen een aangehaalde of ontsnapte familienaam is geen scheiding. */
function splitsFamilies(tekst: string): string[] {
  const uit: string[] = [];
  let begin = 0, citaat = "", ontsnapt = false;
  for (let i = 0; i < tekst.length; i++) {
    const c = tekst[i];
    if (ontsnapt) { ontsnapt = false; continue; }
    if (c === "\\") { ontsnapt = true; continue; }
    if (citaat) { if (c === citaat) citaat = ""; continue; }
    if (c === '"' || c === "'") citaat = c;
    else if (c === ",") { uit.push(tekst.slice(begin, i).trim()); begin = i + 1; }
  }
  uit.push(tekst.slice(begin).trim());
  return uit.filter(Boolean);
}

const citeer = (f: string) => `"${f.replace(/["\\]/g, "\\$&")}"`;

/** De opgave met elke niet-generieke familie tussen aanhalingstekens, of null als er niets te doen is. */
export function citeerFamilies(font: string): string | null {
  const m = OPGAVE.exec(font.trim());
  if (!m) return null;
  const families = splitsFamilies(m[2]);
  const geciteerd = families.map((f) =>
    /^["']/.test(f) || GENERIEK.test(f) ? f : citeer(f),
  );
  const uit = `${m[1]}${geciteerd.join(", ")}`;
  return uit === font ? null : uit;
}

/** Alleen losstaande getallen herstellen; geldige families blijven exact gelijk. */
function herstelFont(font: string): string {
  const m = OPGAVE.exec(font.trim());
  if (!m) return font;
  let anders = false;
  const families = splitsFamilies(m[2]).map((f) => {
    if (/^["']/.test(f) || !/(?:^|\s)[+-]?(?:\d|\.\d)/.test(f)) return f;
    anders = true;
    return citeer(f);
  });
  return anders ? `${m[1]}${families.join(", ")}` : font;
}

let geinstalleerd = false;

export function installeerFontCitering() {
  if (geinstalleerd || typeof window === "undefined") return;
  geinstalleerd = true;
  const prototypes = [
    globalThis.CanvasRenderingContext2D?.prototype,
    (globalThis as { OffscreenCanvasRenderingContext2D?: { prototype: object } }).OffscreenCanvasRenderingContext2D?.prototype,
  ].filter(Boolean) as object[];
  const opgaven = new Map<string, string>();
  for (const proto of prototypes) {
    const d = Object.getOwnPropertyDescriptor(proto, "font");
    if (!d?.get || !d.set) continue;
    const { set } = d;
    Object.defineProperty(proto, "font", {
      ...d,
      set(this: CanvasRenderingContext2D, waarde: string) {
        if (typeof waarde !== "string") { set.call(this, waarde); return; }
        let opgave = opgaven.get(waarde);
        if (opgave === undefined) {
          opgave = herstelFont(waarde);
          if (opgaven.size >= 256) opgaven.delete(opgaven.keys().next().value!);
          opgaven.set(waarde, opgave);
        }
        set.call(this, opgave);
      },
    });
  }
}
