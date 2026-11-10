/** Regelbeheer met native undo, behoud van onbekende OOXML en standaard XLSX-opslag. */
import type { ConditionalFormatInfo, WorkbookHandle } from "@betteroffice/xlsx";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { Pakket } from "../grafieken/pakket";
import {
  attr,
  elementen,
  kinderen,
  kind,
  leesXml,
  leesWerkbladXml,
  ontsnap,
  rid,
  vervang,
  type XmlElement,
} from "../grafieken/xml";
import { adres, bereikA1, ontleedBereik } from "../lint/rekenblad-logica";
import { voerOpsUit } from "../lint/rekenblad-opdrachten";
import i18next from "../i18n/config";

export interface VoorwaardelijkeRegel extends ConditionalFormatInfo {
  stopIfTrue: boolean;
  rawXml: string;
  /** Preserve imported DXF facets that this editor cannot author. */
  uitgebreideStijl?: boolean;
}
export type VoorwaardelijkeOp = {
  type: "setConditionalFormats";
  sheet: number;
  formats: {
    sqref: string;
    rules: {
      id: string;
      type: string;
      operator?: string;
      formulas: string[];
      priority: number;
      dxfId?: number;
      format: ConditionalFormatInfo["format"];
      rawXml: string;
    }[];
  }[];
};
const cache = new WeakMap<
  WorkbookHandle,
  Map<number, { catalogus: string; regels: VoorwaardelijkeRegel[] }>
>();
const gekoppeld = new WeakSet<WorkbookHandle>();

function koppelRegelCache(h: WorkbookHandle) {
  if (gekoppeld.has(h)) return;
  gekoppeld.add(h);
  const undo = h.undo.bind(h),
    redo = h.redo.bind(h),
    update = h.applyUpdate.bind(h),
    ops = h.applyOps.bind(h),
    profiel = h.applyOpsProfiled.bind(h);
  h.undo = () => {
    cache.delete(h);
    return undo();
  };
  h.redo = () => {
    cache.delete(h);
    return redo();
  };
  h.applyUpdate = (bytes) => {
    cache.delete(h);
    return update(bytes);
  };
  // Structural operations can move identical rule catalogues between sheets
  // while their unknown source XML differs. Ordinary typing uses editCell(s).
  const verandertRegels = (lijst: unknown[]) => lijst.length > 0;
  h.applyOps = (lijst) => {
    if (verandertRegels(lijst)) cache.delete(h);
    return ops(lijst);
  };
  h.applyOpsProfiled = (lijst) => {
    if (verandertRegels(lijst)) cache.delete(h);
    return profiel(lijst);
  };
}

export function leesVoorwaardelijkeRegels(
  h: WorkbookHandle,
  blad: number,
): VoorwaardelijkeRegel[] {
  koppelRegelCache(h);
  let c = cache.get(h);
  if (!c) {
    c = new Map();
    cache.set(h, c);
  }
  const lijst = h.conditionalFormats(blad);
  const catalogus = JSON.stringify(lijst),
    bestaand = c.get(blad);
  if (bestaand?.catalogus === catalogus) return bestaand.regels;
  if (!lijst.length) {
    c.set(blad, { catalogus, regels: [] });
    return [];
  }
  const pakket = new Pakket(h.save());
  const rel = pakket
    .relaties("")
    .find((r) => !r.extern && r.type.endsWith("/officeDocument"));
  if (!rel) throw new Error("Missing workbook relationship");
  const werkboek = Pakket.doelPad("", rel.target);
  const s = kinderen(kind(leesXml(pakket.lees(werkboek)), "sheets"), "sheet")[
    blad
  ];
  const pad = s && pakket.doel(werkboek, rid(s) ?? "");
  if (!pad) throw new Error("Missing worksheet relationship");
  const xml = pakket.lees(pad);
  const stijlRel = pakket
    .relaties(werkboek)
    .find((r) => !r.extern && r.type.endsWith("/styles"));
  const dxfs = stijlRel
    ? kinderen(
        kind(
          leesXml(pakket.lees(Pakket.doelPad(werkboek, stijlRel.target))),
          "dxfs",
        ),
        "dxf",
      )
    : [];
  const eenvoudig = (n: XmlElement): boolean => {
    const toegestaan: Record<string, string[]> = {
      dxf: ["font", "fill"],
      font: ["b", "i", "color"],
      fill: ["patternFill"],
      patternFill: ["fgColor"],
      b: [],
      i: [],
      color: [],
      fgColor: [],
    };
    return (
      n.lokaal in toegestaan &&
      elementen(n).every(
        (c) => toegestaan[n.lokaal].includes(c.lokaal) && eenvoudig(c),
      )
    );
  };
  const knopen = kinderen(
    leesWerkbladXml(xml),
    "conditionalFormatting",
  ).flatMap((g) => kinderen(g, "cfRule"));
  const regels = lijst.map((r, index) => {
    const knoop = knopen[index];
    if (!knoop)
      throw new Error(
        "Conditional formatting catalogue differs from saved rules",
      );
    let rawXml = xml.slice(knoop.start, knoop.eind);
    // A freshly authored style only exists in the save plan, not in the
    // source style table. Let the writer assign its differential style.
    if (r.dxfId === undefined)
      rawXml = rawXml.replace(/\s+dxfId\s*=\s*(?:"[^"]*"|'[^']*')/, "");
    return {
      ...r,
      stopIfTrue: ["1", "true"].includes(attr(knoop, "stopIfTrue") ?? ""),
      rawXml,
      uitgebreideStijl:
        r.dxfId !== undefined && !!dxfs[r.dxfId] && !eenvoudig(dxfs[r.dxfId]),
    };
  });
  c.set(blad, { catalogus, regels });
  return regels;
}

function attribuut(xml: string, naam: string, waarde: string | null): string {
  const root = leesXml(xml),
    oud = new RegExp(`\\s+${naam}\\s*=\\s*(?:"[^"]*"|'[^']*')`);
  const kop = xml.slice(0, root.inhoudStart);
  const schoon = kop.replace(oud, "");
  return (
    schoon.replace(
      /(\/?>)$/,
      `${waarde === null ? "" : ` ${naam}="${ontsnap(waarde)}"`}$1`,
    ) + xml.slice(root.inhoudStart)
  );
}

/** Voor alle regels één native transactie; onbekende regels blijven intact. */
export async function bewaarVoorwaardelijkeRegels(
  api: XlsxEditorApi,
  blad: number,
  regels: VoorwaardelijkeRegel[],
  versie: string,
) {
  const catalogus = api.handle.readCells({ ranges: [] });
  if (!catalogus.ok) throw new Error(catalogus.failure.message);
  if (catalogus.sheets[blad]?.editable === false)
    throw new Error(i18next.t("spreadsheet:conditional.protected"));
  const formats: VoorwaardelijkeOp["formats"] = [];
  regels.forEach((r, i) => {
    let groep = formats.find((g) => g.sqref === r.range);
    if (!groep) {
      groep = { sqref: r.range, rules: [] };
      formats.push(groep);
    }
    groep.rules.push({
      id: r.id,
      type: r.type,
      operator: r.operator,
      formulas: r.formulas,
      priority: i + 1,
      dxfId: r.dxfId,
      format: r.format,
      rawXml: attribuut(
        attribuut(r.rawXml, "priority", String(i + 1)),
        "stopIfTrue",
        r.stopIfTrue ? "1" : "0",
      ),
    });
  });
  cache.delete(api.handle);
  await voerOpsUit(
    api,
    [{ type: "setConditionalFormats", sheet: blad, formats }],
    versie,
  );
}

/** Bestaande Excel-presets zonder expliciete formule blijven ook zichtbaar. */
export function formuleVoorRegel(regel: VoorwaardelijkeRegel): string {
  if (regel.type === "cellIs") {
    const r = ontleedBereik(regel.range.split(/\s+/)[0]);
    if (!r) return "FALSE";
    const cel = adres({ row: r.top, col: r.left }),
      a = `(${regel.formulas[0] ?? ""})`,
      b = `(${regel.formulas[1] ?? ""})`;
    switch (regel.operator) {
      case "equal":
        return `${cel}=${a}`;
      case "notEqual":
        return `${cel}<>${a}`;
      case "greaterThan":
        return `${cel}>${a}`;
      case "greaterThanOrEqual":
        return `${cel}>=${a}`;
      case "lessThan":
        return `${cel}<${a}`;
      case "lessThanOrEqual":
        return `${cel}<=${a}`;
      case "between":
        return `AND(${cel}>=${a},${cel}<=${b})`;
      case "notBetween":
        return `OR(${cel}<${a},${cel}>${b})`;
      default:
        return "FALSE";
    }
  }
  if (regel.formulas[0]) return regel.formulas[0];
  const root = leesXml(regel.rawXml),
    r = ontleedBereik(regel.range.split(/\s+/)[0]);
  if (!r) return "FALSE";
  const cel = adres({ row: r.top, col: r.left });
  const ranges = regel.range
    .split(/\s+/)
    .map((b) => b.replace(/\$?([A-Z]+)\$?(\d+)/gi, "$$$1$$$2"));
  if (regel.type === "duplicateValues" || regel.type === "uniqueValues")
    return `(${ranges.map((b) => `COUNTIF(${b},${cel})`).join("+")})${regel.type === "duplicateValues" ? ">1" : "=1"}`;
  if (regel.type === "containsBlanks") return `LEN(TRIM(${cel}))=0`;
  if (regel.type === "notContainsBlanks") return `LEN(TRIM(${cel}))>0`;
  if (regel.type === "containsErrors") return `ISERROR(${cel})`;
  if (regel.type === "notContainsErrors") return `NOT(ISERROR(${cel}))`;
  if (regel.type === "top10") {
    const rank = Math.max(1, Number(attr(root, "rank") ?? 10));
    const n = ["1", "true"].includes(attr(root, "percent") ?? "")
      ? `MAX(1,ROUNDUP(COUNT(${ranges.join(",")})*${rank}/100,0))`
      : `MIN(${rank},COUNT(${ranges.join(",")}))`;
    const bottom = ["1", "true"].includes(attr(root, "bottom") ?? "");
    const waarden =
      ranges.length === 1 ? ranges[0] : `VSTACK(${ranges.join(",")})`;
    return `AND(ISNUMBER(${cel}),${cel}${bottom ? "<=" : ">="}${bottom ? "SMALL" : "LARGE"}(${waarden},${n}))`;
  }
  if (regel.type === "aboveAverage") {
    const above = !["0", "false"].includes(attr(root, "aboveAverage") ?? "1"),
      equal = ["1", "true"].includes(attr(root, "equalAverage") ?? "");
    const stddev = Number(attr(root, "stdDev") ?? 0);
    const grens = `AVERAGE(${ranges.join(",")})${stddev ? `${above ? "+" : "-"}${stddev}*STDEV.P(${ranges.join(",")})` : ""}`;
    return `AND(ISNUMBER(${cel}),${cel}${above ? ">" : "<"}${equal ? "=" : ""}${grens})`;
  }
  if (regel.type === "timePeriod") {
    const dag = `INT(${cel})`,
      vandaag = "TODAY()";
    const periode = attr(root, "timePeriod");
    const datum =
      periode === "today"
        ? `${dag}=${vandaag}`
        : periode === "yesterday"
          ? `${dag}=${vandaag}-1`
          : periode === "tomorrow"
            ? `${dag}=${vandaag}+1`
            : periode === "last7Days"
              ? `AND(${dag}>=TODAY()-6,${dag}<=TODAY())`
              : /^(?:last|this|next)Month$/.test(periode ?? "")
                ? `AND(MONTH(${cel})=MONTH(EDATE(TODAY(),${periode === "lastMonth" ? -1 : periode === "nextMonth" ? 1 : 0})),YEAR(${cel})=YEAR(EDATE(TODAY(),${periode === "lastMonth" ? -1 : periode === "nextMonth" ? 1 : 0})))`
                : "FALSE";
    return `AND(ISNUMBER(${cel}),${datum})`;
  }
  return "FALSE";
}

export function nieuweVoorwaardelijkeRegel(
  bereik: string,
  formule: string,
  format: ConditionalFormatInfo["format"],
  bestaande: VoorwaardelijkeRegel[],
): VoorwaardelijkeRegel {
  if (!ontleedBereik(bereik))
    throw new Error(i18next.t("spreadsheet:conditional.invalidRange"));
  const schoon = formule.trim().replace(/^=/, "");
  if (!schoon || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(schoon))
    throw new Error(i18next.t("spreadsheet:conditional.invalidFormula"));
  let nummer = 1;
  while (bestaande.some((r) => r.id === `cf${nummer}`)) nummer++;
  return {
    id: `cf${nummer}`,
    range: bereik,
    type: "expression",
    formulas: [schoon],
    priority: bestaande.length + 1,
    format,
    editable: true,
    stopIfTrue: false,
    rawXml: `<cfRule xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" type="expression" priority="${bestaande.length + 1}"><formula>${ontsnap(schoon)}</formula></cfRule>`,
  };
}

export const REGELSOORTEN = [
  "expression",
  "greaterThan",
  "lessThan",
  "between",
  "equal",
  "containsText",
  "duplicates",
  "top10",
  "bottom10",
  "aboveAverage",
  "belowAverage",
  "yesterday",
  "today",
  "tomorrow",
  "last7Days",
  "colorScale",
  "dataBar",
  "iconSet",
] as const;
export type RegelSoort = (typeof REGELSOORTEN)[number];

/** Presets worden als standaardformules/OOXML bewaard, ook voor andere apps. */
export function voorwaardelijkVoorbeeld(
  soort: RegelSoort,
  bereik: string,
  a: string,
  b: string,
): string {
  const r = ontleedBereik(bereik);
  if (!r) throw new Error(i18next.t("spreadsheet:conditional.invalidRange"));
  const cel = adres({ row: r.top, col: r.left });
  const vast = bereikA1(r).replace(/([A-Z]+)(\d+)/g, "$$$1$$$2");
  const waarde = (v: string) => v.trim().replace(/^=/, "") || "0";
  switch (soort) {
    case "expression":
      return a;
    case "greaterThan":
      return `${cel}>(${waarde(a)})`;
    case "lessThan":
      return `${cel}<(${waarde(a)})`;
    case "equal":
      return `${cel}=(${waarde(a)})`;
    case "between":
      return `AND(${cel}>=(${waarde(a)}),${cel}<=(${waarde(b)}))`;
    case "containsText":
      return `ISNUMBER(SEARCH("${a.replace(/"/g, '""')}",${cel}))`;
    case "duplicates":
      return `AND(${cel}<>"",COUNTIF(${vast},${cel})>1)`;
    case "top10":
      return `AND(ISNUMBER(${cel}),${cel}>=LARGE(${vast},MIN(10,COUNT(${vast}))))`;
    case "bottom10":
      return `AND(ISNUMBER(${cel}),${cel}<=SMALL(${vast},MIN(10,COUNT(${vast}))))`;
    case "aboveAverage":
      return `AND(ISNUMBER(${cel}),${cel}>AVERAGE(${vast}))`;
    case "belowAverage":
      return `AND(ISNUMBER(${cel}),${cel}<AVERAGE(${vast}))`;
    case "yesterday":
      return `AND(ISNUMBER(${cel}),INT(${cel})=TODAY()-1)`;
    case "today":
      return `AND(ISNUMBER(${cel}),INT(${cel})=TODAY())`;
    case "tomorrow":
      return `AND(ISNUMBER(${cel}),INT(${cel})=TODAY()+1)`;
    case "last7Days":
      return `AND(ISNUMBER(${cel}),INT(${cel})>=TODAY()-6,INT(${cel})<=TODAY())`;
    default:
      return "TRUE";
  }
}

export function nieuweVisueleRegel(
  soort: "colorScale" | "dataBar" | "iconSet",
  bereik: string,
  kleur: string,
  bestaande: VoorwaardelijkeRegel[],
): VoorwaardelijkeRegel {
  const r = nieuweVoorwaardelijkeRegel(bereik, "TRUE", {}, bestaande);
  const opties =
    soort === "colorScale"
      ? '<colorScale><cfvo type="min"/><cfvo type="percentile" val="50"/><cfvo type="max"/><color rgb="FFF8696B"/><color rgb="FFFFEB84"/><color rgb="FF63BE7B"/></colorScale>'
      : soort === "dataBar"
        ? `<dataBar showValue="1"><cfvo type="min"/><cfvo type="max"/><color rgb="FF${kleur.replace(/^#/, "").toUpperCase()}"/></dataBar>`
        : '<iconSet iconSet="3TrafficLights1" showValue="1"><cfvo type="percent" val="0"/><cfvo type="percent" val="33"/><cfvo type="percent" val="67"/></iconSet>';
  return {
    ...r,
    type: soort,
    editable: false,
    formulas: [],
    rawXml: `<cfRule xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" type="${soort}" priority="${r.priority}">${opties}</cfRule>`,
  };
}

/** Een basisregel bewerken; overige attributen van andere regels behouden. */
export function wijzigVoorwaardelijkeRegel(
  regel: VoorwaardelijkeRegel,
  bereik: string,
  formule: string,
  format: ConditionalFormatInfo["format"],
): VoorwaardelijkeRegel {
  const nieuw = nieuweVoorwaardelijkeRegel(bereik, formule, format, []);
  const gelijk = (["fill", "fontColor", "bold", "italic"] as const).every(
    (k) =>
      String(format[k] ?? "").toLowerCase() ===
      String(regel.format[k] ?? "").toLowerCase(),
  );
  if (regel.uitgebreideStijl && !gelijk)
    throw new Error(i18next.t("spreadsheet:conditional.preserveStyle"));
  const root = leesXml(regel.rawXml),
    formules = kinderen(root, "formula");
  const tag = root.voorvoegsel ? `${root.voorvoegsel}:formula` : "formula";
  const formuleXml = `<${tag}>${ontsnap(nieuw.formulas[0])}</${tag}>`;
  let rawXml = vervang(
    regel.rawXml,
    formules.map((n, i) => ({
      start: n.start,
      eind: n.eind,
      tekst: i === 0 ? formuleXml : "",
    })),
  );
  if (!formules.length)
    rawXml = rawXml.replace(/<\/([\w.-]+:)?cfRule\s*>$/, `${formuleXml}$&`);
  rawXml = attribuut(attribuut(rawXml, "type", "expression"), "operator", null);
  if (!gelijk) rawXml = attribuut(rawXml, "dxfId", null);
  return {
    ...nieuw,
    id: regel.id,
    priority: regel.priority,
    stopIfTrue: regel.stopIfTrue,
    rawXml,
    ...(gelijk
      ? { dxfId: regel.dxfId, uitgebreideStijl: regel.uitgebreideStijl }
      : {}),
  };
}
