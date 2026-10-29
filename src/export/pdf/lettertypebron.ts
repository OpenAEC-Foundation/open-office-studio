/**
 * Lettertypebestanden voor de vector-PDF (#18), uit dezelfde bronnen als de
 * editors: systeemlettertypen, meegeleverde lettertypen (onder hun eigen naam
 * of als metrisch gelijke vervanger, zoals Calibri → Carlito) en de extra
 * lettertypen van de app. Ontbreekt een stijl, dan maakt de PDF hem zelf
 * vet of cursief, zoals de browser doet.
 */
import { LettertypeFout, TrueType } from "./truetype";

export interface GeladenLettertype {
  sleutel: string;
  font: TrueType;
  synthetischVet: boolean;
  synthetischCursief: boolean;
}

const GENERIEK: Record<string, string> = {
  "sans-serif": "Liberation Sans",
  "system-ui": "Liberation Sans",
  "ui-sans-serif": "Liberation Sans",
  serif: "Liberation Serif",
  "ui-serif": "Liberation Serif",
  monospace: "Liberation Mono",
  "ui-monospace": "Liberation Mono",
};

async function bytesVoor(familie: string, vet: boolean, cursief: boolean): Promise<{ bytes: ArrayBuffer; vet: boolean; cursief: boolean } | null> {
  // De zelfstandige Database Studio bevat geen kantoorlettertypen; de PDF valt daar terug op beeld + tekstlaag.
  if (import.meta.env.VITE_DATABASE_APP === "1") return null;
  const fonts = await import("@betteroffice/fonts");
  const { extraFace, isExtraFamilie, laadExtraBytes, lettertypeBasis } = await import("../../lettertypen/catalogus");
  const { opSysteem, systeemLettertypeBytes } = await import("../../lettertypen/systeem");
  const gebundeld = (f: string) =>
    fonts.BUNDLED_FONTS.some((b) => b.family.toLowerCase() === f.toLowerCase()) || isExtraFamilie(f);
  const pogingen: [boolean, boolean][] = [
    [vet, cursief],
    [vet, false],
    [false, cursief],
    [false, false],
  ];
  const probeer = async (naam: string) => {
    if (opSysteem(naam) && !gebundeld(naam)) {
      const b = await systeemLettertypeBytes(naam, vet, cursief).catch(() => null);
      // Het systeem kiest zelf de dichtstbijzijnde stijl; die nemen we zoals hij is.
      if (b) return { bytes: b, vet, cursief };
    }
    for (const [v, c] of pogingen) {
      const extra = extraFace(naam, v, c);
      if (extra) return { bytes: await laadExtraBytes(extra), vet: v, cursief: c };
      const face = fonts.resolveBundledFamilyFace(naam, v, c);
      if (face && (face.weight === 700) === v && (face.style === "italic") === c)
        return { bytes: await fonts.loadBundledFontBytes(face, { baseUrl: lettertypeBasis() }), vet: v, cursief: c };
    }
    return null;
  };
  const naam = GENERIEK[familie.toLowerCase()] ?? familie;
  const direct = await probeer(naam).catch(() => null);
  if (direct) return direct;
  const vervanger = fonts.resolveMetricCompatFamily(naam);
  return vervanger ? probeer(vervanger).catch(() => null) : null;
}

const cache = new Map<string, Promise<GeladenLettertype | null>>();

/** Een lettertype voor familie/stijl, of null als het niet als TrueType beschikbaar is. */
export function laadLettertype(familie: string, vet: boolean, cursief: boolean): Promise<GeladenLettertype | null> {
  const sleutel = `${familie.toLowerCase()}|${vet ? 1 : 0}|${cursief ? 1 : 0}`;
  let gevonden = cache.get(sleutel);
  if (!gevonden) {
    gevonden = (async () => {
      const r = await bytesVoor(familie, vet, cursief);
      if (!r) return null;
      try {
        const font = new TrueType(new Uint8Array(r.bytes));
        return { sleutel, font, synthetischVet: vet && !r.vet && font.gewicht < 600, synthetischCursief: cursief && !r.cursief && !font.cursiefHoek };
      } catch (e) {
        if (e instanceof LettertypeFout) return null;
        throw e;
      }
    })().catch(() => null);
    cache.set(sleutel, gevonden);
  }
  return gevonden;
}

export interface FontOpgave {
  families: string[];
  vet: boolean;
  cursief: boolean;
  /** Grootte in pixels. */
  grootte: number;
}

/** Ontleedt een CSS-fontopgave zoals canvas hem teruggeeft ("italic 700 14.5px \"Source Serif 4\", serif"). */
export function ontleedFont(font: string): FontOpgave | null {
  const tekst = font.trim();
  const maat = /(?:^|\s)(\d*\.?\d+)(px|pt)(?:\s*\/\s*\S+)?\s+/.exec(tekst);
  if (!maat) return null;
  const voor = tekst.slice(0, maat.index).toLowerCase().split(/\s+/).filter(Boolean);
  let grootte = Number(maat[1]);
  if (maat[2] === "pt") grootte = (grootte * 96) / 72;
  let vet = false;
  let cursief = false;
  for (const w of voor) {
    if (w === "bold" || w === "bolder") vet = true;
    else if (/^\d+$/.test(w)) vet = Number(w) >= 600;
    else if (w === "italic" || w === "oblique") cursief = true;
  }
  const families = tekst
    .slice(maat.index + maat[0].length)
    .split(",")
    .map((f) => f.trim().replace(/^["']|["']$/g, "").replace(/\\(.)/g, "$1"))
    .filter(Boolean);
  return families.length ? { families, vet, cursief, grootte } : null;
}
