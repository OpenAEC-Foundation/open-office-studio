import {
  openWorkbook,
  type WorkbookHandle,
  type XlsxCellValue,
} from "@betteroffice/xlsx";
import { Pakket } from "../grafieken/pakket";
import {
  attr,
  attrTekst,
  elementen,
  kind,
  kinderen,
  leesXml,
  ontsnap,
  rid,
  tekstVan,
  vervang,
} from "../grafieken/xml";
import { adres, ontleedAdres, type Bereik } from "../lint/rekenblad-logica";
import { isDatumnotatie } from "../lint/rekenblad-reeks";
import { a1, gebied, werkmap, tagXml, NS } from "./werkboekXml";
import { leesBeveiliging } from "./beveiliging";
import { leesStructuurBeveiliging } from "./structuurbeveiliging";
import { leesTabellen, gegevensTabelRef } from "./tabellen";
import { naamFout } from "./namen";
import { installeerValidatie } from "./gegevensvalidatie";
import {
  Draaifout,
  MAX_DRAAIBRON,
  type DraaiBron,
  type DraaiIndeling,
} from "./draaitabelRekenen";
import {
  maakDraaicache,
  cacheDefinitie,
  DRAAI_REL,
  DRAAI_R_NS,
} from "./draaitabelCache";
import { maakDraairaster } from "./draaitabelRaster";
import { draaiDefinitie, DRAAI_EXT } from "./draaitabelXml";

export interface DraaiBronkeuze {
  blad: number;
  ref: string;
  tabel?: string;
}
export interface DraaiDoel {
  blad: number | null;
  nieuwBlad: string;
  cel: string;
}
export interface DraaiKeuze extends DraaiIndeling {
  naam: string;
  bron: DraaiBronkeuze;
  doel: DraaiDoel;
}
export interface Draaitabel {
  pad: string;
  blad: number;
  naam: string;
  ref: string;
  cacheId: number;
  cachePad: string;
  keuze: DraaiKeuze | null;
}
const soort = "application/vnd.openxmlformats-officedocument.spreadsheetml.";
const overlap = (a: Bereik, b: Bereik) =>
  a.left <= b.right &&
  a.right >= b.left &&
  a.top <= b.bottom &&
  a.bottom >= b.top;
const decode = (s: string) =>
  s.replace(/_x([0-9a-f]{4})_/gi, (_, n: string) =>
    String.fromCharCode(parseInt(n, 16)),
  );
function buiten(a: Bereik, b: Bereik): Bereik[] {
  if (!overlap(a, b)) return [a];
  const i = {
      top: Math.max(a.top, b.top),
      bottom: Math.min(a.bottom, b.bottom),
      left: Math.max(a.left, b.left),
      right: Math.min(a.right, b.right),
    },
    out: Bereik[] = [];
  if (a.top < i.top) out.push({ ...a, bottom: i.top - 1 });
  if (a.bottom > i.bottom) out.push({ ...a, top: i.bottom + 1 });
  if (a.left < i.left) out.push({ ...i, left: a.left, right: i.left - 1 });
  if (a.right > i.right) out.push({ ...i, left: i.right + 1, right: a.right });
  return out;
}

export function leesDraaitabellen(bytes: Uint8Array | Pakket): Draaitabel[] {
  const p = bytes instanceof Pakket ? bytes : new Pakket(bytes),
    wb = werkmap(p);
  const caches = new Map(
    kinderen(kind(wb.root, "pivotCaches"), "pivotCache").map((c) => [
      Number(attr(c, "cacheId")),
      p.doel(wb.pad, rid(c) ?? ""),
    ]),
  );
  return wb.bladen.flatMap((s, blad) =>
    p
      .relaties(s.pad)
      .filter((r) => !r.extern && r.type.endsWith("/pivotTable"))
      .map((r) => {
        const pad = Pakket.doelPad(s.pad, r.target),
          xml = p.lees(pad),
          root = leesXml(xml),
          cacheId = Number(attr(root, "cacheId")),
          cachePad = caches.get(cacheId),
          ref = attr(kind(root, "location"), "ref") ?? "";
        if (!cachePad || !ref || root.lokaal !== "pivotTableDefinition")
          throw new Draaifout("unsupportedPivot");
        gebied(ref);
        const ext = kinderen(kind(root, "extLst"), "ext").find(
            (e) => attr(e, "uri") === DRAAI_EXT,
          ),
          cfg = ext && elementen(ext).find((e) => e.lokaal === "config");
        let keuze: DraaiKeuze | null = null;
        if (cfg) {
          const text = tekstVan(cfg);
          if (text.length < 100000) {
            try {
              keuze = JSON.parse(text);
            } catch {
              /* An unknown configuration never changes preserved source parts. */
            }
          }
        }
        if (keuze) keuze.doel.blad = blad;
        return {
          pad,
          blad,
          naam: decode(attr(root, "name") ?? ""),
          ref,
          cacheId,
          cachePad,
          keuze,
        };
      }),
  );
}
function lees(h: WorkbookHandle, blad: number, ref: string) {
  const r = h.readCells({
    ranges: [
      { sheetId: h.sheetInfo().sheetIds[blad], range: { kind: "a1", a1: ref } },
    ],
  });
  if (!r.ok) throw new Draaifout("invalidSource");
  return r.ranges[0].cells;
}
export function leesDraaibron(
  h: WorkbookHandle,
  bytes: Uint8Array,
  keuze: DraaiBronkeuze,
) {
  const p = new Pakket(bytes),
    wb = werkmap(p);
  let blad = keuze.blad,
    b = gebied(keuze.ref),
    kop = true,
    namen: string[] | undefined,
    tabelnaam: string | undefined;
  if (keuze.tabel) {
    const tabel = leesTabellen(p)
      .flat()
      .find((t) => t.naam.toLowerCase() === keuze.tabel!.toLowerCase());
    if (!tabel) throw new Draaifout("invalidSource");
    blad = tabel.blad;
    b = gebied(gegevensTabelRef(tabel));
    kop = tabel.kop;
    namen = tabel.kolommen.map((k) => k.naam);
    tabelnaam = tabel.naam;
  }
  if (!wb.bladen[blad]) throw new Draaifout("invalidSource");
  const width = b.right - b.left + 1,
    top = b.top + (kop ? 1 : 0),
    count = Math.max(0, b.bottom - top + 1);
  if (!count || count * width > MAX_DRAAIBRON)
    throw new Draaifout(count ? "tooLarge" : "invalidSource");
  if (!namen)
    namen = lees(h, blad, a1({ ...b, bottom: b.top }))[0].map(
      (c) => c.displayText,
    );
  const rijen: XlsxCellValue[][] = [],
    tekst: string[][] = [];
  const per = Math.max(1, Math.floor(40000 / width));
  for (let row = top; row <= b.bottom; row += per) {
    const block = lees(
      h,
      blad,
      a1({ ...b, top: row, bottom: Math.min(b.bottom, row + per - 1) }),
    );
    rijen.push(...block.map((row) => row.map((c) => c.value)));
    tekst.push(...block.map((row) => row.map((c) => c.displayText)));
  }
  const datumKolommen = Array.from({ length: width }, (_, i) => i).filter(
    (i) => {
      const first = rijen.findIndex((r) => r[i].kind === "number");
      return (
        first >= 0 &&
        isDatumnotatie(
          h.selectionFormatting(
            blad,
            adres({ row: top + first, col: b.left + i }),
          ).numberFormatPattern,
        )
      );
    },
  );
  const bron: DraaiBron = {
    koppen: namen,
    rijen,
    tekst,
    datumKolommen,
    datum1904: /^(1|true)$/.test(
      attr(kind(wb.root, "workbookPr"), "date1904") ?? "",
    ),
  };
  const source = tabelnaam
    ? `<worksheetSource name="${ontsnap(tabelnaam)}"/>`
    : `<worksheetSource${attrTekst({ sheet: wb.bladen[blad].naam, ref: a1(b) })}/>`;
  return { bron, source, blad, bereik: b };
}
function zetWerkmapCaches(p: Pakket, entries: string[]) {
  const wb = werkmap(p),
    old = kind(wb.root, "pivotCaches"),
    order =
      "fileVersion fileSharing workbookPr workbookProtection bookViews sheets functionGroups externalReferences definedNames calcPr oleSize customWorkbookViews pivotCaches smartTagPr smartTagTypes webPublishing fileRecoveryPr webPublishObjects extLst".split(
        " ",
      );
  const pos =
    old?.start ??
    elementen(wb.root).find(
      (e) => order.indexOf(e.lokaal) > order.indexOf("pivotCaches"),
    )?.start ??
    wb.root.inhoudEind;
  p.schrijf(
    wb.pad,
    vervang(wb.xml, [
      {
        start: pos,
        eind: old?.eind ?? pos,
        tekst: `<pivotCaches xmlns="${NS}">${entries.join("")}</pivotCaches>`,
      },
    ]),
  );
}
export function draaitabelBereik(t: Draaitabel): Bereik {
  const b = gebied(t.ref);
  if (t.keuze) {
    const cel = ontleedAdres(t.keuze.doel.cel);
    if (cel && t.keuze.filters.length) b.top = Math.min(b.top, cel.row);
  }
  return b;
}
/** Disposable native workbook + standard package parts: failure never changes input bytes. */
export function schrijfDraaitabel(
  bytes: Uint8Array,
  oudPad: string | null,
  cfg: DraaiKeuze,
) {
  const p0 = new Pakket(bytes),
    oud = oudPad
      ? leesDraaitabellen(p0).find((t) => t.pad === oudPad)
      : undefined;
  if (oudPad && !oud) throw new Draaifout("missingPivot");
  if (oud && cfg.doel.blad !== oud.blad) throw new Draaifout("invalidTarget");
  if (oud && !oud.keuze) throw new Draaifout("unsupportedPivot");
  if (naamFout(cfg.naam)) throw new Draaifout("invalidName");
  if (
    leesDraaitabellen(p0).some(
      (t) =>
        t.pad !== oudPad && t.naam.toLowerCase() === cfg.naam.toLowerCase(),
    )
  )
    throw new Draaifout("duplicateName");
  const cel = ontleedAdres(cfg.doel.cel);
  if (!cel) throw new Draaifout("invalidTarget");
  if (cfg.doel.blad === null && leesStructuurBeveiliging(bytes))
    throw new Draaifout("protectedWorkbook");
  const h = openWorkbook(bytes);
  try {
    const data = leesDraaibron(h, bytes, cfg.bron),
      cache = maakDraaicache(data.bron, cfg),
      raster = maakDraairaster(data.bron, cfg, cache.resultaat, cfg.naam);
    const pageRows = cfg.filters.length ? cfg.filters.length + 2 : 0,
      top = cel.row + pageRows,
      range = {
        top,
        left: cel.col,
        bottom: top + raster.rows - 1,
        right: cel.col + raster.cols - 1,
      },
      full = { ...range, top: cel.row };
    if (
      range.bottom >= 1048576 ||
      range.right >= 16384 ||
      raster.rows * raster.cols > 100000
    )
      throw new Draaifout("tooLarge");
    let blad = cfg.doel.blad;
    if (blad === null) {
      blad = h.sheetCount();
      h.applyOps([
        { type: "addSheet", index: blad, name: cfg.doel.nieuwBlad.trim() },
      ]);
    } else {
      if (!h.sheetInfo().sheetNames[blad]) throw new Draaifout("invalidTarget");
      if (leesBeveiliging(bytes).bladen[blad].actief)
        throw new Draaifout("protectedSheet");
      if (blad === data.blad && overlap(full, data.bereik))
        throw new Draaifout("overlap");
      for (const t of leesTabellen(p0)[blad]) {
        const b = gebied(t.ref);
        if (
          overlap(full, {
            ...b,
            right: Math.min(16383, b.right + 1),
            bottom: Math.min(1048575, b.bottom + 1),
          })
        )
          throw new Draaifout("overlap");
      }
      if (
        leesDraaitabellen(p0).some(
          (t) =>
            t.pad !== oudPad &&
            t.blad === blad &&
            overlap(full, draaitabelBereik(t)),
        )
      )
        throw new Draaifout("overlap");
      const ws = werkmap(p0).bladen[blad],
        root = leesXml(p0.lees(ws.pad));
      if (
        kinderen(kind(root, "mergeCells"), "mergeCell").some((m) =>
          overlap(full, gebied(attr(m, "ref")!)),
        )
      )
        throw new Draaifout("mergedCells");
      const old = oud && oud.blad === blad ? draaitabelBereik(oud) : null;
      for (const row of lees(h, blad, a1(full)))
        for (const c of row) {
          const at = ontleedAdres(c.a1)!;
          if (
            (c.value.kind !== "empty" || c.formula !== null) &&
            !(
              old &&
              at.row >= old.top &&
              at.row <= old.bottom &&
              at.col >= old.left &&
              at.col <= old.right
            )
          )
            throw new Draaifout("occupiedTarget");
        }
    }
    installeerValidatie(h, bytes, () => false);
    const steps = [];
    if (oud) {
      const b = draaitabelBereik(oud);
      if ((b.bottom - b.top + 1) * (b.right - b.left + 1) > 100000)
        throw new Draaifout("tooLarge");
      for (const rest of buiten(b, full))
        steps.push({
          op: "setCellValues" as const,
          target: {
            sheetId: h.sheetInfo().sheetIds[oud.blad],
            range: { kind: "a1" as const, a1: a1(rest) },
          },
          values: Array.from({ length: rest.bottom - rest.top + 1 }, () =>
            Array.from(
              { length: rest.right - rest.left + 1 },
              (): XlsxCellValue => ({ kind: "empty" }),
            ),
          ),
        });
    }
    const values: XlsxCellValue[][] = Array.from({ length: pageRows }, (_, i) =>
      Array.from(
        { length: raster.cols },
        (_, j): XlsxCellValue =>
          i < cfg.filters.length && j < 2
            ? {
                kind: "text",
                value:
                  j === 0
                    ? data.bron.koppen[cfg.filters[i].kolom]
                    : cfg.filters[i].gekozen?.length === 1
                      ? (cache.resultaat.leden
                          .get(cfg.filters[i].id)
                          ?.find(
                            (m) => m.sleutel === cfg.filters[i].gekozen![0],
                          )?.tekst ?? "(All)")
                      : cfg.filters[i].gekozen
                        ? "(Multiple items)"
                        : "(All)",
              }
            : { kind: "empty" },
      ),
    );
    values.push(...raster.cellen);
    steps.push({
      op: "setCellValues" as const,
      target: {
        sheetId: h.sheetInfo().sheetIds[blad],
        range: { kind: "a1" as const, a1: a1(full) },
      },
      values,
    });
    const result = h.applyEdits({ expectVersion: h.version(), steps });
    if (!result.ok) throw new Error(result.failure.message);
    // Rebuilding can move an old total/header into the data area. Remove the
    // styling authored by the previous layout before marking the new layout.
    if (oud)
      h.patchRangeStyle(blad, a1(draaitabelBereik(oud)), {
        clear: ["bold", "fillColor"],
      });
    h.patchRangeStyle(blad, a1({ ...range, bottom: top + raster.headers }), {
      bold: true,
      fillColor: "#DCE6F1",
    });
    if (raster.grandRow)
      h.patchRangeStyle(blad, a1({ ...range, top: range.bottom }), {
        bold: true,
      });
    for (let vi = 0; vi < cfg.waarden.length; vi++)
      for (
        let col = range.left + raster.left + vi;
        col <= range.right;
        col += cfg.waarden.length
      )
        h.setNumberFormat(
          blad,
          a1({
            top: top + raster.headers + 1,
            bottom: range.bottom,
            left: col,
            right: col,
          }),
          {
            type: "custom",
            pattern:
              cfg.waarden[vi].weergave === "normal" ? "General" : "0.00%",
          },
        );
    const p = new Pakket(h.save()),
      wb = werkmap(p),
      ws = wb.bladen[blad],
      pad = oud?.pad ?? p.vrijPad("xl/pivotTables/pivotTable#.xml");
    const caches = kinderen(kind(wb.root, "pivotCaches"), "pivotCache"),
      privateCache = oud && p.verwijzingenNaar(oud.cachePad).length === 2;
    const cacheId = privateCache
        ? oud.cacheId
        : Math.max(0, ...caches.map((c) => Number(attr(c, "cacheId")))) + 1,
      cachePad = privateCache
        ? oud.cachePad
        : p.vrijPad("xl/pivotCache/pivotCacheDefinition#.xml"),
      recordPad = p.vrijPad("xl/pivotCache/pivotCacheRecords#.xml");
    const oudeRecords = p
      .relaties(cachePad)
      .filter((r) => !r.extern && r.type.endsWith("/pivotCacheRecords"));
    for (const r of oudeRecords) p.verwijderRelatie(cachePad, r.id);
    const recordRel = p.voegRelatieToe(
      cachePad,
      DRAAI_REL + "pivotCacheRecords",
      recordPad,
    );
    p.schrijf(recordPad, cache.records);
    p.schrijf(
      cachePad,
      cacheDefinitie(cache, data.source, recordRel, data.bron.rijen.length),
    );
    for (const r of oudeRecords) {
      const oudRecordPad = Pakket.doelPad(cachePad, r.target);
      if (!p.verwijzingenNaar(oudRecordPad).length) {
        p.verwijder(oudRecordPad);
        p.verwijderOverride(oudRecordPad);
      }
    }
    p.voegOverrideToe(recordPad, soort + "pivotCacheRecords+xml");
    p.voegOverrideToe(cachePad, soort + "pivotCacheDefinition+xml");
    let cacheRel = privateCache
      ? rid(caches.find((c) => Number(attr(c, "cacheId")) === cacheId))!
      : p.voegRelatieToe(wb.pad, DRAAI_REL + "pivotCacheDefinition", cachePad);
    if (!privateCache)
      zetWerkmapCaches(p, [
        ...caches.map((c) => wb.xml.slice(c.start, c.eind)),
        `<pivotCache xmlns="${NS}" xmlns:r="${DRAAI_R_NS}" cacheId="${cacheId}" r:id="${cacheRel}"/>`,
      ]);
    for (const r of p
      .relaties(pad)
      .filter((r) => r.type.endsWith("/pivotCacheDefinition")))
      p.verwijderRelatie(pad, r.id);
    p.voegRelatieToe(pad, DRAAI_REL + "pivotCacheDefinition", cachePad);
    if (!oud) p.voegRelatieToe(ws.pad, DRAAI_REL + "pivotTable", pad);
    else if (oud.blad !== blad) throw new Draaifout("invalidTarget");
    const stored = {
      ...cfg,
      bron: { ...cfg.bron, blad: data.blad, ref: a1(data.bereik) },
      doel: { ...cfg.doel, blad },
    };
    p.schrijf(
      pad,
      draaiDefinitie(
        cache,
        cfg,
        cfg.naam,
        cacheId,
        a1(range),
        raster.headers,
        raster.left,
        stored,
      ),
    );
    p.voegOverrideToe(pad, soort + "pivotTable+xml");
    return { bytes: p.inpakken(), blad, ref: a1(full), pad };
  } finally {
    h.dispose();
  }
}
