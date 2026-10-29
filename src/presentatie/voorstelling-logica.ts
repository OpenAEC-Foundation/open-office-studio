/**
 * Bediening van de diavoorstelling (#79), los van React en vensters:
 * navigeren (ook langs verborgen dia's), naar een nummer springen, zwart of
 * wit scherm, aanwijzers en de timer.
 */

export type Scherm = "normaal" | "zwart" | "wit";
export type Gereedschap = "aanwijzer" | "pen" | "markeerstift" | "laser" | "gum";

export interface VoorstellingStaat {
  /** 0-gebaseerde huidige dia. */
  index: number;
  aantal: number;
  scherm: Scherm;
  /** Getypt dianummer (springen met Enter). */
  invoer: string;
  /** Na de laatste dia: zwart eindscherm, de volgende stap sluit af. */
  einde: boolean;
  gereedschap: Gereedschap;
}

export type Actie =
  | { soort: "sluit" }
  | { soort: "wisInkt" }
  | { soort: "wisselPresentator" }
  | { soort: "wisselSchermen" };

export function beginStaat(index: number, aantal: number): VoorstellingStaat {
  return {
    index: Math.max(0, Math.min(aantal - 1, index)),
    aantal,
    scherm: "normaal",
    invoer: "",
    einde: false,
    gereedschap: "aanwijzer",
  };
}

/** Eerste zichtbare dia vanaf `vanaf` in `richting`, of null. */
export function zichtbareDia(
  vanaf: number,
  richting: 1 | -1,
  aantal: number,
  verborgen: ReadonlySet<number>,
): number | null {
  for (let i = vanaf; i >= 0 && i < aantal; i += richting) if (!verborgen.has(i)) return i;
  return null;
}

/** Beginpunt: vanaf het begin de eerste zichtbare dia; vanaf de huidige dia die zelf (ook als hij verborgen is). */
export function startDia(vanafBegin: boolean, huidig: number, aantal: number, verborgen: ReadonlySet<number>) {
  if (!vanafBegin) return Math.max(0, Math.min(aantal - 1, huidig));
  return zichtbareDia(0, 1, aantal, verborgen) ?? 0;
}

export function volgende(s: VoorstellingStaat, verborgen: ReadonlySet<number>): [VoorstellingStaat, Actie?] {
  if (s.scherm !== "normaal") return [{ ...s, scherm: "normaal", invoer: "" }];
  if (s.einde) return [s, { soort: "sluit" }];
  const doel = zichtbareDia(s.index + 1, 1, s.aantal, verborgen);
  if (doel === null) return [{ ...s, einde: true, invoer: "" }];
  return [{ ...s, index: doel, invoer: "" }];
}

export function vorige(s: VoorstellingStaat, verborgen: ReadonlySet<number>): VoorstellingStaat {
  if (s.scherm !== "normaal") return { ...s, scherm: "normaal", invoer: "" };
  if (s.einde) return { ...s, einde: false, invoer: "" };
  const doel = zichtbareDia(s.index - 1, -1, s.aantal, verborgen);
  return doel === null ? { ...s, invoer: "" } : { ...s, index: doel, invoer: "" };
}

/** Naar dia `nummer` (1-gebaseerd), ook een verborgen dia, zoals PowerPoint bij nummer + Enter. */
export function naarDia(s: VoorstellingStaat, nummer: number): VoorstellingStaat {
  if (!Number.isFinite(nummer) || nummer < 1) return { ...s, invoer: "" };
  return { ...s, index: Math.min(s.aantal, Math.floor(nummer)) - 1, einde: false, scherm: "normaal", invoer: "" };
}

export interface Toets {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

/**
 * Een toets tijdens de voorstelling. Geeft de nieuwe staat, een eventuele
 * actie, en of de toets is gebruikt (dan geen standaardgedrag).
 */
export function verwerkToets(
  s: VoorstellingStaat,
  t: Toets,
  verborgen: ReadonlySet<number>,
): { staat: VoorstellingStaat; actie?: Actie; gebruikt: boolean } {
  const k = t.key;
  if (t.alt && !t.ctrl) return { staat: s, gebruikt: false };
  if (t.ctrl) {
    // Ctrl+P/L/A/I zoals PowerPoint tijdens de voorstelling; Ctrl+E wist alles.
    const ctrlKaart: Record<string, Gereedschap> = { p: "pen", l: "laser", a: "aanwijzer", i: "markeerstift", e: "gum" };
    const g = ctrlKaart[k.toLowerCase()];
    if (g) return { staat: { ...s, gereedschap: s.gereedschap === g ? "aanwijzer" : g }, gebruikt: true };
    return { staat: s, gebruikt: false };
  }
  if (/^[0-9]$/.test(k)) return { staat: { ...s, invoer: (s.invoer + k).slice(-4) }, gebruikt: true };
  switch (k) {
    case "Enter":
      if (s.invoer) return { staat: naarDia(s, Number(s.invoer)), gebruikt: true };
    // valt door: Enter zonder nummer is volgende
    case " ":
    case "ArrowRight":
    case "ArrowDown":
    case "PageDown":
    case "n":
    case "N": {
      const [staat, actie] = volgende(s, verborgen);
      return { staat, actie, gebruikt: true };
    }
    case "ArrowLeft":
    case "ArrowUp":
    case "PageUp":
    case "Backspace":
      if (k === "Backspace" && s.invoer) return { staat: { ...s, invoer: s.invoer.slice(0, -1) }, gebruikt: true };
      return { staat: vorige(s, verborgen), gebruikt: true };
    case "Home":
      return { staat: { ...s, index: zichtbareDia(0, 1, s.aantal, verborgen) ?? 0, einde: false, scherm: "normaal", invoer: "" }, gebruikt: true };
    case "End":
      return {
        staat: { ...s, index: zichtbareDia(s.aantal - 1, -1, s.aantal, verborgen) ?? s.aantal - 1, einde: false, scherm: "normaal", invoer: "" },
        gebruikt: true,
      };
    case "b":
    case "B":
    case ".":
      return { staat: { ...s, scherm: s.scherm === "zwart" ? "normaal" : "zwart", invoer: "" }, gebruikt: true };
    case "w":
    case "W":
    case ",":
      return { staat: { ...s, scherm: s.scherm === "wit" ? "normaal" : "wit", invoer: "" }, gebruikt: true };
    case "p":
    case "P":
      return { staat: { ...s, gereedschap: s.gereedschap === "pen" ? "aanwijzer" : "pen" }, gebruikt: true };
    case "h":
    case "H":
      return { staat: { ...s, gereedschap: s.gereedschap === "markeerstift" ? "aanwijzer" : "markeerstift" }, gebruikt: true };
    case "l":
    case "L":
      return { staat: { ...s, gereedschap: s.gereedschap === "laser" ? "aanwijzer" : "laser" }, gebruikt: true };
    case "a":
    case "A":
      return { staat: { ...s, gereedschap: "aanwijzer" }, gebruikt: true };
    case "e":
    case "E":
      return { staat: s, actie: { soort: "wisInkt" }, gebruikt: true };
    case "Escape":
      if (s.invoer) return { staat: { ...s, invoer: "" }, gebruikt: true };
      if (s.gereedschap !== "aanwijzer") return { staat: { ...s, gereedschap: "aanwijzer" }, gebruikt: true };
      return { staat: s, actie: { soort: "sluit" }, gebruikt: true };
    default:
      return { staat: s, gebruikt: false };
  }
}

/** Verstreken tijd als 0:05:09 (of 5:09 onder het uur). */
export function duurTekst(ms: number) {
  const totaal = Math.max(0, Math.floor(ms / 1000));
  const u = Math.floor(totaal / 3600);
  const m = Math.floor((totaal % 3600) / 60);
  const s = totaal % 60;
  const twee = (n: number) => String(n).padStart(2, "0");
  return u ? `${u}:${twee(m)}:${twee(s)}` : `${m}:${twee(s)}`;
}

/** Timer met pauze: telt alleen de tijd dat hij loopt. */
export interface Timer {
  /** Opgebouwde tijd tot de laatste pauze. */
  opgebouwd: number;
  /** Starttijd van de lopende periode, of null in pauze. */
  sinds: number | null;
}
export const nieuweTimer = (nu: number): Timer => ({ opgebouwd: 0, sinds: nu });
export const verstreken = (t: Timer, nu: number) => t.opgebouwd + (t.sinds === null ? 0 : nu - t.sinds);
export const pauzeer = (t: Timer, nu: number): Timer =>
  t.sinds === null ? t : { opgebouwd: t.opgebouwd + (nu - t.sinds), sinds: null };
export const hervat = (t: Timer, nu: number): Timer => (t.sinds === null ? { ...t, sinds: nu } : t);

/** Inkt op een dia: lijnen in dia-coördinaten van 0 tot 1. */
export interface Streep {
  soort: "pen" | "markeerstift";
  punten: number[];
}

/** Of punt (x, y) een streep raakt (gum), met marge in dia-eenheden. */
export function raaktStreep(streep: Streep, x: number, y: number, marge = 0.012) {
  const p = streep.punten;
  for (let i = 0; i + 1 < p.length; i += 2) {
    const ax = p[i], ay = p[i + 1];
    const bx = p[i + 2] ?? ax, by = p[i + 3] ?? ay;
    const dx = bx - ax, dy = by - ay;
    const l = dx * dx + dy * dy;
    const t = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l)) : 0;
    if (Math.hypot(ax + t * dx - x, ay + t * dy - y) <= marge) return true;
  }
  return false;
}
