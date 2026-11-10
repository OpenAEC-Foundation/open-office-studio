import type { XlsxCellValue } from "@betteroffice/xlsx";

export type DraaiFunctie = "sum" | "count" | "average" | "min" | "max";
export type DraaiGroep =
  | { soort: "datum"; eenheid: "year" | "quarter" | "month" }
  | { soort: "getal"; stap: number; begin?: number };
export interface DraaiVeld {
  id: string;
  kolom: number;
  groep?: DraaiGroep;
  aflopend?: boolean;
}
export interface DraaiWaarde {
  id: string;
  kolom: number;
  functie: DraaiFunctie;
  weergave: "normal" | "grandPercent" | "rowPercent" | "columnPercent";
  naam: string;
}
export interface DraaiFilter extends DraaiVeld {
  /** Canonical member keys; null selects every source member. */
  gekozen: string[] | null;
}
export interface DraaiIndeling {
  rijen: DraaiVeld[];
  kolommen: DraaiVeld[];
  waarden: DraaiWaarde[];
  filters: DraaiFilter[];
}
export interface DraaiBron {
  koppen: string[];
  rijen: XlsxCellValue[][];
  tekst?: string[][];
  datum1904: boolean;
}
export interface DraaiLid {
  sleutel: string;
  waarde: XlsxCellValue;
  tekst: string;
}
export interface DraaiResultaat {
  rijen: DraaiLid[][];
  kolommen: DraaiLid[][];
  leden: Map<string, DraaiLid[]>;
  cellen: XlsxCellValue[][][];
  rijtotalen: XlsxCellValue[][];
  kolomtotalen: XlsxCellValue[][];
  totaal: XlsxCellValue[];
  records: number;
}
export class Draaifout extends Error {
  constructor(
    public code:
      | "invalidSource"
      | "invalidFields"
      | "invalidGroup"
      | "tooLarge"
      | "noValues",
  ) {
    super(code);
  }
}
export const MAX_DRAAIBRON = 500000,
  MAX_DRAAICELLEN = 100000;
const leeg = (v: XlsxCellValue) =>
  v.kind === "empty" || (v.kind === "text" && v.value === "");
export const draaiSleutel = (v: XlsxCellValue) =>
  leeg(v)
    ? "empty"
    : `${v.kind}:${JSON.stringify("value" in v ? v.value : null)}`;
const tekst = (v: XlsxCellValue) =>
  leeg(v)
    ? ""
    : v.kind === "bool"
      ? v.value
        ? "TRUE"
        : "FALSE"
      : String("value" in v ? v.value : "");
const getal = (n: number): XlsxCellValue =>
  Number.isFinite(n)
    ? { kind: "number", value: n }
    : { kind: "error", value: "#NUM!" };
const afrond = (n: number) => Number(n.toPrecision(14));
function groepeer(
  v: XlsxCellValue,
  g: DraaiGroep | undefined,
  begin: number,
  datum1904: boolean,
): DraaiLid {
  if (!g || v.kind !== "number")
    return { sleutel: draaiSleutel(v), waarde: v, tekst: tekst(v) };
  if (g.soort === "getal") {
    const q = (v.value - begin) / g.stap;
    const lower = afrond(
      begin +
        Math.floor(q + Number.EPSILON * 16 * Math.max(1, Math.abs(q))) * g.stap,
    );
    return {
      sleutel: `interval:${lower}`,
      waarde: getal(lower),
      tekst: `${lower}–${afrond(lower + g.stap)}`,
    };
  }
  const day = Math.floor(v.value),
    base = datum1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31);
  const d = new Date(
    base + (day - (!datum1904 && day >= 60 ? 1 : 0)) * 86400000,
  );
  if (!Number.isFinite(d.getTime())) throw new Draaifout("invalidGroup");
  const n =
    g.eenheid === "year"
      ? d.getUTCFullYear()
      : g.eenheid === "quarter"
        ? Math.floor(d.getUTCMonth() / 3) + 1
        : d.getUTCMonth() + 1;
  return {
    sleutel: `${g.eenheid}:${n}`,
    waarde: getal(n),
    tekst: g.eenheid === "quarter" ? `Q${n}` : String(n),
  };
}
interface Acc {
  aantal: number;
  nummers: number;
  som: number;
  min: number;
  max: number;
  fout?: XlsxCellValue;
}
const nieuw = (): Acc => ({
  aantal: 0,
  nummers: 0,
  som: 0,
  min: Infinity,
  max: -Infinity,
});
function voeg(a: Acc, v: XlsxCellValue) {
  if (leeg(v)) return;
  a.aantal++;
  if (v.kind === "error") a.fout ??= v;
  if (v.kind !== "number") return;
  a.nummers++;
  a.som += v.value;
  a.min = Math.min(a.min, v.value);
  a.max = Math.max(a.max, v.value);
}
function uitkomst(a: Acc, f: DraaiFunctie): XlsxCellValue {
  if (f === "count") return getal(a.aantal);
  if (a.fout) return a.fout;
  if (f === "sum") return getal(a.som);
  if (!a.nummers) return { kind: "empty" };
  return getal(
    f === "average" ? a.som / a.nummers : f === "min" ? a.min : a.max,
  );
}
const key = (tuple: DraaiLid[]) => JSON.stringify(tuple.map((m) => m.sleutel));
const GRAND = "__grand__";

/** Typed aggregation used both for visible cells and the standard pivot cache/definition. */
export function berekenDraaitabel(
  bron: DraaiBron,
  cfg: DraaiIndeling,
): DraaiResultaat {
  const width = bron.koppen.length,
    namen = new Set(bron.koppen.map((n) => n.toLowerCase()));
  if (
    !width ||
    namen.size !== width ||
    bron.koppen.some((n) => !n.trim()) ||
    bron.rijen.some((r) => r.length !== width)
  )
    throw new Draaifout("invalidSource");
  if (width * bron.rijen.length > MAX_DRAAIBRON)
    throw new Draaifout("tooLarge");
  if (!cfg.waarden.length) throw new Draaifout("noValues");
  const velden = [...cfg.rijen, ...cfg.kolommen, ...cfg.filters],
    ids = new Set(velden.map((v) => v.id));
  if (
    ids.size !== velden.length ||
    cfg.waarden.some(
      (v) => !["sum", "count", "average", "min", "max"].includes(v.functie),
    )
  )
    throw new Draaifout("invalidFields");
  for (const v of [...velden, ...cfg.waarden])
    if (!Number.isInteger(v.kolom) || v.kolom < 0 || v.kolom >= width)
      throw new Draaifout("invalidFields");
  const begin = new Map<string, number>();
  for (const v of velden) {
    if (v.groep?.soort !== "getal") continue;
    const { stap } = v.groep;
    if (
      !Number.isFinite(stap) ||
      stap <= 0 ||
      (v.groep.begin !== undefined && !Number.isFinite(v.groep.begin))
    )
      throw new Draaifout("invalidGroup");
    let min = Infinity;
    for (const row of bron.rijen) {
      const n = row[v.kolom];
      if (n.kind === "number") min = Math.min(min, n.value);
    }
    begin.set(
      v.id,
      v.groep.begin ??
        (Number.isFinite(min) ? Math.floor(min / stap) * stap : 0),
    );
  }
  const leden = new Map(velden.map((v) => [v.id, new Map<string, DraaiLid>()]));
  const records = bron.rijen
    .map((row, ri) => {
      const members = new Map(
        velden.map((v) => {
          const m = groepeer(
            row[v.kolom],
            v.groep,
            begin.get(v.id) ?? 0,
            bron.datum1904,
          );
          if (!v.groep && bron.tekst?.[ri]?.[v.kolom] !== undefined)
            m.tekst = bron.tekst[ri][v.kolom];
          leden.get(v.id)!.set(m.sleutel, m);
          return [v.id, m] as const;
        }),
      );
      return { row, members };
    })
    .filter((r) =>
      cfg.filters.every(
        (v) =>
          v.gekozen === null ||
          v.gekozen.includes(r.members.get(v.id)!.sleutel),
      ),
    );
  const tuples = (fields: DraaiVeld[]) => {
    const map = new Map<string, DraaiLid[]>();
    for (const r of records) {
      const t = fields.map((v) => r.members.get(v.id)!);
      map.set(key(t), t);
    }
    if (!fields.length) map.set("[]", []);
    return [...map.values()].sort((a, b) => {
      for (let i = 0; i < fields.length; i++) {
        const x = a[i].waarde,
          y = b[i].waarde;
        let n =
          x.kind === "number" && y.kind === "number"
            ? x.value - y.value
            : a[i].tekst.localeCompare(b[i].tekst, "en", { numeric: true });
        if (n) return fields[i].aflopend ? -n : n;
      }
      return 0;
    });
  };
  const rijen = tuples(cfg.rijen),
    kolommen = tuples(cfg.kolommen);
  if (
    (rijen.length + 1) * (kolommen.length + 1) * cfg.waarden.length >
    MAX_DRAAICELLEN
  )
    throw new Draaifout("tooLarge");
  const buckets = new Map<string, Map<string, Acc[]>>();
  function acc(r: string, c: string) {
    let row = buckets.get(r);
    if (!row) {
      row = new Map();
      buckets.set(r, row);
    }
    let a = row.get(c);
    if (!a) {
      a = cfg.waarden.map(nieuw);
      row.set(c, a);
    }
    return a;
  }
  for (const { row, members } of records) {
    const r = key(cfg.rijen.map((v) => members.get(v.id)!)),
      c = key(cfg.kolommen.map((v) => members.get(v.id)!));
    for (const [rk, ck] of [
      [r, c],
      [r, GRAND],
      [GRAND, c],
      [GRAND, GRAND],
    ])
      cfg.waarden.forEach((v, i) => voeg(acc(rk, ck)[i], row[v.kolom]));
  }
  const values = (r: string, c: string) =>
    cfg.waarden.map((v, i) => {
      const n = uitkomst(acc(r, c)[i], v.functie);
      if (v.weergave === "normal" || n.kind !== "number") return n;
      const [rk, ck] =
        v.weergave === "rowPercent"
          ? [r, GRAND]
          : v.weergave === "columnPercent"
            ? [GRAND, c]
            : [GRAND, GRAND];
      const d = uitkomst(acc(rk, ck)[i], v.functie);
      return d.kind !== "number"
        ? d
        : d.value === 0
          ? { kind: "error" as const, value: "#DIV/0!" as const }
          : getal(n.value / d.value);
    });
  return {
    rijen,
    kolommen,
    leden: new Map([...leden].map(([id, map]) => [id, [...map.values()]])),
    cellen: rijen.map((r) => kolommen.map((c) => values(key(r), key(c)))),
    rijtotalen: rijen.map((r) => values(key(r), GRAND)),
    kolomtotalen: kolommen.map((c) => values(GRAND, key(c))),
    totaal: values(GRAND, GRAND),
    records: records.length,
  };
}
