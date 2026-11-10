import { attrTekst, ontsnap } from "../grafieken/xml";
import { NS } from "./werkboekXml";
import { draaiTekst, type maakDraaicache } from "./draaitabelCache";
import type { DraaiIndeling, DraaiVeld } from "./draaitabelRekenen";

export const DRAAI_EXT = "{7021146A-A794-481D-A5FA-E1A4A393C813}";
export const DRAAI_NS = "https://openaec.org/open-office-studio/pivot/1";
type Cache = ReturnType<typeof maakDraaicache>;
/** Tabular row/column items include their actual cache member indexes, not placeholders. */
export function draaiDefinitie(
  cache: Cache,
  cfg: DraaiIndeling,
  naam: string,
  cacheId: number,
  ref: string,
  headers: number,
  left: number,
  config: unknown,
) {
  const rows = cfg.rijen.map((v) => cache.veldIndex.get(v.id)!),
    cols = cfg.kolommen.map((v) => cache.veldIndex.get(v.id)!),
    multi = cfg.waarden.length > 1;
  const rollen = [...cfg.rijen, ...cfg.kolommen, ...cfg.filters];
  const velden = cache.velden
    .map((f, i) => {
      const row = rows.includes(i),
        col = cols.includes(i),
        page = cfg.filters.find((v) => cache.veldIndex.get(v.id) === i),
        data = cfg.waarden.some((v) => v.kolom === i);
      const role = rollen.find((v) => cache.veldIndex.get(v.id) === i),
        gekozen = role?.gekozen;
      const items = role
        ? `<items count="${f.items.length}">${f.items.map((m, j) => `<item${attrTekst({ x: j, h: gekozen && !gekozen.includes(m.sleutel) ? 1 : undefined })}/>`).join("")}</items>`
        : "";
      return `<pivotField${attrTekst({ axis: row ? "axisRow" : col ? "axisCol" : page ? "axisPage" : undefined, dataField: data ? 1 : undefined, defaultSubtotal: 0, showAll: 0, compact: 0, outline: 0, sortType: role?.aflopend ? "descending" : "ascending", multipleItemSelectionAllowed: page && gekozen?.length !== 1 ? 1 : undefined })}>${items}</pivotField>`;
    })
    .join("");
  const fields = (tag: string, ids: number[]) =>
    ids.length
      ? `<${tag} count="${ids.length}">${ids.map((x) => `<field x="${x}"/>`).join("")}</${tag}>`
      : "";
  const xs = (vs: DraaiVeld[], tuple: Cache["resultaat"]["rijen"][number]) =>
    vs.map((v, i) => `<x v="${cache.itemIndex(v, tuple[i])}"/>`).join("");
  const rowItems = cache.resultaat.rijen.map(
    (t) => `<i>${xs(cfg.rijen, t) || "<x/>"}</i>`,
  );
  if (rows.length) rowItems.push('<i t="grand"><x/></i>');
  const colItems = cache.resultaat.kolommen.flatMap((t) =>
    cfg.waarden.map(
      (_, i) =>
        `<i i="${i}">${xs(cfg.kolommen, t)}${multi ? `<x v="${i}"/>` : cfg.kolommen.length ? "" : "<x/>"}</i>`,
    ),
  );
  if (cols.length)
    cfg.waarden.forEach((_, i) =>
      colItems.push(`<i t="grand" i="${i}"><x/></i>`),
    );
  const pages = cfg.filters.length
    ? `<pageFields count="${cfg.filters.length}">${cfg.filters
        .map((v) => {
          const index = cache.veldIndex.get(v.id)!,
            item =
              v.gekozen?.length === 1
                ? cache.velden[index].items.findIndex(
                    (m) => m.sleutel === v.gekozen![0],
                  )
                : undefined;
          return `<pageField${attrTekst({ fld: index, hier: -1, item: item !== undefined && item >= 0 ? item : undefined })}/>`;
        })
        .join("")}</pageFields>`
    : "";
  const values = `<dataFields count="${cfg.waarden.length}">${cfg.waarden.map((v) => `<dataField${attrTekst({ name: draaiTekst(v.naam), fld: v.kolom, subtotal: v.functie, showDataAs: { normal: undefined, grandPercent: "percentOfTotal", rowPercent: "percentOfRow", columnPercent: "percentOfCol" }[v.weergave], numFmtId: v.weergave === "normal" ? 0 : 10, baseField: v.weergave === "normal" ? undefined : 0, baseItem: v.weergave === "normal" ? undefined : 0 })}/>`).join("")}</dataFields>`;
  return `<pivotTableDefinition xmlns="${NS}"${attrTekst({ name: draaiTekst(naam), cacheId, dataCaption: "Values", dataOnRows: 0, compact: 0, compactData: 0, outline: 0, outlineData: 0, rowGrandTotals: cols.length ? 1 : 0, colGrandTotals: rows.length ? 1 : 0, multipleFieldFilters: 1, useAutoFormatting: 0 })}><location${attrTekst({ ref, firstHeaderRow: 1, firstDataRow: headers + 1, firstDataCol: left, rowPageCount: cfg.filters.length || undefined, colPageCount: cfg.filters.length ? 1 : undefined })}/><pivotFields count="${cache.velden.length}">${velden}</pivotFields>${fields("rowFields", rows)}<rowItems count="${rowItems.length}">${rowItems.join("")}</rowItems>${fields("colFields", [...cols, ...(multi ? [-2] : [])])}<colItems count="${colItems.length}">${colItems.join("")}</colItems>${pages}${values}<pivotTableStyleInfo name="PivotStyleLight16" showRowHeaders="1" showColHeaders="1" showRowStripes="0" showColStripes="0" showLastColumn="1"/><extLst><ext uri="${DRAAI_EXT}"><oos:config xmlns:oos="${DRAAI_NS}">${ontsnap(JSON.stringify(config))}</oos:config></ext></extLst></pivotTableDefinition>`;
}
