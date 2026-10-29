/** Randen en arcering: formulier ↔ model (`w:pBdr`, `w:shd`, `w:pgBorders`). */
import { achtstenNaarPt, ptNaarAchtsten } from "../eenheden.ts";
import type { Arcering, Rand, RandZijde, Randen } from "../opmaak.ts";

/** Randstijlen met hun i18n-sleutel (namespace writer); vertalen bij het tonen. */
export const randStijlen = [
  ["single", "borders.lineStyle.single"],
  ["double", "borders.lineStyle.double"],
  ["dotted", "borders.lineStyle.dotted"],
  ["dashed", "borders.lineStyle.dashed"],
  ["dotDash", "borders.lineStyle.dotDash"],
  ["thick", "borders.lineStyle.thick"],
  ["triple", "borders.lineStyle.triple"],
  ["thinThickSmallGap", "borders.lineStyle.thinThick"],
  ["thickThinSmallGap", "borders.lineStyle.thickThin"],
  ["wave", "borders.lineStyle.wave"],
  ["doubleWave", "borders.lineStyle.doubleWave"],
  ["threeDEmboss", "borders.lineStyle.emboss3d"],
  ["threeDEngrave", "borders.lineStyle.engrave3d"],
  ["outset", "borders.lineStyle.outset"],
  ["inset", "borders.lineStyle.inset"],
] as const;
export type RandStijl = (typeof randStijlen)[number][0];

export const randDiktes = [0.25, 0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6] as const;

/** I18n-sleutels (namespace writer) van de zijden. */
export const zijdeNamen: Record<RandZijde, string> = {
  top: "borders.side.top",
  bottom: "borders.side.bottom",
  left: "borders.side.left",
  right: "borders.side.right",
  between: "borders.side.between",
};

export type Instelling = "geen" | "kader" | "schaduw" | "aangepast";

export interface RandFormulier {
  instelling: Instelling;
  zijden: Record<RandZijde, boolean>;
  stijl: RandStijl;
  kleur: string | null;
  /** Punten. */
  dikte: number;
  /** Afstand tot de tekst in punten. */
  afstand: number;
}

const GEEN_ZIJDEN: Record<RandZijde, boolean> = { top: false, bottom: false, left: false, right: false, between: false };
const KADER: Record<RandZijde, boolean> = { top: true, bottom: true, left: true, right: true, between: false };

const isRand = (r: unknown): r is Rand =>
  !!r && typeof r === "object" && typeof (r as Rand).style === "string" && !["none", "nil"].includes((r as Rand).style);

function kleurVan(r: Rand | undefined) {
  const c = r?.color as { rgb?: string } | undefined;
  return c && typeof c.rgb === "string" && /^[0-9a-f]{6}$/i.test(c.rgb) ? c.rgb.toUpperCase() : null;
}

/** Formulier uit de randen van een alinea of pagina. */
export function randFormulierUit(randen: Partial<Record<string, unknown>> | null | undefined, standaardAfstand = 1): RandFormulier {
  const zijden = { ...GEEN_ZIJDEN };
  let voorbeeld: (Rand & { shadow?: boolean }) | undefined;
  for (const zijde of Object.keys(zijden) as RandZijde[]) {
    const r = randen?.[zijde];
    if (isRand(r)) {
      zijden[zijde] = true;
      voorbeeld ??= r;
    }
  }
  const alle = zijden.top && zijden.bottom && zijden.left && zijden.right;
  const stijl = (randStijlen.some(([w]) => w === voorbeeld?.style) ? voorbeeld?.style : "single") as RandStijl;
  return {
    instelling: !voorbeeld ? "geen" : alle && !zijden.between ? (voorbeeld.shadow ? "schaduw" : "kader") : "aangepast",
    zijden,
    stijl,
    kleur: kleurVan(voorbeeld),
    dikte: voorbeeld?.size ? achtstenNaarPt(voorbeeld.size) : 0.5,
    afstand: voorbeeld?.space ?? standaardAfstand,
  };
}

/** Kiest een instelling en past de zijden daarop aan. */
export function metInstelling(f: RandFormulier, instelling: Instelling): RandFormulier {
  if (instelling === "geen") return { ...f, instelling, zijden: { ...GEEN_ZIJDEN } };
  if (instelling === "kader" || instelling === "schaduw") return { ...f, instelling, zijden: { ...KADER } };
  return { ...f, instelling };
}

/** Wisselt één zijde; de instelling wordt dan "aangepast" (of "geen"). */
export function metZijde(f: RandFormulier, zijde: RandZijde): RandFormulier {
  const zijden = { ...f.zijden, [zijde]: !f.zijden[zijde] };
  const iets = Object.values(zijden).some(Boolean);
  return { ...f, zijden, instelling: iets ? "aangepast" : "geen" };
}

/** Eén zijde in modelvorm (`BorderSpec`). */
export function randSpec(f: RandFormulier): Rand & { shadow?: boolean } {
  return {
    style: f.stijl,
    size: ptNaarAchtsten(f.dikte),
    space: Math.max(0, Math.min(31, Math.round(f.afstand))),
    color: f.kleur ? { rgb: f.kleur } : { auto: true },
    ...(f.instelling === "schaduw" ? { shadow: true } : {}),
  };
}

/** De randen in modelvorm, of `null` als er geen enkele zijde aan staat. */
export function randenNaarModel(f: RandFormulier, zijden: readonly RandZijde[] = ["top", "bottom", "left", "right", "between"]): Randen | null {
  const uit: Randen = {};
  for (const zijde of zijden) if (f.zijden[zijde]) uit[zijde] = randSpec(f);
  return Object.keys(uit).length ? uit : null;
}

// --- Arcering ---------------------------------------------------------------

/** Arceringspatronen met hun i18n-sleutel (namespace writer). */
export const patroonNamen = [
  ["clear", "borders.pattern.clear"],
  ["pct5", "borders.pattern.pct5"],
  ["pct10", "borders.pattern.pct10"],
  ["pct20", "borders.pattern.pct20"],
  ["pct25", "borders.pattern.pct25"],
  ["pct50", "borders.pattern.pct50"],
  ["pct75", "borders.pattern.pct75"],
  ["horzStripe", "borders.pattern.horizontalStripes"],
  ["vertStripe", "borders.pattern.verticalStripes"],
  ["diagStripe", "borders.pattern.diagonalStripes"],
  ["horzCross", "borders.pattern.grid"],
  ["diagCross", "borders.pattern.diagonalGrid"],
] as const;
export type Patroon = (typeof patroonNamen)[number][0];

export interface ArceringFormulier {
  opvulling: string | null;
  patroon: Patroon;
  patroonKleur: string | null;
}

export function arceringUit(s: Arcering | null | undefined): ArceringFormulier {
  const rgb = (c: unknown) => {
    const w = (c as { rgb?: string } | undefined)?.rgb;
    return typeof w === "string" && /^[0-9a-f]{6}$/i.test(w) ? w.toUpperCase() : null;
  };
  return {
    opvulling: rgb(s?.fill),
    patroon: (patroonNamen.some(([w]) => w === s?.pattern) ? s?.pattern : "clear") as Patroon,
    patroonKleur: rgb(s?.color),
  };
}

export function arceringNaarModel(f: ArceringFormulier): Arcering | null {
  if (!f.opvulling && f.patroon === "clear") return null;
  return {
    pattern: f.patroon,
    ...(f.opvulling ? { fill: { rgb: f.opvulling } } : {}),
    ...(f.patroon !== "clear" ? { color: { rgb: f.patroonKleur ?? "000000" } } : {}),
  };
}

/** CSS-rand voor het voorbeeld. */
export function cssRand(f: RandFormulier) {
  const stijl =
    f.stijl === "double" || f.stijl === "triple" || f.stijl.includes("Gap")
      ? "double"
      : f.stijl === "dotted"
        ? "dotted"
        : f.stijl === "dashed" || f.stijl === "dotDash"
          ? "dashed"
          : f.stijl === "threeDEmboss" || f.stijl === "outset"
            ? "outset"
            : f.stijl === "threeDEngrave" || f.stijl === "inset"
              ? "inset"
              : "solid";
  const breedte = Math.max(1, Math.round((f.stijl === "double" || f.stijl.includes("Gap") ? Math.max(3, f.dikte * 3) : f.dikte) * 1.33));
  return `${breedte}px ${stijl} #${f.kleur ?? "000000"}`;
}
