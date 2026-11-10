import { openWorkbook, type WorkbookHandle } from "@betteroffice/xlsx";
import { Pakket } from "../grafieken/pakket";
import {
  attr,
  attrTekst,
  elementen,
  kind,
  kinderen,
  leesXml,
  ontsnap,
  vervang,
} from "../grafieken/xml";
import {
  adres,
  ontleedAdres,
  verschuifFormule,
  type Bereik,
} from "../lint/rekenblad-logica";
import { sorteerRijen } from "../lint/rekenblad-sorteren";
import { naamFout } from "./namen";
import { a1, bevat, gebied, NS, tagXml, werkmap, sectie } from "./werkboekXml";
import { leesBeveiliging } from "./beveiliging";
import { installeerValidatie } from "./gegevensvalidatie";
import {
  leesKolomFilter,
  kolomFilterXml,
  zichtbareRijen,
  leesAutoFilters,
  type KolomFilter,
  type FilterCel,
  type BladFilter,
} from "../lint/rekenblad-filter";
import {
  herkenTabelstijl,
  maakTabelopmaak,
  registreerTabelstijl,
  type Tabelstijl,
} from "./tabelstijl";

const REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/table";
const xlees = (s: string) =>
  s.replace(/_x([0-9a-f]{4})_/gi, (_, n: string) =>
    String.fromCharCode(parseInt(n, 16)),
  );
const xschrijf = (s: string) =>
  s.replace(/_x[0-9a-f]{4}_/gi, (s) => "_x005F_" + s.slice(1));
export type Totaalfunctie =
  | "none"
  | "sum"
  | "count"
  | "average"
  | "min"
  | "max";
export interface Tabelkolom {
  id: number;
  naam: string;
  totaal: Totaalfunctie;
  label: string;
}
export interface Tabel {
  id: number;
  blad: number;
  naam: string;
  ref: string;
  kop: boolean;
  totaal: boolean;
  banden: boolean;
  filters: boolean;
  stijl: string;
  pad: string;
  kolommen: Tabelkolom[];
  criteria: Map<number, KolomFilter>;
}
export interface Tabelkeuze {
  naam: string;
  ref: string;
  kop: boolean;
  totaal: boolean;
  banden: boolean;
  filters: boolean;
  stijl: Tabelstijl;
  totalen?: Totaalfunctie[];
  totaalLabel?: string;
}
export class Tabelfout extends Error {
  constructor(
    public code:
      | "invalidName"
      | "duplicateName"
      | "invalidRange"
      | "overlap"
      | "mergedCells"
      | "protectedSheet"
      | "occupiedTotal"
      | "missingTable"
      | "damagedTable"
      | "tooLarge"
      | "renameTable"
      | "unsupportedStyle",
  ) {
    super(code);
  }
}
const functies = new Set<Totaalfunctie>([
  "none",
  "sum",
  "count",
  "average",
  "min",
  "max",
]);
export function leesTabellen(bytes: Uint8Array | Pakket): Tabel[][] {
  const p = bytes instanceof Pakket ? bytes : new Pakket(bytes),
    wb = werkmap(p),
    namen = new Set<string>();
  return wb.bladen.map((s, blad) =>
    p
      .relaties(s.pad)
      .filter((r) => !r.extern && r.type.endsWith("/table"))
      .map((r) => {
        const pad = Pakket.doelPad(s.pad, r.target);
        if (p.verwijzingenNaar(pad).length !== 1)
          throw new Tabelfout("damagedTable");
        const root = leesXml(p.lees(pad)),
          naam = xlees(attr(root, "displayName") ?? attr(root, "name") ?? ""),
          ref = attr(root, "ref") ?? "";
        if (root.lokaal !== "table" || !naam || namen.has(naam.toLowerCase()))
          throw new Tabelfout("damagedTable");
        namen.add(naam.toLowerCase());
        gebied(ref);
        const stijl = kind(root, "tableStyleInfo"),
          kolommen = kinderen(kind(root, "tableColumns"), "tableColumn").map(
            (c) => ({
              id: Number(attr(c, "id")),
              naam: xlees(attr(c, "name") ?? ""),
              totaal: (functies.has(
                attr(c, "totalsRowFunction") as Totaalfunctie,
              )
                ? attr(c, "totalsRowFunction")
                : "none") as Totaalfunctie,
              label: xlees(attr(c, "totalsRowLabel") ?? ""),
            }),
          );
        return {
          id: Number(attr(root, "id")),
          blad,
          naam,
          ref,
          kop: attr(root, "headerRowCount") !== "0",
          totaal: Number(attr(root, "totalsRowCount") ?? 0) > 0,
          banden: /^(1|true)$/.test(attr(stijl, "showRowStripes") ?? ""),
          filters: !!kind(root, "autoFilter"),
          stijl: attr(stijl, "name") ?? "",
          criteria: new Map(
            kinderen(kind(root, "autoFilter"), "filterColumn").map((e) => [
              Number(attr(e, "colId")),
              leesKolomFilter(p.lees(pad), e),
            ]),
          ),
          pad,
          kolommen,
        };
      }),
  );
}
export function gegevensTabelRef(t: Tabel) {
  const b = gebied(t.ref);
  return a1({ ...b, bottom: b.bottom - (t.totaal ? 1 : 0) });
}
export function nieuweTabelkeuze(ref: string, naam = "Table1"): Tabelkeuze {
  return {
    naam,
    ref,
    kop: true,
    totaal: false,
    banden: true,
    filters: true,
    stijl: "blue",
  };
}
function tableChild(xml: string, naam: string, fragment: string) {
  const root = leesXml(xml),
    old = kind(root, naam),
    order = [
      "autoFilter",
      "sortState",
      "tableColumns",
      "tableStyleInfo",
      "extLst",
    ],
    next = elementen(root).find(
      (e) => order.indexOf(e.lokaal) > order.indexOf(naam),
    ),
    pos = old?.start ?? next?.start ?? root.inhoudEind;
  return vervang(xml, [
    { start: pos, eind: old?.eind ?? pos, tekst: fragment },
  ]);
}
function celWaarden(h: WorkbookHandle, blad: number, ref: string) {
  const r = h.readCells({
    ranges: [
      { sheetId: h.sheetInfo().sheetIds[blad], range: { kind: "a1", a1: ref } },
    ],
  });
  if (!r.ok) throw new Tabelfout("tooLarge");
  return new Map(r.ranges[0].cells.flat().map((c) => [c.a1, c]));
}
function kolomNamen(h: WorkbookHandle, blad: number, b: Bereik, kop: boolean) {
  const cellen = kop
      ? celWaarden(h, blad, a1({ ...b, bottom: b.top }))
      : new Map(),
    gezien = new Set<string>();
  return Array.from({ length: b.right - b.left + 1 }, (_, i) => {
    const c = cellen.get(adres({ row: b.top, col: b.left + i }));
    let naam = kop
      ? (c?.displayText ?? (c?.value.kind === "text" ? c.value.value : ""))
      : "";
    naam = (naam || `Column${i + 1}`).slice(0, 255);
    const basis = naam;
    let n = 2;
    while (gezien.has(naam.toLowerCase())) naam = basis.slice(0, 250) + n++;
    gezien.add(naam.toLowerCase());
    return naam;
  });
}
/** Pure package transaction: native edits/formatting are staged in a disposable workbook. */
export function schrijfTabel(
  bytes: Uint8Array,
  blad: number,
  oudId: number | null,
  keuze: Tabelkeuze,
) {
  if (oudId !== null && (!keuze.filters || !keuze.kop)) {
    const oud = leesTabellen(bytes)[blad]?.find((t) => t.id === oudId);
    for (const kolom of oud?.criteria.keys() ?? [])
      bytes = schrijfTabelFilter(bytes, blad, oudId, kolom, null);
  }
  let p = new Pakket(bytes);
  const wb = werkmap(p),
    ws = wb.bladen[blad];
  if (!ws) throw new Tabelfout("invalidRange");
  if (leesBeveiliging(bytes).bladen[blad].actief)
    throw new Tabelfout("protectedSheet");
  const alle = leesTabellen(p),
    oud = oudId === null ? undefined : alle[blad].find((t) => t.id === oudId);
  if (oudId !== null && !oud) throw new Tabelfout("missingTable");
  const naam = keuze.naam.trim();
  if (naamFout(naam)) throw new Tabelfout("invalidName");
  if (oud && oud.naam !== naam) throw new Tabelfout("renameTable");
  if (
    alle
      .flat()
      .some((t) => t !== oud && t.naam.toLowerCase() === naam.toLowerCase()) ||
    kinderen(kind(wb.root, "definedNames"), "definedName").some(
      (n) => attr(n, "name")?.toLowerCase() === naam.toLowerCase(),
    )
  )
    throw new Tabelfout("duplicateName");
  let b: Bereik;
  try {
    b = gebied(keuze.ref);
  } catch {
    throw new Tabelfout("invalidRange");
  }
  if (
    b.bottom - b.top + 1 < 1 + (keuze.kop ? 1 : 0) ||
    b.bottom + (keuze.totaal ? 1 : 0) >= 1048576
  )
    throw new Tabelfout("invalidRange");
  const vol = { ...b, bottom: b.bottom + (keuze.totaal ? 1 : 0) };
  if ((vol.bottom - vol.top + 1) * (vol.right - vol.left + 1) > 100000)
    throw new Tabelfout("tooLarge");
  if (alle[blad].some((t) => t !== oud && overlap(gebied(t.ref), vol)))
    throw new Tabelfout("overlap");
  const sheet = leesXml(p.lees(ws.pad));
  const losFilter = kind(sheet, "autoFilter");
  // A worksheet filter on the same range becomes the table's filter below.
  if (
    losFilter &&
    overlap(gebied(attr(losFilter, "ref")!), vol) &&
    attr(losFilter, "ref") !== a1(b)
  )
    throw new Tabelfout("overlap");
  if (
    kinderen(kind(sheet, "mergeCells"), "mergeCell").some((e) =>
      overlap(gebied(attr(e, "ref")!), vol),
    )
  )
    throw new Tabelfout("mergedCells");
  const h = openWorkbook(bytes);
  let kolommen: Tabelkolom[],
    pad = oud?.pad ?? p.vrijPad("xl/tables/table#.xml"),
    id = oud?.id ?? Math.max(0, ...alle.flat().map((t) => t.id)) + 1;
  try {
    const namen = kolomNamen(h, blad, b, keuze.kop),
      oldB = oud ? gebied(oud.ref) : null;
    if (keuze.totaal) {
      const rij = celWaarden(h, blad, a1({ ...vol, top: vol.bottom }));
      for (const c of rij.values())
        if (
          c.value.kind !== "empty" &&
          !(
            oud?.totaal &&
            oldB?.bottom === vol.bottom &&
            bevat(oldB!, ontleedAdres(c.a1)!.row, ontleedAdres(c.a1)!.col)
          )
        )
          throw new Tabelfout("occupiedTotal");
    }
    let nextId = Math.max(0, ...(oud?.kolommen ?? []).map((k) => k.id));
    kolommen = namen.map((naam, i) => ({
      id: oud?.kolommen.find((k) => k.naam === naam)?.id ?? ++nextId,
      naam,
      totaal:
        keuze.totalen?.[i] ??
        (oud?.totaal ? oud.kolommen[i]?.totaal : undefined) ??
        (keuze.totaal && i > 0 ? "sum" : "none"),
      label:
        oud?.kolommen.find((k) => k.naam === naam)?.label ??
        (i === 0 ? (keuze.totaalLabel ?? "Total") : ""),
    }));
    const edits: { row: number; col: number; input: string }[] = [];
    if (keuze.kop)
      kolommen.forEach((k, i) =>
        edits.push({ row: b.top, col: b.left + i, input: "'" + k.naam }),
      );
    if (oud?.totaal && oldB && (oldB.bottom !== vol.bottom || !keuze.totaal))
      for (let col = oldB.left; col <= oldB.right; col++)
        edits.push({ row: oldB.bottom, col, input: "" });
    if (keuze.totaal)
      kolommen.forEach((k, i) => {
        if (
          oud?.totaal &&
          oldB?.bottom === vol.bottom &&
          oud.kolommen[i]?.naam === k.naam &&
          keuze.totalen?.[i] === undefined
        )
          return;
        const code = { sum: 109, count: 103, average: 101, min: 105, max: 104 }[
          k.totaal as Exclude<Totaalfunctie, "none">
        ];
        const ref = `${naam}[${k.naam.replace(/['\[\]#@]/g, (s) => "'" + s)}]`;
        edits.push({
          row: vol.bottom,
          col: b.left + i,
          input: code
            ? `=SUBTOTAL(${code},${ref})`
            : k.label
              ? "'" + k.label
              : "",
        });
      });
    installeerValidatie(h, bytes, () => false);
    if (edits.length) h.editCells(blad, edits);
    const eigenStijl =
      keuze.stijl === "existing"
        ? herkenTabelstijl(oud?.stijl ?? "")
        : keuze.stijl;
    if (eigenStijl !== "existing" && eigenStijl !== "none")
      maakTabelopmaak(
        h,
        blad,
        a1(vol),
        keuze.kop,
        keuze.totaal,
        keuze.banden,
        eigenStijl,
      );
    p = new Pakket(h.save());
  } finally {
    h.dispose();
  }
  let tableXml = oud
    ? p.lees(pad)
    : `<table xmlns="${NS}" id="${id}" name="${ontsnap(naam)}" displayName="${ontsnap(naam)}" ref="${a1(vol)}"/>`;
  const root = leesXml(tableXml),
    attrs = {
      ...root.attrs,
      id: String(id),
      name: xschrijf(naam),
      displayName: xschrijf(naam),
      ref: a1(vol),
      headerRowCount: keuze.kop ? "1" : "0",
      totalsRowCount: keuze.totaal ? "1" : "0",
      totalsRowShown: keuze.totaal ? "1" : "0",
    };
  tableXml = tagXml(
    root,
    tableXml.slice(root.inhoudStart, root.inhoudEind),
    attrs,
  );
  const oudeKolommen = kinderen(
    kind(leesXml(tableXml), "tableColumns"),
    "tableColumn",
  );
  const cols = kolommen!
    .map((k, i) => {
      const el = oudeKolommen.find((e) => Number(attr(e, "id")) === k.id),
        binnen = el ? tableXml.slice(el.inhoudStart, el.inhoudEind) : "";
      const behouden =
        oud?.totaal && keuze.totaal && keuze.totalen?.[i] === undefined;
      const attrs = {
        xmlns: NS,
        ...el?.attrs,
        id: k.id,
        name: xschrijf(k.naam),
        totalsRowFunction: behouden
          ? el?.attrs.totalsRowFunction
          : keuze.totaal && k.totaal !== "none"
            ? k.totaal
            : undefined,
        totalsRowLabel: behouden
          ? el?.attrs.totalsRowLabel
          : keuze.totaal && k.totaal === "none" && k.label
            ? k.label
            : undefined,
      };
      return `<tableColumn${attrTekst(attrs)}>${binnen}</tableColumn>`;
    })
    .join("");
  tableXml = tableChild(
    tableXml,
    "tableColumns",
    `<tableColumns xmlns="${NS}" count="${kolommen!.length}">${cols}</tableColumns>`,
  );
  const filter = kind(leesXml(tableXml), "autoFilter");
  const filterBron = filter ? tableXml : p.lees(ws.pad);
  const overgenomenFilter =
    filter ??
    (losFilter && attr(losFilter, "ref") === a1(b)
      ? kind(leesXml(filterBron), "autoFilter")
      : undefined);
  tableXml = tableChild(
    tableXml,
    "autoFilter",
    keuze.kop && keuze.filters
      ? `<autoFilter${attrTekst({ xmlns: NS, ...overgenomenFilter?.attrs, ref: a1(b) })}>${overgenomenFilter ? filterBron.slice(overgenomenFilter.inhoudStart, overgenomenFilter.inhoudEind) : ""}</autoFilter>`
      : "",
  );
  let stijl = oud?.stijl ?? "";
  if (keuze.stijl === "none") stijl = "";
  else if (keuze.stijl !== "existing")
    stijl = registreerTabelstijl(p, keuze.stijl);
  const styleInfo = kind(leesXml(tableXml), "tableStyleInfo");
  tableXml = tableChild(
    tableXml,
    "tableStyleInfo",
    `<tableStyleInfo${attrTekst({ xmlns: NS, ...styleInfo?.attrs, name: stijl, showRowStripes: keuze.banden ? 1 : 0, showColumnStripes: 0, showFirstColumn: 0, showLastColumn: 0 })}/>`,
  );
  p.schrijf(pad, tableXml);
  if (losFilter && attr(losFilter, "ref") === a1(b))
    sectie(p, ws.pad, "autoFilter", "");
  if (!oud) {
    const relId = p.voegRelatieToe(ws.pad, REL, pad);
    p.voegOverrideToe(
      pad,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml",
    );
    const xml = p.lees(ws.pad),
      list = kind(leesXml(xml), "tableParts"),
      parts = kinderen(list, "tablePart").map((e) =>
        xml.slice(e.start, e.eind),
      );
    parts.push(
      `<tablePart xmlns="${NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${relId}"/>`,
    );
    sectie(
      p,
      ws.pad,
      "tableParts",
      `<tableParts xmlns="${NS}" count="${parts.length}">${parts.join("")}</tableParts>`,
    );
  }
  return p.inpakken();
}
function overlap(a: Bereik, b: Bereik) {
  return (
    a.left <= b.right &&
    a.right >= b.left &&
    a.top <= b.bottom &&
    a.bottom >= b.top
  );
}

export function tabelFilter(t: Tabel): BladFilter {
  return { bereik: gebied(gegevensTabelRef(t)), kolommen: t.criteria };
}
export function tabelFilterCellen(
  h: WorkbookHandle,
  blad: number,
  f: BladFilter,
) {
  const b = { ...f.bereik, top: f.bereik.top + 1 };
  if (b.top > b.bottom) return new Map<number, FilterCel[]>();
  if ((b.bottom - b.top + 1) * (b.right - b.left + 1) > 100000)
    throw new Tabelfout("tooLarge");
  const r = h.readCells({
    ranges: [
      {
        sheetId: h.sheetInfo().sheetIds[blad],
        range: { kind: "a1", a1: a1(b) },
      },
    ],
  });
  if (!r.ok) throw new Tabelfout("tooLarge");
  return new Map(
    Array.from({ length: b.right - b.left + 1 }, (_, col) => [
      col,
      r.ranges[0].cells.map((row) => ({
        waarde: row[col].value,
        tekst: row[col].displayText,
      })),
    ]),
  );
}
/** Filter criteria and hidden rows are changed together in one disposable package. */
export function schrijfTabelFilter(
  bytes: Uint8Array,
  blad: number,
  id: number,
  kolom: number,
  keuze: KolomFilter | null,
) {
  const p = new Pakket(bytes),
    tabel = leesTabellen(p)[blad]?.find((t) => t.id === id);
  if (
    !tabel?.kop ||
    !tabel.filters ||
    kolom < 0 ||
    kolom >= tabel.kolommen.length
  )
    throw new Tabelfout("missingTable");
  const bescherming = leesBeveiliging(bytes).bladen[blad];
  if (bescherming.actief && !bescherming.rechten.autoFilter)
    throw new Tabelfout("protectedSheet");
  const ws = werkmap(p).bladen[blad],
    xml = p.lees(ws.pad),
    root = leesXml(xml);
  const verborgen = new Set(
    kinderen(kind(root, "sheetData"), "row")
      .filter((r) => /^(1|true)$/.test(attr(r, "hidden") ?? ""))
      .map((r) => Number(attr(r, "r")) - 1),
  );
  const voor = tabelFilter(tabel),
    na = { ...voor, kolommen: new Map(voor.kolommen) };
  if (keuze) na.kolommen.set(kolom, keuze);
  else na.kolommen.delete(kolom);
  const h = openWorkbook(bytes);
  try {
    const cellen = tabelFilterCellen(h, blad, voor),
      top = voor.bereik.top + 1,
      aantal = voor.bereik.bottom - top + 1;
    const oudZicht = zichtbareRijen(aantal, cellen, voor.kolommen, (r) =>
      verborgen.has(top + r),
    );
    const zicht = zichtbareRijen(aantal, cellen, na.kolommen, (r) =>
      verborgen.has(top + r),
    );
    // Side-by-side tables and the sheet filter also affect visibility of these rows.
    const andere = [
      ...leesTabellen(p)
        [blad].filter((t) => t.id !== id && t.kop)
        .map(tabelFilter),
      ...[leesAutoFilters(bytes).get(blad)].filter((f): f is BladFilter => !!f),
    ];
    for (const f of andere) {
      if (
        !f.kolommen.size ||
        f.bereik.bottom < top ||
        f.bereik.top >= voor.bereik.bottom
      )
        continue;
      const s = zichtbareRijen(
        f.bereik.bottom - f.bereik.top,
        tabelFilterCellen(h, blad, f),
        f.kolommen,
        (r) => verborgen.has(f.bereik.top + 1 + r),
      );
      for (let i = 0; i < aantal; i++) {
        const j = top + i - f.bereik.top - 1;
        if (j >= 0 && j < s.length && !s[j]) zicht[i] = false;
      }
    }
    const ops = zicht.flatMap((aan, i) => {
      const row = top + i;
      // Rows hidden independently of the old criteria remain hidden.
      if (aan && verborgen.has(row) && oudZicht[i]) return [];
      return [
        {
          type: "setRowHeight" as const,
          sheet: blad,
          row,
          height: aan ? null : 0,
        },
      ];
    });
    if (ops.length) h.applyOps(ops);
    const uit = new Pakket(h.save());
    let tableXml = uit.lees(tabel.pad),
      filter = kind(leesXml(tableXml), "autoFilter")!;
    const behouden = elementen(filter)
      .filter((e) => e.lokaal !== "filterColumn")
      .map((e) => tableXml.slice(e.start, e.eind))
      .join("");
    tableXml = tableChild(
      tableXml,
      "autoFilter",
      `<autoFilter${attrTekst({ xmlns: NS, ...filter.attrs })}>${[
        ...na.kolommen,
      ]
        .sort((a, b) => a[0] - b[0])
        .map(([k, f]) => kolomFilterXml(k, f))
        .join("")}${behouden}</autoFilter>`,
    );
    uit.schrijf(tabel.pad, tableXml);
    return uit.inpakken();
  } finally {
    h.dispose();
  }
}

export function sorteerTabel(
  bytes: Uint8Array,
  blad: number,
  id: number,
  kolom: number,
  aflopend: boolean,
) {
  const t = leesTabellen(bytes)[blad]?.find((t) => t.id === id);
  if (!t || kolom < 0 || kolom >= t.kolommen.length)
    throw new Tabelfout("missingTable");
  if (leesBeveiliging(bytes).bladen[blad].actief)
    throw new Tabelfout("protectedSheet");
  const h = openWorkbook(bytes);
  try {
    const b = gebied(gegevensTabelRef(t));
    b.top += t.kop ? 1 : 0;
    if (b.top >= b.bottom) return bytes;
    if ((b.bottom - b.top + 1) * (b.right - b.left + 1) > 100000)
      throw new Tabelfout("tooLarge");
    const r = h.readCells({
      ranges: [
        {
          sheetId: h.sheetInfo().sheetIds[blad],
          range: { kind: "a1", a1: a1(b) },
        },
      ],
    });
    if (!r.ok) throw new Tabelfout("tooLarge");
    const volgorde = sorteerRijen(
      r.ranges[0].cells.map((row) => row.map((c) => c.value)),
      [{ kolom, aflopend, op: "waarden" }],
      { hoofdlettergevoelig: false },
    );
    if (t.criteria.size) {
      const zicht = zichtbareRijen(
        b.bottom - b.top + 1,
        tabelFilterCellen(h, blad, tabelFilter(t)),
        t.criteria,
      );
      const ops = zicht.flatMap((aan, i) =>
        aan
          ? []
          : [
              {
                type: "setRowHeight" as const,
                sheet: blad,
                row: b.top + i,
                height: null,
              },
            ],
      );
      if (ops.length) h.applyOps(ops);
    }
    const cellen = h.rangeCells(blad, a1(b)),
      opmaak = h.captureFormat(blad, a1(b));
    const edits = volgorde.flatMap((bron, naar) =>
      cellen[bron].map((c, i) => ({
        row: b.top + naar,
        col: b.left + i,
        input: c.isFormula
          ? "=" + verschuifFormule(c.input.slice(1), naar - bron, 0)
          : c.input,
      })),
    );
    installeerValidatie(h, bytes, () => false);
    h.editCells(blad, edits);
    opmaak.formats = volgorde.flatMap((bron) =>
      opmaak.formats.slice(bron * opmaak.columns, (bron + 1) * opmaak.columns),
    );
    if (opmaak.sourceFormats) {
      const source = opmaak.sourceFormats;
      opmaak.sourceFormats = volgorde.flatMap((bron) =>
        source.slice(bron * opmaak.columns, (bron + 1) * opmaak.columns),
      );
    }
    if (opmaak.sourceStyles) {
      const source = opmaak.sourceStyles;
      opmaak.sourceStyles = volgorde.flatMap((bron) =>
        source.slice(bron * opmaak.columns, (bron + 1) * opmaak.columns),
      );
    }
    h.applyFormat(blad, a1(b), opmaak);
    const stijl = herkenTabelstijl(t.stijl);
    if (stijl !== "existing" && stijl !== "none")
      maakTabelopmaak(h, blad, t.ref, t.kop, t.totaal, t.banden, stijl);
    let uit = h.save();
    if (t.filters)
      uit = schrijfTabelFilter(
        uit,
        blad,
        id,
        kolom,
        t.criteria.get(kolom) ?? null,
      );
    return uit;
  } finally {
    h.dispose();
  }
}

const cache = new WeakMap<
  WorkbookHandle,
  { metadata: Tabel[][]; versie: string; bladen: Map<string, Tabel[]> }
>();
export function laadTabellen(h: WorkbookHandle, bytes: Uint8Array) {
  cache.set(h, {
    metadata: leesTabellen(bytes),
    versie: "",
    bladen: new Map(),
  });
}
export function tabellen(h: WorkbookHandle, blad: number): Tabel[] {
  const c = cache.get(h);
  if (!c) return [];
  const versie = h.version();
  if (c.versie !== versie) {
    c.versie = versie;
    c.bladen.clear();
  }
  const id = h.sheetInfo().sheetIds[blad];
  if (c.bladen.has(id)) return c.bladen.get(id)!;
  const r = h.exportStructured({
    scope: [{ sheet: blad }],
    maxCells: 1,
    includeHiddenSheets: true,
    includeDefinedNames: false,
  });
  if (!r.ok) throw new Tabelfout("damagedTable");
  const native =
    r.content.sheets.find(
      (s) => s.anchor.kind === "sheet" && s.anchor.sheet.index === blad,
    )?.tables ?? [];
  const result = native.flatMap((t) => {
    const bron = c.metadata.flat().find((m) => m.naam === t.name);
    if (!bron || t.anchor.kind !== "range") return [];
    return [
      {
        ...bron,
        blad,
        ref: t.anchor.a1,
        kop: t.headerRows > 0,
        totaal: t.totalsRows > 0,
        kolommen: t.columns.map(
          (naam, i) =>
            bron.kolommen.find((k) => k.naam === naam) ?? {
              id: i + 1,
              naam,
              totaal: "none" as const,
              label: "",
            },
        ),
      },
    ];
  });
  c.bladen.set(id, result);
  return result;
}
