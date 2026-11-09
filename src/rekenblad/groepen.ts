/** Standaard SpreadsheetML-outlinegroepen, met behoud van cel- en opmaak-XML. */
import { Pakket } from "../grafieken/pakket";
import {
  attr,
  kinderen,
  kind,
  leesXml,
  vervang,
  type Vervanging,
} from "../grafieken/xml";
import {
  bladBeveiligd,
  fragment,
  metInhoud,
  voorvoegsel,
  werkbladDeel,
  xmlAttribuut,
} from "./pakket";
import i18next from "../i18n/config";

export type GroepAs = "rij" | "kolom";
export interface OutlineGroep {
  as: GroepAs;
  van: number;
  tot: number;
  niveau: number;
  samenvatting: number;
  ingeklapt: boolean;
  marker: boolean;
}
const fout = (naam: string) =>
  new Error(i18next.t(`spreadsheet:outline.${naam}`));
const niveauVan = (n: ReturnType<typeof kind>) => {
  const niveau = Number(attr(n, "outlineLevel") ?? 0);
  if (!Number.isInteger(niveau) || niveau < 0 || niveau > 7)
    throw fout("invalidRange");
  return niveau;
};

export function leesGroepen(bytes: Uint8Array, blad: number): OutlineGroep[] {
  const pakket = new Pakket(bytes),
    { pad } = werkbladDeel(pakket, blad),
    root = leesXml(pakket.lees(pad));
  const uit: OutlineGroep[] = [],
    outline = kind(kind(root, "sheetPr"), "outlinePr");
  for (const as of ["rij", "kolom"] as const) {
    const sporen = new Map<
      number,
      { niveau: number; hidden: boolean; collapsed: boolean }
    >();
    const nodes =
      as === "rij"
        ? kinderen(kind(root, "sheetData"), "row")
        : kinderen(kind(root, "cols"), "col");
    let vorige = -1;
    for (const n of nodes) {
      const van = Number(attr(n, as === "rij" ? "r" : "min") ?? vorige + 2) - 1;
      const tot = as === "rij" ? van : Number(attr(n, "max") ?? van + 1) - 1;
      if (
        !Number.isInteger(van) ||
        !Number.isInteger(tot) ||
        van < 0 ||
        tot < van ||
        tot >= (as === "rij" ? 1048576 : 16384)
      )
        throw fout("invalidRange");
      const niveau = niveauVan(n),
        hidden = ["1", "true"].includes(attr(n, "hidden") ?? "");
      for (let i = van; i <= tot; i++)
        sporen.set(i, {
          niveau,
          hidden,
          collapsed: ["1", "true"].includes(attr(n, "collapsed") ?? ""),
        });
      vorige = tot;
    }
    const indices = [...sporen.keys()]
      .filter((i) => sporen.get(i)!.niveau > 0)
      .sort((a, b) => a - b);
    const na = !["0", "false"].includes(
      attr(outline, as === "rij" ? "summaryBelow" : "summaryRight") ?? "1",
    );
    for (let niveau = 1; niveau <= 7; niveau++) {
      let start: number | null = null,
        eind = -1,
        hidden = true;
      const sluit = () => {
        if (start !== null) {
          const samenvatting = na ? eind + 1 : start - 1,
            marker = sporen.get(samenvatting)?.collapsed ?? false;
          uit.push({
            as,
            van: start,
            tot: eind,
            niveau,
            samenvatting,
            ingeklapt: marker || hidden,
            marker,
          });
        }
        start = null;
        hidden = true;
      };
      for (const i of indices) {
        const spoor = sporen.get(i)!;
        if (spoor.niveau < niveau) {
          sluit();
          continue;
        }
        if (start !== null && i !== eind + 1) sluit();
        if (start === null) start = i;
        eind = i;
        hidden &&= spoor.hidden;
      }
      sluit();
    }
  }
  return uit;
}

/** Groeperen/opheffen en in-/uitklappen zijn elk één pakketvervanging. */
export function wijzigGroep(
  bytes: Uint8Array,
  blad: number,
  as: GroepAs,
  van: number,
  tot: number,
  actie: "groepeer" | "opheffen" | "inklappen" | "uitklappen",
): Uint8Array {
  const maximum = as === "rij" ? 1048576 : 16384;
  if (
    !Number.isInteger(van) ||
    !Number.isInteger(tot) ||
    van < 0 ||
    tot < van ||
    tot >= maximum ||
    (as === "rij" && tot - van + 1 > 10000)
  )
    throw fout("invalidRange");
  const pakket = new Pakket(bytes),
    { pad } = werkbladDeel(pakket, blad),
    xml = pakket.lees(pad),
    root = leesXml(xml);
  if (bladBeveiligd(root)) throw fout("protected");
  const p = voorvoegsel(root),
    container = kind(root, as === "rij" ? "sheetData" : "cols");
  if (!container && as === "rij") throw fout("invalidRange");
  const nodes = kinderen(container, as === "rij" ? "row" : "col");
  const sporen = new Map<number, { xml: string; niveau: number }>();
  let vorige = -1;
  for (const n of nodes) {
    const begin = Number(attr(n, as === "rij" ? "r" : "min") ?? vorige + 2) - 1;
    const eind = as === "rij" ? begin : Number(attr(n, "max") ?? begin + 1) - 1;
    if (
      !Number.isInteger(begin) ||
      !Number.isInteger(eind) ||
      begin < 0 ||
      eind >= maximum ||
      eind < begin
    )
      throw fout("invalidRange");
    for (let i = begin; i <= eind; i++) {
      if (sporen.has(i)) throw fout("overlapping");
      let bron = fragment(xml, n);
      if (as === "kolom")
        bron = xmlAttribuut(xmlAttribuut(bron, "min", i + 1), "max", i + 1);
      sporen.set(i, { xml: bron, niveau: niveauVan(n) });
    }
    vorige = eind;
  }
  const na = !["0", "false"].includes(
    attr(
      kind(kind(root, "sheetPr"), "outlinePr"),
      as === "rij" ? "summaryBelow" : "summaryRight",
    ) ?? "1",
  );
  const summary = na ? tot + 1 : van - 1;
  if (
    ["inklappen", "uitklappen"].includes(actie) &&
    (summary < 0 || summary >= maximum)
  )
    throw fout("summaryRequired");
  const nieuwSpoor = (i: number) => ({
    xml:
      as === "rij"
        ? `<${p}row r="${i + 1}"/>`
        : `<${p}col min="${i + 1}" max="${i + 1}"/>`,
    niveau: 0,
  });
  const basisNiveau = Array.from(
    { length: tot - van + 1 },
    (_, i) => sporen.get(van + i)?.niveau ?? 0,
  ).reduce((min, n) => Math.min(min, n), 7);
  const verborgenBinnen =
    actie === "uitklappen"
      ? leesGroepen(bytes, blad).filter(
          (g) =>
            g.as === as &&
            g.van >= van &&
            g.tot <= tot &&
            g.niveau > basisNiveau &&
            g.marker,
        )
      : [];
  const verborgenBuiten =
    actie === "uitklappen" &&
    leesGroepen(bytes, blad).some(
      (g) =>
        g.as === as &&
        g.van <= van &&
        g.tot >= tot &&
        g.niveau < basisNiveau &&
        g.marker,
    );
  for (let i = van; i <= tot; i++) {
    const spoor = sporen.get(i) ?? nieuwSpoor(i);
    if (actie === "groepeer" || actie === "opheffen") {
      const niveau = Math.max(
        0,
        spoor.niveau + (actie === "groepeer" ? 1 : -1),
      );
      if (niveau > 7) throw fout("tooDeep");
      spoor.niveau = niveau;
      spoor.xml = xmlAttribuut(spoor.xml, "outlineLevel", niveau || null);
    } else
      spoor.xml = xmlAttribuut(
        spoor.xml,
        "hidden",
        actie === "inklappen" ||
          verborgenBuiten ||
          verborgenBinnen.some((g) => i >= g.van && i <= g.tot)
          ? "1"
          : null,
      );
    sporen.set(i, spoor);
  }
  if (["inklappen", "uitklappen"].includes(actie)) {
    const s = sporen.get(summary) ?? nieuwSpoor(summary);
    s.xml = xmlAttribuut(
      s.xml,
      "collapsed",
      actie === "inklappen" ? "1" : null,
    );
    sporen.set(summary, s);
  }
  // Niet-rij/kolomkinderen (bijvoorbeeld ignorable extensies) behouden.
  const overig =
    container?.kinderen
      .filter(
        (n) =>
          n.soort !== "element" || n.lokaal !== (as === "rij" ? "row" : "col"),
      )
      .map((n) => xml.slice(n.start, n.eind))
      .join("") ?? "";
  const inhoud =
    [...sporen]
      .sort(([a], [b]) => a - b)
      .map(([, s]) => s.xml)
      .join("") + overig;
  const wijzigingen: Vervanging[] = [];
  if (container)
    wijzigingen.push({
      start: container.start,
      eind: container.eind,
      tekst: metInhoud(xml, container, inhoud),
    });
  else {
    const plek = kind(root, "sheetData")?.start ?? root.inhoudEind;
    wijzigingen.push({
      start: plek,
      eind: plek,
      tekst: `<${p}cols>${inhoud}</${p}cols>`,
    });
  }
  const format = kind(root, "sheetFormatPr"),
    maxLevel = [...sporen.values()].reduce(
      (max, s) => Math.max(max, s.niveau),
      0,
    );
  if (format)
    wijzigingen.push({
      start: format.start,
      eind: format.eind,
      tekst: xmlAttribuut(
        fragment(xml, format),
        as === "rij" ? "outlineLevelRow" : "outlineLevelCol",
        maxLevel || null,
      ),
    });
  pakket.schrijf(pad, vervang(xml, wijzigingen));
  return pakket.inpakken();
}
