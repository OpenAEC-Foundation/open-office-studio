/**
 * DrawingML-grafiek (`c:chartSpace`) schrijven, lezen en gericht bijwerken.
 */
import i18next from "../i18n/config";
import { GrafiekFout } from "./fouten.ts";
import {
  controleerModel,
  getalnotatie,
  kleurVan,
  leesGetal,
  standaardModel,
  type GrafiekModel,
  type GrafiekSoort,
  type LegendaPositie,
  type Reeks,
} from "./model.ts";
import {
  attr,
  elementen,
  kind,
  kinderen,
  leesXml,
  ontsnap,
  pad,
  rid,
  tekstVan,
  vervang,
  voorvoegselVoor,
  zoekAlle,
  type Vervanging,
  type XmlElement,
} from "./xml.ts";

export const NS_C = "http://schemas.openxmlformats.org/drawingml/2006/chart";
export const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
export const NS_R =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

const v = (naam: string, waarde: string | number) => `<c:${naam} val="${ontsnap(String(waarde))}"/>`;
const TEKSTKLEUR = "57534E";
const LIJNKLEUR = "BFBFBF";
const RASTERKLEUR = "E7E5E4";

function rijkeTekst(
  regels: { tekst: string; sz: number; b: boolean; kleur?: string }[],
  bodyPr = "<a:bodyPr/>",
) {
  const p = regels
    .map(
      (r) =>
        `<a:p><a:pPr><a:defRPr sz="${r.sz}" b="${r.b ? 1 : 0}"/></a:pPr><a:r><a:rPr lang="nl-NL" sz="${r.sz}" b="${r.b ? 1 : 0}"><a:solidFill><a:srgbClr val="${r.kleur ?? "36363E"}"/></a:solidFill></a:rPr><a:t>${ontsnap(r.tekst)}</a:t></a:r></a:p>`,
    )
    .join("");
  return `<c:tx><c:rich>${bodyPr}<a:lstStyle/>${p}</c:rich></c:tx>`;
}
function titelXml(titel: string, ondertitel: string) {
  const regels = [];
  if (titel) regels.push({ tekst: titel, sz: 1400, b: true });
  if (ondertitel) regels.push({ tekst: ondertitel, sz: 1100, b: false, kleur: TEKSTKLEUR });
  if (!regels.length) return v("autoTitleDeleted", 1);
  return `<c:title>${rijkeTekst(regels)}<c:overlay val="0"/></c:title>${v("autoTitleDeleted", 0)}`;
}
function asTitel(tekst: string, verticaal: boolean) {
  if (!tekst) return "";
  return `<c:title>${rijkeTekst(
    [{ tekst, sz: 1000, b: false, kleur: TEKSTKLEUR }],
    verticaal ? '<a:bodyPr rot="-5400000" vert="horz"/>' : "<a:bodyPr/>",
  )}<c:overlay val="0"/></c:title>`;
}
const tekstOpmaak = (sz = 900) =>
  `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}"><a:solidFill><a:srgbClr val="${TEKSTKLEUR}"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="nl-NL"/></a:p></c:txPr>`;
const lijn = (kleur: string, w = 9525) =>
  `<a:ln w="${w}"><a:solidFill><a:srgbClr val="${kleur}"/></a:solidFill></a:ln>`;
const vulling = (kleur: string) => `<a:solidFill><a:srgbClr val="${kleur}"/></a:solidFill>`;

function strCache(waarden: string[]) {
  return `<c:ptCount val="${waarden.length}"/>${waarden
    .map((w, i) => `<c:pt idx="${i}"><c:v>${ontsnap(w)}</c:v></c:pt>`)
    .join("")}`;
}
function numCache(waarden: (number | null)[], notatie = "General") {
  return `<c:formatCode>${ontsnap(notatie)}</c:formatCode><c:ptCount val="${waarden.length}"/>${waarden
    .map((w, i) =>
      w === null || !Number.isFinite(w) ? "" : `<c:pt idx="${i}"><c:v>${w}</c:v></c:pt>`,
    )
    .join("")}`;
}
const strBron = (waarden: string[], ref?: string) =>
  ref
    ? `<c:strRef><c:f>${ontsnap(ref)}</c:f><c:strCache>${strCache(waarden)}</c:strCache></c:strRef>`
    : `<c:strLit>${strCache(waarden)}</c:strLit>`;
const numBron = (waarden: (number | null)[], ref?: string) =>
  ref
    ? `<c:numRef><c:f>${ontsnap(ref)}</c:f><c:numCache>${numCache(waarden)}</c:numCache></c:numRef>`
    : `<c:numLit>${numCache(waarden)}</c:numLit>`;

function reeksXml(model: GrafiekModel, r: Reeks, i: number, groep: "bar" | "line" | "area" | "pie" | "scatter", markering: boolean) {
  const kleur = kleurVan(model, i);
  const tx = r.naamRef
    ? `<c:tx>${strBron([r.naam], r.naamRef)}</c:tx>`
    : `<c:tx><c:v>${ontsnap(r.naam)}</c:v></c:tx>`;
  let opmaak = "";
  let extra = "";
  if (groep === "bar" || groep === "area")
    opmaak = `<c:spPr>${vulling(kleur)}<a:ln><a:noFill/></a:ln></c:spPr>`;
  if (groep === "bar") extra = v("invertIfNegative", 0);
  if (groep === "line")
    opmaak = `<c:spPr><a:ln w="28575" cap="rnd">${vulling(kleur)}<a:round/></a:ln></c:spPr>`;
  if (groep === "line" || groep === "scatter")
    extra = markering
      ? `<c:marker>${v("symbol", "circle")}${v("size", 6)}<c:spPr>${vulling(kleur)}${lijn("FFFFFF")}</c:spPr></c:marker>`
      : `<c:marker>${v("symbol", "none")}</c:marker>`;
  if (groep === "scatter")
    opmaak = `<c:spPr><a:ln w="19050"><a:noFill/></a:ln></c:spPr>`;
  if (groep === "pie") {
    opmaak = `<c:spPr>${lijn("FFFFFF", 19050)}</c:spPr>`;
    extra = model.categorieen
      .map(
        (_, p) =>
          `<c:dPt>${v("idx", p)}${v("bubble3D", 0)}<c:spPr>${vulling(kleurVan({ ...model, reeksen: [] }, p))}${lijn("FFFFFF", 19050)}</c:spPr></c:dPt>`,
      )
      .join("");
  }
  const kop = `${v("idx", i)}${v("order", i)}${tx}${opmaak}${extra}`;
  if (groep === "scatter") {
    const x = model.categorieen.map((c) => leesGetal(c));
    return `<c:ser>${kop}<c:xVal>${numBron(x, model.categorieenRef)}</c:xVal><c:yVal>${numBron(r.waarden, r.waardenRef)}</c:yVal>${v("smooth", 0)}</c:ser>`;
  }
  const cat = `<c:cat>${strBron(model.categorieen, model.categorieenRef)}</c:cat>`;
  const val = `<c:val>${numBron(r.waarden, r.waardenRef)}</c:val>`;
  return `<c:ser>${kop}${cat}${val}${groep === "line" ? v("smooth", 0) : ""}</c:ser>`;
}

function labelsXml(model: GrafiekModel, procent: boolean) {
  if (!model.gegevenslabels) return "";
  return `<c:dLbls><c:numFmt formatCode="${ontsnap(getalnotatie(model.decimalen, procent))}" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${tekstOpmaak(900)}${v("showLegendKey", 0)}${v("showVal", procent ? 0 : 1)}${v("showCatName", 0)}${v("showSerName", 0)}${v("showPercent", procent ? 1 : 0)}${v("showBubbleSize", 0)}</c:dLbls>`;
}

const AS = { cat: 500100001, val: 500100002, cat2: 500100003, val2: 500100004 };

function asXml(
  model: GrafiekModel,
  soort: "cat" | "val",
  id: number,
  kruis: number,
  positie: "b" | "l" | "r",
  opties: { titel?: string; raster?: boolean; verborgen?: boolean; notatie?: string; kruist?: "autoZero" | "max"; tussen?: "between" | "midCat" },
) {
  const titel = asTitel(opties.titel ?? "", positie !== "b");
  const raster = opties.raster
    ? `<c:majorGridlines><c:spPr>${lijn(RASTERKLEUR)}</c:spPr></c:majorGridlines>`
    : "";
  const gemeen = `${v("axId", id)}<c:scaling>${v("orientation", "minMax")}</c:scaling>${v("delete", opties.verborgen ? 1 : 0)}${v("axPos", positie)}${raster}${titel}<c:numFmt formatCode="${ontsnap(opties.notatie ?? "General")}" sourceLinked="${opties.notatie ? 0 : 1}"/>${v("majorTickMark", soort === "cat" ? "out" : "none")}${v("minorTickMark", "none")}${v("tickLblPos", "nextTo")}<c:spPr><a:noFill/>${soort === "cat" ? lijn(LIJNKLEUR) : "<a:ln><a:noFill/></a:ln>"}</c:spPr>${tekstOpmaak()}${v("crossAx", kruis)}${v("crosses", opties.kruist ?? "autoZero")}`;
  void model;
  if (soort === "cat")
    return `<c:catAx>${gemeen}${v("auto", 1)}${v("lblAlgn", "ctr")}${v("lblOffset", 100)}${v("noMultiLvlLbl", 0)}</c:catAx>`;
  return `<c:valAx>${gemeen}${v("crossBetween", opties.tussen ?? "between")}</c:valAx>`;
}

/** De groepen (`c:barChart` enz.) en assen binnen `c:plotArea`. */
function plotInhoud(model: GrafiekModel) {
  const s = model.soort;
  const notatie = getalnotatie(model.decimalen);
  const reeksen = (groep: "bar" | "line" | "area" | "pie" | "scatter", van = 0, tot = model.reeksen.length, markering = false) =>
    model.reeksen
      .slice(van, tot)
      .map((r, j) => reeksXml(model, r, van + j, groep, markering))
      .join("");
  const assen = (horizontaal = false, tussen: "between" | "midCat" = "between", procent = false) => {
    const valNot = procent ? "0%" : notatie;
    return (
      asXml(model, "cat", AS.cat, AS.val, horizontaal ? "l" : "b", { titel: model.asTitelX }) +
      asXml(model, "val", AS.val, AS.cat, horizontaal ? "b" : "l", {
        titel: model.asTitelY,
        raster: model.rasterlijnen,
        notatie: valNot,
        tussen,
      })
    );
  };
  const ids = (a: number, b: number) => v("axId", a) + v("axId", b);
  switch (s) {
    case "kolom":
    case "kolomGestapeld":
    case "kolom100":
    case "staaf": {
      const groepering = s === "kolomGestapeld" ? "stacked" : s === "kolom100" ? "percentStacked" : "clustered";
      return `<c:barChart>${v("barDir", s === "staaf" ? "bar" : "col")}${v("grouping", groepering)}${v("varyColors", 0)}${reeksen("bar")}${labelsXml(model, false)}${v("gapWidth", 80)}${groepering === "clustered" ? v("overlap", -10) : v("overlap", 100)}${ids(AS.cat, AS.val)}</c:barChart>${assen(s === "staaf", "between", s === "kolom100")}`;
    }
    case "lijn":
    case "lijnMarkering":
      return `<c:lineChart>${v("grouping", "standard")}${v("varyColors", 0)}${reeksen("line", 0, undefined, s === "lijnMarkering")}${labelsXml(model, false)}${v("marker", 1)}${ids(AS.cat, AS.val)}</c:lineChart>${assen()}`;
    case "vlak":
      return `<c:areaChart>${v("grouping", "standard")}${v("varyColors", 0)}${reeksen("area")}${labelsXml(model, false)}${ids(AS.cat, AS.val)}</c:areaChart>${assen(false, "midCat")}`;
    case "taart":
      return `<c:pieChart>${v("varyColors", 1)}${reeksen("pie", 0, 1)}${labelsXml(model, true)}${v("firstSliceAng", 0)}</c:pieChart>`;
    case "ring":
      return `<c:doughnutChart>${v("varyColors", 1)}${reeksen("pie")}${labelsXml(model, true)}${v("firstSliceAng", 0)}${v("holeSize", 55)}</c:doughnutChart>`;
    case "spreiding":
      return (
        `<c:scatterChart>${v("scatterStyle", "lineMarker")}${v("varyColors", 0)}${reeksen("scatter", 0, undefined, true)}${labelsXml(model, false)}${ids(AS.cat, AS.val)}</c:scatterChart>` +
        asXml(model, "val", AS.cat, AS.val, "b", { titel: model.asTitelX, notatie: "General", tussen: "midCat" }) +
        asXml(model, "val", AS.val, AS.cat, "l", { titel: model.asTitelY, raster: model.rasterlijnen, notatie, tussen: "midCat" })
      );
    case "combinatie": {
      const n = model.reeksen.length;
      return (
        `<c:barChart>${v("barDir", "col")}${v("grouping", "clustered")}${v("varyColors", 0)}${reeksen("bar", 0, n - 1)}${labelsXml(model, false)}${v("gapWidth", 80)}${v("overlap", -10)}${ids(AS.cat, AS.val)}</c:barChart>` +
        `<c:lineChart>${v("grouping", "standard")}${v("varyColors", 0)}${reeksen("line", n - 1, n, true)}${labelsXml(model, false)}${v("marker", 1)}${ids(AS.cat2, AS.val2)}</c:lineChart>` +
        assen() +
        asXml(model, "cat", AS.cat2, AS.val2, "b", { verborgen: true }) +
        asXml(model, "val", AS.val2, AS.cat2, "r", { titel: model.asTitelY2, notatie, kruist: "max" })
      );
    }
  }
}

const LEGENDA: Record<Exclude<LegendaPositie, "geen">, string> = {
  rechts: "r",
  onder: "b",
  boven: "t",
  links: "l",
};
function legendaXml(model: GrafiekModel) {
  if (model.legenda === "geen") return "";
  return `<c:legend>${v("legendPos", LEGENDA[model.legenda])}<c:overlay val="0"/>${tekstOpmaak()}</c:legend>`;
}

const PLOT_OPMAAK = `<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>`;

/** Een complete `c:chartSpace` voor een nieuwe grafiek. */
export function grafiekXml(model: GrafiekModel, opties: { externeData?: string } = {}) {
  controleerModel(model);
  const extern = opties.externeData
    ? `<c:externalData r:id="${ontsnap(opties.externeData)}">${v("autoUpdate", 0)}</c:externalData>`
    : "";
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<c:chartSpace xmlns:c="${NS_C}" xmlns:a="${NS_A}" xmlns:r="${NS_R}">` +
    `${v("date1904", 0)}${v("lang", "nl-NL")}${v("roundedCorners", 0)}` +
    `<c:chart>${titelXml(model.titel, model.ondertitel)}<c:plotArea><c:layout/>${plotInhoud(model)}${PLOT_OPMAAK}</c:plotArea>${legendaXml(model)}${v("plotVisOnly", 1)}${v("dispBlanksAs", "gap")}</c:chart>` +
    `<c:spPr>${vulling("FFFFFF")}<a:ln><a:noFill/></a:ln></c:spPr>` +
    `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1000"><a:latin typeface="Calibri"/></a:defRPr></a:pPr><a:endParaRPr lang="nl-NL"/></a:p></c:txPr>` +
    extern +
    `</c:chartSpace>`
  );
}

// ---------------------------------------------------------------------------
// Lezen

export interface GelezenGrafiek {
  model: GrafiekModel;
  /** Onwaar als de grafiek onderdelen gebruikt die we niet veilig kunnen herschrijven. */
  bewerkbaar: boolean;
  reden?: string;
  /** Wat bij bewerken verloren gaat of verandert. */
  waarschuwingen: string[];
  /** Alle soorten in de grafiek, zoals ze in de XML staan (`barChart`, …). */
  groepen: string[];
  /** Relatie-id van `c:externalData`, als die er is. */
  externeData?: string;
}

const ONDERSTEUND = new Set(["barChart", "lineChart", "areaChart", "pieChart", "doughnutChart", "scatterChart"]);

function bronWaarden(el: XmlElement | null): { tekst: string[]; getal: (number | null)[]; ref?: string; meerlaags: boolean } {
  const leeg = { tekst: [], getal: [], meerlaags: false };
  if (!el) return leeg;
  const bron = elementen(el)[0];
  if (!bron) return leeg;
  const ref = tekstVan(kind(bron, "f")) || undefined;
  const cache =
    kind(bron, "strCache") ?? kind(bron, "numCache") ?? kind(bron, "multiLvlStrCache") ??
    (bron.lokaal === "strLit" || bron.lokaal === "numLit" ? bron : null);
  let meerlaags = bron.lokaal === "multiLvlStrRef";
  let punten: XmlElement[] = [];
  let aantal = 0;
  if (cache && cache.lokaal === "multiLvlStrCache") {
    const niveaus = kinderen(cache, "lvl");
    punten = niveaus.length ? kinderen(niveaus[0], "pt") : [];
    aantal = Number(attr(kind(cache, "ptCount"), "val") ?? punten.length);
    meerlaags = true;
  } else if (cache) {
    punten = kinderen(cache, "pt");
    aantal = Number(attr(kind(cache, "ptCount"), "val") ?? punten.length);
  }
  if (!Number.isFinite(aantal) || aantal < 0) aantal = punten.length;
  aantal = Math.min(aantal, 100000);
  const tekst = Array<string>(aantal).fill("");
  const getal = Array<number | null>(aantal).fill(null);
  for (const p of punten) {
    const i = Number(attr(p, "idx"));
    if (!Number.isInteger(i) || i < 0 || i >= aantal) continue;
    const w = tekstVan(kind(p, "v"));
    tekst[i] = w;
    const n = Number(w);
    getal[i] = w.trim() !== "" && Number.isFinite(n) ? n : null;
  }
  return { tekst, getal, ref, meerlaags };
}

function reeksNaam(ser: XmlElement, i: number) {
  const tx = kind(ser, "tx");
  if (!tx) return { naam: i18next.t("charts:defaults.seriesName", { n: i + 1 }) };
  const directe = kind(tx, "v");
  if (directe) return { naam: tekstVan(directe) };
  const b = bronWaarden(tx);
  return { naam: b.tekst[0] || i18next.t("charts:defaults.seriesName", { n: i + 1 }), ref: b.ref };
}
/** Kleur van een reeks; taartreeksen hebben kleuren per punt en geven er geen. */
function reeksKleur(ser: XmlElement) {
  const groep = ser.ouder?.lokaal ?? "";
  if (groep === "pieChart" || groep === "doughnutChart") return undefined;
  const sp = kind(ser, "spPr");
  const lijnig = groep === "lineChart" || groep === "scatterChart";
  const kleur = lijnig
    ? (pad(sp, "ln", "solidFill", "srgbClr") ?? pad(kind(ser, "marker"), "spPr", "solidFill", "srgbClr"))
    : pad(sp, "solidFill", "srgbClr");
  const w = attr(kleur, "val");
  // Wit of bijna wit is een randkleur, geen herkenbare reekskleur.
  return w && /^[0-9A-Fa-f]{6}$/.test(w) && !/^F[A-F0-9]F[A-F0-9]F[A-F0-9]$/i.test(w) ? w.toUpperCase() : undefined;
}
function rijkeRegels(tx: XmlElement | null): string[] {
  const rich = kind(tx, "rich");
  if (rich) return kinderen(rich, "p").map((p) => zoekAlle(p, "t").map(tekstVan).join(""));
  const b = bronWaarden(tx);
  return b.tekst.length ? [b.tekst.join(" ")] : [];
}
function asTitelTekst(as: XmlElement | null) {
  return rijkeRegels(pad(as, "title", "tx")).join(" ").trim();
}
function decimalenUit(notatie?: string) {
  if (!notatie) return null;
  const m = /\.(0+)/.exec(notatie);
  if (/^(General|Standaard)$/i.test(notatie)) return null;
  return m ? m[1].length : 0;
}
const AAN = (el: XmlElement | null) => !!el && attr(el, "val") !== "0" && attr(el, "val") !== "false";

/** Leest een grafiek zo ver als ons model reikt. */
export function leesGrafiekXml(xml: string): GelezenGrafiek {
  const wortel = leesXml(xml);
  if (wortel.lokaal !== "chartSpace")
    throw new GrafiekFout(i18next.t("charts:errors.chartXml.notDrawingML"));
  if (voorvoegselVoor(wortel, NS_C) === null)
    return {
      model: standaardModel(),
      bewerkbaar: false,
      reden: i18next.t("charts:read.reasons.extendedChart"),
      waarschuwingen: [],
      groepen: [],
    };
  const chart = kind(wortel, "chart");
  const plot = kind(chart, "plotArea");
  if (!chart || !plot) throw new GrafiekFout(i18next.t("charts:errors.chartXml.noPlotArea"));
  const groepenEl = elementen(plot).filter((e) => e.lokaal.endsWith("Chart"));
  const groepen = groepenEl.map((g) => g.lokaal);
  const waarschuwingen: string[] = [];
  let reden: string | undefined;
  const onbekend = groepen.filter((g) => !ONDERSTEUND.has(g));
  if (onbekend.length)
    reden = i18next.t("charts:read.reasons.unsupportedType", { types: onbekend.join(", ") });
  if (!groepenEl.length) reden = i18next.t("charts:read.reasons.noReadableSeries");

  const titelRegels = rijkeRegels(pad(chart, "title", "tx")).filter((r) => r.trim());
  const legend = kind(chart, "legend");
  const pos = attr(kind(legend, "legendPos"), "val") ?? "r";
  const legenda: LegendaPositie = !legend
    ? "geen"
    : pos === "b" ? "onder" : pos === "t" ? "boven" : pos === "l" ? "links" : "rechts";

  // Soort bepalen.
  let soort: GrafiekSoort = "kolom";
  const eerste = groepenEl[0];
  const groepering = (g: XmlElement | undefined) => attr(kind(g, "grouping"), "val") ?? "standard";
  const markeringen = (g: XmlElement) => {
    const series = kinderen(g, "ser");
    const metSymbool = series.some((s) => {
      const sym = attr(pad(s, "marker", "symbol"), "val");
      return sym ? sym !== "none" : AAN(kind(g, "marker"));
    });
    return metSymbool;
  };
  if (eerste) {
    switch (eerste.lokaal) {
      case "barChart": {
        const dir = attr(kind(eerste, "barDir"), "val") ?? "col";
        const gr = groepering(eerste);
        if (dir === "bar") {
          soort = "staaf";
          if (gr === "stacked" || gr === "percentStacked")
            waarschuwingen.push(i18next.t("charts:read.warnings.stackedBars"));
        } else soort = gr === "stacked" ? "kolomGestapeld" : gr === "percentStacked" ? "kolom100" : "kolom";
        break;
      }
      case "lineChart":
        soort = markeringen(eerste) ? "lijnMarkering" : "lijn";
        if (groepering(eerste) !== "standard") waarschuwingen.push(i18next.t("charts:read.warnings.stackedLines"));
        break;
      case "areaChart":
        soort = "vlak";
        if (groepering(eerste) !== "standard") waarschuwingen.push(i18next.t("charts:read.warnings.stackedAreas"));
        break;
      case "pieChart":
        soort = "taart";
        break;
      case "doughnutChart":
        soort = "ring";
        break;
      case "scatterChart":
        soort = "spreiding";
        break;
    }
  }
  if (groepen.length === 2 && groepen[0] === "barChart" && groepen[1] === "lineChart") soort = "combinatie";
  else if (groepen.length === 2 && groepen[0] === "lineChart" && groepen[1] === "barChart") {
    soort = "combinatie";
    waarschuwingen.push(i18next.t("charts:read.warnings.linesAfterColumns"));
  } else if (groepen.length > 1 && !reden)
    reden = i18next.t("charts:read.reasons.unsupportedCombination");
  if (soort === "combinatie" && kinderen(groepenEl[groepen.indexOf("lineChart")], "ser").length > 1)
    waarschuwingen.push(i18next.t("charts:read.warnings.lastSeriesAsLine"));

  // Reeksen in volgorde.
  const series = groepenEl
    .flatMap((g) => kinderen(g, "ser").map((s) => ({ s, g })))
    .sort((a, b) => {
      if (soort === "combinatie") {
        const ga = a.g.lokaal === "lineChart" ? 1 : 0, gb = b.g.lokaal === "lineChart" ? 1 : 0;
        if (ga !== gb) return ga - gb;
      }
      return Number(attr(kind(a.s, "order"), "val") ?? 0) - Number(attr(kind(b.s, "order"), "val") ?? 0);
    })
    .map((x) => x.s);
  let categorieen: string[] = [];
  let categorieenRef: string | undefined;
  const reeksen: Reeks[] = [];
  series.forEach((ser, i) => {
    const xEl = kind(ser, "cat") ?? kind(ser, "xVal");
    const yEl = kind(ser, "val") ?? kind(ser, "yVal");
    const cat = bronWaarden(xEl);
    const val = bronWaarden(yEl);
    if (cat.meerlaags) waarschuwingen.push(i18next.t("charts:read.warnings.multiLevelCategories"));
    if (i === 0) {
      const n = Math.max(cat.tekst.length, val.getal.length);
      categorieen = Array.from({ length: n }, (_, k) => cat.tekst[k] || (xEl ? "" : String(k + 1)) || String(k + 1));
      categorieenRef = cat.ref;
    }
    const waarden = Array.from({ length: categorieen.length }, (_, k) => val.getal[k] ?? null);
    const naam = reeksNaam(ser, i);
    reeksen.push({ naam: naam.naam, naamRef: naam.ref, waarden, waardenRef: val.ref, kleur: reeksKleur(ser) });
    if (val.getal.length > categorieen.length) waarschuwingen.push(i18next.t("charts:read.warnings.moreValuesThanCategories", { name: naam.naam }));
  });
  if (!series.length && !reden) reden = i18next.t("charts:read.reasons.noSeries");
  if (series.some((s) => kind(s, "trendline") || kind(s, "errBars")))
    waarschuwingen.push(i18next.t("charts:read.warnings.trendlinesDropped"));

  // Assen.
  const catAssen = kinderen(plot, "catAx").concat(kinderen(plot, "dateAx"));
  const valAssen = kinderen(plot, "valAx");
  const zichtbaar = (a: XmlElement) => !AAN(kind(a, "delete"));
  let asX: XmlElement | null = null, asY: XmlElement | null = null, asY2: XmlElement | null = null;
  if (soort === "spreiding") {
    asX = valAssen.find((a) => ["b", "t"].includes(attr(kind(a, "axPos"), "val") ?? "")) ?? valAssen[0] ?? null;
    asY = valAssen.find((a) => a !== asX) ?? null;
  } else {
    asX = catAssen.find(zichtbaar) ?? catAssen[0] ?? null;
    const zichtbareVal = valAssen.filter(zichtbaar);
    asY = zichtbareVal[0] ?? valAssen[0] ?? null;
    asY2 = zichtbareVal[1] ?? null;
  }
  const dLbls = groepenEl.flatMap((g) => [kind(g, "dLbls"), ...kinderen(g, "ser").map((s) => kind(s, "dLbls"))]).filter((x): x is XmlElement => !!x);
  const labels = dLbls.some((d) => !AAN(kind(d, "delete")) && (AAN(kind(d, "showVal")) || AAN(kind(d, "showPercent"))));
  const decimalen =
    decimalenUit(attr(dLbls.map((d) => kind(d, "numFmt")).find(Boolean), "formatCode")) ??
    decimalenUit(attr(kind(asY, "numFmt"), "formatCode")) ??
    0;

  const model = standaardModel({
    soort,
    titel: titelRegels[0] ?? "",
    ondertitel: titelRegels.slice(1).join(" "),
    legenda,
    asTitelX: asTitelTekst(asX),
    asTitelY: asTitelTekst(asY),
    asTitelY2: asTitelTekst(asY2),
    rasterlijnen: valAssen.some((a) => !!kind(a, "majorGridlines")),
    gegevenslabels: labels,
    decimalen: Math.min(decimalen, 6),
    categorieen,
    categorieenRef,
    reeksen,
  });
  if (!reden)
    try {
      controleerModel(model);
    } catch (e) {
      reden = i18next.t("charts:read.reasons.invalid", {
        reason: e instanceof Error ? e.message.charAt(0).toLowerCase() + e.message.slice(1) : String(e),
      });
    }
  const extern = kind(wortel, "externalData");
  const prefC = voorvoegselVoor(wortel, NS_C);
  if (!reden && prefC !== "c" && prefC !== null)
    reden = i18next.t("charts:read.reasons.unusualPrefix");
  return {
    model,
    bewerkbaar: !reden,
    reden,
    waarschuwingen: [...new Set(waarschuwingen)],
    groepen,
    externeData: extern ? rid(extern) : undefined,
  };
}

/**
 * Werkt een bestaande grafiek bij: titel, tekengebied (soorten, reeksen, assen)
 * en legenda worden vervangen; al het andere blijft onaangeroerd.
 */
export function werkGrafiekXmlBij(xml: string, model: GrafiekModel) {
  controleerModel(model);
  const gelezen = leesGrafiekXml(xml);
  if (!gelezen.bewerkbaar) throw new GrafiekFout(gelezen.reden ?? i18next.t("charts:errors.notEditable"));
  const wortel = leesXml(xml);
  const chart = kind(wortel, "chart")!;
  const plot = kind(chart, "plotArea")!;
  const wijzigingen: Vervanging[] = [];
  // Namespaces die onze fragmenten gebruiken.
  const nodig: string[] = [];
  const aPref = voorvoegselVoor(wortel, NS_A);
  if (aPref === null) nodig.push(` xmlns:a="${NS_A}"`);
  else if (aPref !== "a") throw new GrafiekFout(i18next.t("charts:errors.chartXml.unusualPrefix"));
  if (nodig.length) {
    const p = wortel.leeg ? wortel.inhoudStart - 2 : wortel.inhoudStart - 1;
    wijzigingen.push({ start: p, eind: p, tekst: nodig.join("") });
  }
  // Titel.
  const titel = kind(chart, "title");
  const atd = kind(chart, "autoTitleDeleted");
  for (const el of [titel, atd]) if (el) wijzigingen.push({ start: el.start, eind: el.eind, tekst: "" });
  wijzigingen.push({ start: chart.inhoudStart, eind: chart.inhoudStart, tekst: titelXml(model.titel, model.ondertitel) });
  // Tekengebied: layout vooraan en dTable/spPr/extLst achteraan behouden.
  const behoud = (naam: string) => {
    const el = kind(plot, naam);
    return el ? xml.slice(el.start, el.eind) : "";
  };
  const layout = behoud("layout") || "<c:layout/>";
  const staart = (behoud("dTable") + behoud("spPr") + behoud("extLst")) || PLOT_OPMAAK;
  wijzigingen.push({ start: plot.inhoudStart, eind: plot.inhoudEind, tekst: layout + plotInhoud(model) + staart });
  // Legenda direct na het tekengebied.
  const legend = kind(chart, "legend");
  if (legend) wijzigingen.push({ start: legend.start, eind: legend.eind, tekst: "" });
  wijzigingen.push({ start: plot.eind, eind: plot.eind, tekst: legendaXml(model) });
  return vervang(xml, wijzigingen);
}

/** Zoekt de relatie-id van `c:externalData` in een grafiek. */
export function externeDataId(xml: string) {
  return rid(kind(leesXml(xml), "externalData"));
}
/** Zet of vervangt `c:externalData`. */
export function zetExterneData(xml: string, rid: string) {
  const wortel = leesXml(xml);
  const extern = kind(wortel, "externalData");
  const nieuw = `<c:externalData r:id="${ontsnap(rid)}">${v("autoUpdate", 0)}</c:externalData>`;
  const nodigR = voorvoegselVoor(wortel, NS_R) === null ? ` xmlns:r="${NS_R}"` : "";
  const w: Vervanging[] = [];
  if (nodigR) w.push({ start: wortel.inhoudStart - 1, eind: wortel.inhoudStart - 1, tekst: nodigR });
  if (extern) w.push({ start: extern.start, eind: extern.eind, tekst: nieuw });
  else {
    // Volgorde: … spPr, txPr, externalData, printSettings, userShapes, extLst.
    const na = elementen(wortel).find((e) => ["printSettings", "userShapes", "extLst"].includes(e.lokaal));
    const p = na ? na.start : wortel.inhoudEind;
    w.push({ start: p, eind: p, tekst: nieuw });
  }
  return vervang(xml, w);
}
