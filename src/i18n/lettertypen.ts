/**
 * Lettertypen voor de interface in andere schriften. Inter dekt Latijn,
 * Grieks en Cyrillisch. Voor Arabisch, Hebreeuws en CJK gebruiken we de Noto-
 * bestanden die de app al meelevert (public/fonts, uit @betteroffice/fonts en
 * fonts-cjk; niet in Git). Dankzij `unicode-range` laadt de browser een
 * bestand pas als zo'n teken echt op het scherm staat. Thai en Devanagari
 * komen van het systeem (Windows: Leelawadee UI/Nirmala UI, macOS: Thonburi/
 * Kohinoor, Linux: Noto als geïnstalleerd).
 *
 * Bij CJK hangt de glyfvorm (Han-unificatie) af van de taal: Japans, Koreaans,
 * traditioneel en vereenvoudigd Chinees krijgen elk hun eigen Noto-variant voorop.
 */
import type { Taal } from "./talen";

/** Zelfde map als lettertypeBasis() in src/lettertypen/catalogus.ts, zonder die zware module. */
function lettertypeBasis(): string {
  const basis = import.meta.env?.BASE_URL ?? "/";
  const pagina = typeof location === "undefined" ? "http://localhost/" : location.href;
  return new URL(`${basis.replace(/\/?$/, "/")}fonts/`, pagina).href;
}

const CJK =
  "U+1100-11FF, U+2E80-2FDF, U+3000-30FF, U+3100-31FF, U+3200-32FF, U+3400-4DBF, U+4E00-9FFF, U+A960-A97F, U+AC00-D7AF, U+F900-FAFF, U+FE30-FE4F, U+FF00-FFEF, U+20000-2FA1F";
const ARABISCH = "U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF";
const HEBREEUWS = "U+0590-05FF, U+FB1D-FB4F";

const VLAKKEN: { familie: string; bestand: string; bereik: string; gewicht?: string }[] = [
  { familie: "OA UI Arabic", bestand: "NotoSansArabic-Regular.ttf", bereik: ARABISCH, gewicht: "400" },
  { familie: "OA UI Arabic", bestand: "NotoSansArabic-Bold.ttf", bereik: ARABISCH, gewicht: "600 700" },
  { familie: "OA UI Hebrew", bestand: "NotoSansHebrew-Regular.ttf", bereik: HEBREEUWS, gewicht: "400" },
  { familie: "OA UI Hebrew", bestand: "NotoSansHebrew-Bold.ttf", bereik: HEBREEUWS, gewicht: "600 700" },
  { familie: "OA UI SC", bestand: "NotoSansSC-Regular.otf", bereik: CJK },
  { familie: "OA UI TC", bestand: "NotoSansTC-Regular.otf", bereik: CJK },
  { familie: "OA UI JP", bestand: "NotoSansJP-Regular.otf", bereik: CJK },
  { familie: "OA UI KR", bestand: "NotoSansKR-Regular.otf", bereik: CJK },
];

type Variant = "SC" | "TC" | "JP" | "KR";
/** Gangbare systeemlettertypen per CJK-variant; die gaan vóór onze eigen Noto (geen download). */
const SYSTEEM_CJK: Record<Variant, string[]> = {
  SC: ["PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC"],
  TC: ["PingFang TC", "Microsoft JhengHei UI", "Microsoft JhengHei", "Noto Sans CJK TC", "Source Han Sans TC"],
  JP: ["Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", "Meiryo", "Noto Sans CJK JP"],
  KR: ["Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR", "Source Han Sans KR"],
};
/** Thai en Devanagari: alleen systeemlettertypen. */
const SYSTEEM_OVERIG = ["Leelawadee UI", "Thonburi", "Noto Sans Thai", "Nirmala UI", "Kohinoor Devanagari", "Noto Sans Devanagari"];

/** Volgorde van de CJK-varianten per taal; de eerste wint bij gedeelde tekens. */
export function cjkVolgorde(taal: Taal): Variant[] {
  const voorkeur: Partial<Record<Taal, Variant>> = { ja: "JP", ko: "KR", "zh-TW": "TC", "zh-CN": "SC" };
  const alle: Variant[] = ["SC", "TC", "JP", "KR"];
  const eerst = voorkeur[taal];
  return eerst ? [eerst, ...alle.filter((f) => f !== eerst)] : alle;
}

/** Lettertypestapel voor de interface bij een taal, met `eerste` (Inter of Space Grotesk) voorop. */
export function uiLettertypen(taal: Taal, eerste = "Inter") {
  const cjk = cjkVolgorde(taal).flatMap((v) => [...SYSTEEM_CJK[v], `OA UI ${v}`]);
  const families = [eerste, "OA UI Arabic", "OA UI Hebrew", ...cjk, ...SYSTEEM_OVERIG];
  const systeem = 'system-ui, -apple-system, "Segoe UI", "Noto Sans", sans-serif';
  return [...families.map((f) => `"${f}"`), systeem].join(", ");
}

let stijl: HTMLStyleElement | null = null;

/** Zet de @font-face-regels en de lettertypestapel voor de gekozen taal. */
export function zetUiLettertypen(taal: Taal) {
  if (typeof document === "undefined") return;
  const basis = lettertypeBasis();
  const vlakken = VLAKKEN.map(
    (v) =>
      `@font-face{font-family:"${v.familie}";src:url("${basis}${v.bestand}");font-display:swap;` +
      `font-weight:${v.gewicht ?? "100 900"};unicode-range:${v.bereik};}`,
  ).join("\n");
  const css =
    `${vlakken}\n:root:root{--oa-font-family-body:${uiLettertypen(taal)};` +
    `--oa-font-family-heading:${uiLettertypen(taal, "Space Grotesk")};}`;
  if (!stijl) {
    stijl = document.createElement("style");
    stijl.id = "oa-ui-lettertypen";
    document.head.appendChild(stijl);
  }
  if (stijl.textContent !== css) stijl.textContent = css;
}
