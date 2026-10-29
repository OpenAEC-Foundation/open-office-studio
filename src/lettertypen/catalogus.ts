/**
 * Alle lettertypen die de app zelf meelevert: de set uit @betteroffice/fonts
 * en de extra open families uit assets/lettertypen.json (gedownload door
 * scripts/haal-lettertypen.mjs naar public/fonts/extra/). Per familie de
 * categorie voor de keuzelijst en de licentie voor de vermelding.
 */
import * as fonts from "@betteroffice/fonts";
import i18next from "../i18n/config";
import manifest from "../../assets/lettertypen.json";

export type Categorie =
  | "schreefloos"
  | "schreef"
  | "monospace"
  | "handschrift"
  | "display";

export interface ExtraFace {
  family: string;
  weight: 400 | 700;
  style: "normal" | "italic";
  /** Bestandsnaam in public/fonts/extra/. */
  file: string;
  byteLength: number;
  sha256: string;
}

export interface FamilieInfo {
  familie: string;
  categorie: Categorie;
  /** SPDX-licentie. */
  licentie: string;
  /** Korte herkomst voor de vermelding. */
  bron: string;
  herkomst: "meegeleverd" | "extra";
  /** Het Office-lettertype waarvan dit de tekenbreedtes deelt. */
  metrischVoor?: string;
  stijlen: number;
}

interface ManifestFamilie {
  familie: string;
  categorie: string;
  licentie: string;
  bron: string;
  metrischVoor?: string;
  bestanden: {
    bestand: string;
    gewicht: number;
    stijl: string;
    sha256: string;
    grootte: number;
  }[];
}

const families = (manifest as { families: ManifestFamilie[] }).families;

export const EXTRA_FACES: ExtraFace[] = families.flatMap((f) =>
  f.bestanden.map((b) => ({
    family: f.familie,
    weight: b.gewicht === 700 ? 700 : 400,
    style: b.stijl === "italic" ? "italic" : "normal",
    file: b.bestand,
    byteLength: b.grootte,
    sha256: b.sha256,
  })),
);

/** Categorie en herkomst van de families uit @betteroffice/fonts (allemaal OFL-1.1). */
const MEEGELEVERD: Record<string, Categorie> = {
  Carlito: "schreefloos",
  Caladea: "schreef",
  "Liberation Sans": "schreefloos",
  "Liberation Serif": "schreef",
  "Liberation Mono": "monospace",
  Gelasio: "schreef",
  "Comic Relief": "handschrift",
  "DM Sans": "schreefloos",
  "DM Serif Display": "display",
  Heebo: "schreefloos",
  Inter: "schreefloos",
  Montserrat: "schreefloos",
  "Open Sans": "schreefloos",
  Oswald: "display",
  Poppins: "schreefloos",
  Roboto: "schreefloos",
  "Source Sans 3": "schreefloos",
};

function meegeleverd(): FamilieInfo[] {
  const perFamilie = new Map<string, fonts.BundledFontFace[]>();
  for (const face of fonts.BUNDLED_FONTS) {
    if (face.script) continue;
    perFamilie.set(face.family, [...(perFamilie.get(face.family) ?? []), face]);
  }
  return [...perFamilie].map(([familie, faces]) => ({
    familie,
    categorie: MEEGELEVERD[familie] ?? "schreefloos",
    licentie: "OFL-1.1",
    bron: "@betteroffice/fonts",
    herkomst: "meegeleverd" as const,
    metrischVoor: faces.find((f) => f.metricCompatWith)?.metricCompatWith,
    stijlen: faces.length,
  }));
}

export const CATALOGUS: FamilieInfo[] = [
  ...meegeleverd(),
  ...families
    .filter((f) => !fonts.BUNDLED_FONTS.some((b) => b.family === f.familie))
    .map((f) => ({
      familie: f.familie,
      categorie: f.categorie as Categorie,
      licentie: f.licentie,
      bron: f.bron,
      herkomst: "extra" as const,
      metrischVoor: f.metrischVoor,
      stijlen: f.bestanden.length,
    })),
].sort((a, b) => a.familie.localeCompare(b.familie));

/**
 * Lettertypen die standaard in de keuzelijst staan: per groep alleen families
 * die duidelijk van elkaar verschillen. De rest blijft bruikbaar (zoeken,
 * "Alle lettertypen tonen", documenten die ze noemen, vervanging).
 */
export const KERNSET: ReadonlySet<string> = new Set(
  [
    "Carlito",
    "Liberation Sans",
    "Inter",
    "Montserrat",
    "Nunito",
    "Raleway",
    "Atkinson Hyperlegible",
    "Caladea",
    "Liberation Serif",
    "Merriweather",
    "EB Garamond",
    "Playfair Display",
    "Oswald",
    "Liberation Mono",
    "JetBrains Mono",
    "Comic Neue",
  ].map((n) => n.toLowerCase()),
);

/** Office-namen die in de beperkte lijst blijven staan (met hun vervanger). */
export const KERN_OFFICE: ReadonlySet<string> = new Set(
  ["Calibri", "Cambria", "Arial", "Times New Roman", "Courier New"].map((n) =>
    n.toLowerCase(),
  ),
);

const perNaam = new Map(CATALOGUS.map((f) => [f.familie.toLowerCase(), f]));
export const familieInfo = (familie: string) =>
  perNaam.get(familie.toLowerCase());

/** Is dit een extra familie (public/fonts/extra)? */
export const isExtraFamilie = (familie: string) =>
  EXTRA_FACES.some((f) => f.family.toLowerCase() === familie.toLowerCase());

/** Exacte stijl van een extra familie, of undefined (de browser maakt dan zelf vet/cursief). */
export function extraFace(
  familie: string,
  vet: boolean,
  cursief: boolean,
): ExtraFace | undefined {
  const naam = familie.toLowerCase();
  return EXTRA_FACES.find(
    (f) =>
      f.family.toLowerCase() === naam &&
      f.weight === (vet ? 700 : 400) &&
      f.style === (cursief ? "italic" : "normal"),
  );
}

/** Basis-URL van de lettertypen, relatief aan de app (ook onder een submap, #109). */
export function lettertypeBasis(): string {
  const basis = import.meta.env?.BASE_URL ?? "/";
  const pagina =
    typeof location === "undefined" ? "http://localhost/" : location.href;
  return new URL(`${basis.replace(/\/?$/, "/")}fonts/`, pagina).href;
}

const bytesCache = new Map<string, Promise<ArrayBuffer>>();

/** De bytes van een extra lettertype (één keer opgehaald). */
export function laadExtraBytes(
  face: ExtraFace,
  basis = lettertypeBasis(),
): Promise<ArrayBuffer> {
  const url = new URL(`extra/${face.file}`, basis).href;
  let bestaand = bytesCache.get(url);
  if (!bestaand) {
    bestaand = fetch(url).then((r) => {
      if (!r.ok)
        throw new Error(
          i18next.t("fonts:errors.loadFailed", { font: face.family, status: r.status }),
        );
      return r.arrayBuffer();
    });
    bestaand.catch(() => bytesCache.delete(url));
    bytesCache.set(url, bestaand);
  }
  return bestaand;
}

export const ALLE_STIJLEN = [
  [false, false],
  [true, false],
  [false, true],
  [true, true],
] as const;

const cssGeregistreerd = new Map<string, Promise<boolean>>();

/**
 * Registreert een meegeleverd of extra lettertype als CSS-lettertype (FontFace)
 * onder `cssNaam` (standaard de eigen naam): voor het voorbeeld in de
 * keuzelijst en voor canvas-tekst in het rekenblad. Alleen de stijlen die er
 * echt zijn; vet/cursief ontbrekend → de browser maakt die na.
 */
export function registreerCss(
  familie: string,
  cssNaam = familie,
  stijlen: readonly (readonly [boolean, boolean])[] = ALLE_STIJLEN,
): Promise<boolean> {
  if (typeof FontFace === "undefined" || typeof document === "undefined")
    return Promise.resolve(false);
  const sleutel = `${cssNaam.toLowerCase()}|${familie.toLowerCase()}|${stijlen.map(([v, c]) => `${+v}${+c}`).join("")}`;
  let bestaand = cssGeregistreerd.get(sleutel);
  if (bestaand) return bestaand;
  bestaand = (async () => {
    const resultaten = await Promise.all(
      stijlen.map(async ([vet, cursief]) => {
        const extra = extraFace(familie, vet, cursief);
        if (extra) {
          const face = new FontFace(cssNaam, await laadExtraBytes(extra), {
            weight: String(extra.weight),
            style: extra.style,
          });
          await face.load();
          document.fonts.add(face);
          return true;
        }
        const bundel = fonts.resolveBundledFamilyFace(familie, vet, cursief);
        if (bundel && bundel.family.toLowerCase() === familie.toLowerCase()) {
          await fonts.registerBundledFontFace(bundel, cssNaam, {
            baseUrl: lettertypeBasis(),
          });
          return true;
        }
        return false;
      }),
    );
    return resultaten.some(Boolean);
  })().catch(() => {
    cssGeregistreerd.delete(sleutel);
    return false;
  });
  cssGeregistreerd.set(sleutel, bestaand);
  return bestaand;
}
