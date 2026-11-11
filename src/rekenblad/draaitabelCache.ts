/** Standard SpreadsheetML cache fields and records; grouped fields retain their raw source. */
import type { XlsxCellValue } from "@betteroffice/xlsx";
import { attrTekst, ontsnap } from "../grafieken/xml";
import { NS } from "./werkboekXml";
import {
  berekenDraaitabel,
  draaiSleutel,
  Draaifout,
  type DraaiBron,
  type DraaiIndeling,
  type DraaiLid,
  type DraaiVeld,
} from "./draaitabelRekenen";

export const DRAAI_REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";
export const DRAAI_R_NS = DRAAI_REL.slice(0, -1);
export const draaiTekst = (s: string) =>
  s
    .replace(/_x[0-9a-f]{4}_/gi, (s) => "_x005F_" + s.slice(1))
    .replace(
      /[\x00-\x1f]/g,
      (s) => `_x${s.charCodeAt(0).toString(16).padStart(4, "0")}_`,
    );
const naam = (s: string) => ontsnap(draaiTekst(s));
export function draaiDatum(n: number, epoch1904: boolean) {
  const base = epoch1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31);
  const d = new Date(base + (n - (!epoch1904 && n >= 60 ? 1 : 0)) * 86400000);
  if (!Number.isFinite(d.getTime())) throw new Draaifout("invalidGroup");
  return d
    .toISOString()
    .replace(/\.000Z$/, "")
    .replace(/Z$/, "");
}
function item(v: XlsxCellValue, datum: boolean, epoch1904: boolean) {
  switch (v.kind) {
    case "empty":
      return "<m/>";
    case "text":
      return v.value === "" ? "<m/>" : `<s v="${naam(v.value)}"/>`;
    case "number":
      if (!Number.isFinite(v.value)) throw new Draaifout("invalidSource");
      return datum
        ? `<d v="${draaiDatum(v.value, epoch1904)}"/>`
        : `<n v="${v.value}"/>`;
    case "bool":
      return `<b v="${v.value ? 1 : 0}"/>`;
    case "error":
      return `<e v="${naam(v.value)}"/>`;
  }
}
export interface DraaiCacheveld {
  naam: string;
  bron: number;
  database: boolean;
  datum: boolean;
  gedeeld: DraaiLid[];
  items: DraaiLid[];
  groep?: string;
}
function bronLid(v: XlsxCellValue): DraaiLid {
  return {
    sleutel: draaiSleutel(v),
    waarde: v,
    tekst: v.kind === "empty" ? "" : String("value" in v ? v.value : ""),
  };
}
function groepItems(bron: DraaiBron, v: DraaiVeld) {
  const g = v.groep!,
    numbers = bron.rijen
      .map((r) => r[v.kolom])
      .filter(
        (v): v is Extract<XlsxCellValue, { kind: "number" }> =>
          v.kind === "number",
      )
      .map((v) => v.value);
  if (!numbers.length) throw new Draaifout("invalidGroup");
  let min = Infinity,
    max = -Infinity;
  for (const n of numbers) {
    min = Math.min(min, n);
    max = Math.max(max, n);
  }
  const s = (sleutel: string, tekst: string): DraaiLid => ({
    sleutel,
    tekst,
    waarde: { kind: "text", value: tekst },
  });
  const items: DraaiLid[] = [];
  let attrs: Record<string, string | number | undefined>;
  if (g.soort === "datum") {
    const first = draaiDatum(Math.floor(min), bron.datum1904),
      last = draaiDatum(Math.floor(max) + 1, bron.datum1904);
    const year = (d: string) => Number(d.slice(0, 4));
    attrs = {
      groupBy: { year: "years", quarter: "quarters", month: "months" }[
        g.eenheid
      ],
      startDate: first,
      endDate: last,
    };
    items.push(s("__below", `<${first.slice(0, 10)}`));
    if (g.eenheid === "year")
      for (let y = year(first); y <= year(last); y++)
        items.push(s(`year:${y}`, String(y)));
    else if (g.eenheid === "quarter")
      for (let q = 1; q <= 4; q++) items.push(s(`quarter:${q}`, `Q${q}`));
    else for (let m = 1; m <= 12; m++) items.push(s(`month:${m}`, String(m)));
    items.push(s("__above", `>${last.slice(0, 10)}`));
  } else {
    const base = g.begin ?? Math.floor(min / g.stap) * g.stap;
    const round = (n: number) => Number(n.toPrecision(14));
    const low = round(
        base + Math.floor((min - base) / g.stap + 1e-12) * g.stap,
      ),
      last = round(base + Math.floor((max - base) / g.stap + 1e-12) * g.stap),
      end = round(last + g.stap);
    const count = Math.round((end - low) / g.stap);
    if (!Number.isSafeInteger(count) || count < 1 || count > 100000)
      throw new Draaifout("tooLarge");
    attrs = {
      autoStart: 0,
      autoEnd: 0,
      startNum: low,
      endNum: end,
      groupInterval: g.stap,
    };
    items.push(s("__below", `<${low}`));
    for (let i = 0; i < count; i++) {
      const a = round(low + i * g.stap),
        b = round(a + g.stap);
      items.push(s(`interval:${a}`, `${a}–${b}`));
    }
    items.push(s("__above", `>${end}`));
  }
  if (bron.rijen.some((r) => draaiSleutel(r[v.kolom]) === "empty"))
    items.push({ sleutel: "empty", tekst: "", waarde: { kind: "empty" } });
  // Non-numeric members remain explicit group items, rather than disappearing.
  for (const value of bron.rijen
    .map((r) => r[v.kolom])
    .filter((v) => v.kind !== "number" && draaiSleutel(v) !== "empty"))
    if (!items.some((m) => m.sleutel === draaiSleutel(value)))
      items.push(bronLid(value));
  return {
    items,
    xml: `<fieldGroup base="${v.kolom}"><rangePr${attrTekst(attrs)}/><groupItems count="${items.length}">${items.map((i) => item(i.waarde, false, bron.datum1904)).join("")}</groupItems></fieldGroup>`,
  };
}
export function maakDraaicache(bron: DraaiBron, cfg: DraaiIndeling) {
  const resultaat = berekenDraaitabel(bron, cfg),
    rollen = [...cfg.rijen, ...cfg.kolommen, ...cfg.filters];
  const datumkolommen = new Set([
    ...(bron.datumKolommen ?? []),
    ...rollen.filter((v) => v.groep?.soort === "datum").map((v) => v.kolom),
  ]);
  const velden: DraaiCacheveld[] = bron.koppen.map((naam, kolom) => {
    const map = new Map<string, DraaiLid>();
    for (const r of bron.rijen) {
      const v = r[kolom];
      map.set(draaiSleutel(v), bronLid(v));
    }
    const gedeeld = [...map.values()];
    return {
      naam,
      bron: kolom,
      database: true,
      datum: datumkolommen.has(kolom),
      gedeeld,
      items: gedeeld,
    };
  });
  const indices = velden.map(
      (v) => new Map(v.gedeeld.map((m, i) => [m.sleutel, i])),
    ),
    veldIndex = new Map<string, number>();
  for (const v of rollen) {
    if (!v.groep) {
      veldIndex.set(v.id, v.kolom);
      continue;
    }
    const group = groepItems(bron, v);
    const rawUsed = rollen.some((o) => o.kolom === v.kolom && !o.groep);
    let index = v.kolom;
    if (rawUsed || velden[v.kolom].groep) {
      let naam =
          bron.koppen[v.kolom] +
          " (" +
          (v.groep.soort === "datum" ? v.groep.eenheid : "groups") +
          ")",
        suffix = 2;
      while (velden.some((f) => f.naam.toLowerCase() === naam.toLowerCase()))
        naam = bron.koppen[v.kolom] + " (" + suffix++ + ")";
      index = velden.length;
      velden.push({
        naam,
        bron: v.kolom,
        database: false,
        datum: false,
        gedeeld: [],
        items: group.items,
        groep: group.xml,
      });
    } else {
      velden[index] = {
        ...velden[index],
        items: group.items,
        groep: group.xml,
      };
    }
    veldIndex.set(v.id, index);
  }
  const itemIndex = (v: DraaiVeld, lid: DraaiLid) => {
    const f = velden[veldIndex.get(v.id)!],
      i = f.items.findIndex((m) => m.sleutel === lid.sleutel);
    if (i < 0) throw new Draaifout("invalidGroup");
    return i;
  };
  const xml = velden
    .map((v) => {
      const types = new Set(v.gedeeld.map((m) => m.waarde.kind));
      const shared = v.database
        ? `<sharedItems${attrTekst({ count: v.gedeeld.length, containsBlank: types.has("empty") ? 1 : 0, containsString: types.has("text") ? 1 : 0, containsNumber: !v.datum && types.has("number") ? 1 : 0, containsDate: v.datum && types.has("number") ? 1 : 0, containsNonDate: v.datum && types.size === 1 ? 0 : 1, containsMixedTypes: types.size > 1 ? 1 : 0, containsSemiMixedTypes: types.size > 1 ? 1 : 0 })}>${v.gedeeld.map((m) => item(m.waarde, v.datum, bron.datum1904)).join("")}</sharedItems>`
        : "";
      return `<cacheField name="${naam(v.naam)}"${v.database ? "" : ' databaseField="0"'} numFmtId="${v.datum ? 14 : 0}">${shared}${v.groep ?? ""}</cacheField>`;
    })
    .join("");
  const records = `<pivotCacheRecords xmlns="${NS}" count="${bron.rijen.length}">${bron.rijen.map((r) => `<r>${r.map((v, i) => `<x v="${indices[i].get(draaiSleutel(v))}"/>`).join("")}</r>`).join("")}</pivotCacheRecords>`;
  return {
    resultaat,
    velden,
    veldIndex,
    itemIndex,
    cacheFields: `<cacheFields count="${velden.length}">${xml}</cacheFields>`,
    records,
  };
}

/** Cache relationships and worksheet source are installed by the package transaction. */
export function cacheDefinitie(
  cache: ReturnType<typeof maakDraaicache>,
  sourceXml: string,
  recordRel: string,
  count: number,
) {
  return `<pivotCacheDefinition xmlns="${NS}" xmlns:r="${DRAAI_R_NS}" r:id="${recordRel}" recordCount="${count}" createdVersion="6" refreshedVersion="6" minRefreshableVersion="3" enableRefresh="1" saveData="1"><cacheSource type="worksheet">${sourceXml}</cacheSource>${cache.cacheFields}</pivotCacheDefinition>`;
}
