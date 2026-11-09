import type { WorkbookHandle } from "@betteroffice/xlsx";
import { Pakket } from "../grafieken/pakket";
import {
  attr,
  attrTekst,
  elementen,
  kind,
  kinderen,
  leesXml,
  ontsnap,
  tekstVan,
  vervang,
  zoekAlle,
} from "../grafieken/xml";
import { adres, ontleedVerwijzing } from "../lint/rekenblad-logica";
import { leesTekenobjecten, type Tekenobject } from "./tekenobjecten";

const PREFIX = "_OpenAEC_Object_";
export const isTekenAnker = (naam: string) =>
  /^_OpenAEC_Object_\d+_[a-f\d]+_\d+_[ft]$/i.test(naam);
function naam(o: Tekenobject, eind = false) {
  const pad = Array.from(new TextEncoder().encode(o.tekening), (c) =>
    c.toString(16).padStart(2, "0"),
  ).join("");
  return `${PREFIX}${o.blad}_${pad}_${o.id}_${eind ? "t" : "f"}`;
}
function werkboek(p: Pakket) {
  const rel = p
    .relaties("")
    .find((r) => !r.extern && r.type.endsWith("/officeDocument"));
  const pad = rel ? Pakket.doelPad("", rel.target) : "xl/workbook.xml";
  const xml = p.lees(pad),
    root = leesXml(xml);
  const bladen = kinderen(kind(root, "sheets"), "sheet").map(
    (s) => attr(s, "name") ?? "",
  );
  return { pad, xml, root, bladen };
}
export function metTekenAnkers(bytes: Uint8Array): Uint8Array {
  const objecten = leesTekenobjecten(bytes).filter(
    (o) => !o.absoluut && /^\d+$/.test(o.id),
  );
  if (!objecten.length) return bytes;
  const p = new Pakket(bytes),
    wb = werkboek(p),
    dn = kind(wb.root, "definedNames");
  const bestaand = kinderen(dn, "definedName");
  if (
    bestaand.some(
      (n) => isTekenAnker(attr(n, "name") ?? "") && attr(n, "hidden") !== "1",
    )
  )
    throw new Error("Reserved drawing anchor is not hidden");
  const q = (s: string) =>
    (wb.root.voorvoegsel ? `${wb.root.voorvoegsel}:` : "") + s;
  const behouden = bestaand
    .filter((n) => !isTekenAnker(attr(n, "name") ?? ""))
    .map((n) => wb.xml.slice(n.start, n.eind));
  const nieuwe = objecten.flatMap((o) =>
    [false, ...(o.einde ? [true] : [])].map((eind) => {
      const cel = eind ? o.einde! : o.plek;
      const ref = `'${wb.bladen[o.blad].replace(/'/g, "''")}'!${adres(cel).replace(/^([A-Z]+)(\d+)$/, "$$$1$$$2")}`;
      if (naam(o, eind).length > 255)
        throw new Error("Drawing anchor name is too long");
      return `<${q("definedName")} name="${naam(o, eind)}" hidden="1">${ontsnap(ref)}</${q("definedName")}>`;
    }),
  );
  const xml = `<${q("definedNames")}${dn ? attrTekst(dn.attrs) : ""}>${behouden.join("")}${nieuwe.join("")}</${q("definedNames")}>`;
  const volgend = elementen(wb.root).find((e) =>
    [
      "calcPr",
      "oleSize",
      "customWorkbookViews",
      "pivotCaches",
      "smartTagPr",
      "smartTagTypes",
      "webPublishing",
      "fileRecoveryPr",
      "webPublishObjects",
      "extLst",
    ].includes(e.lokaal),
  );
  const n = dn?.start ?? volgend?.start ?? wb.root.inhoudEind;
  p.schrijf(
    wb.pad,
    vervang(wb.xml, [{ start: n, eind: dn?.eind ?? n, tekst: xml }]),
  );
  return p.inpakken();
}
const cache = new WeakMap<object, Tekenobject[]>();
const bewaakt = new WeakSet<object>();
export function laadTekenobjecten(h: WorkbookHandle, bytes: Uint8Array) {
  const objecten = leesTekenobjecten(bytes);
  cache.set(h, objecten);
  if (!objecten.length || bewaakt.has(h)) return;
  bewaakt.add(h);
  const toepassen = h.applyOps;
  h.applyOps = function (ops) {
    return toepassen.call(h, metAnkerHerstel(h, ops));
  };
}
/** Een verwijderd ankervak wordt de eerste overblijvende cel, geen verdwenen afbeelding. */
function metAnkerHerstel(h: WorkbookHandle, ops: unknown[]): unknown[] {
  const lijst = ops as {
    type?: string;
    sheet?: number;
    at?: number;
    count?: number;
  }[];
  if (!lijst.some((op) => op.type === "deleteRows" || op.type === "deleteCols"))
    return ops;
  // Werkboekstructuur in hetzelfde batch laat de engine zelf afhandelen.
  if (
    lijst.some((op) =>
      ["moveSheet", "removeSheet", "renameSheet"].includes(op.type ?? ""),
    )
  )
    return ops;
  const info = h.sheetInfo(),
    r = h.exportStructured({
      scope: [{ sheet: 0, range: "A1" }],
      maxCells: 1,
      includeHiddenNames: true,
      includeHiddenSheets: true,
    });
  if (!r.ok) return ops;
  const ankers = r.content.definedNames
    .filter((n) => n.hidden && isTekenAnker(n.name))
    .flatMap((n) => {
      const d = doel(n.formula);
      return d?.blad
        ? [
            {
              naam: n.name,
              blad: info.sheetNames.indexOf(d.blad),
              row: d.bereik.top,
              col: d.bereik.left,
              herstel: false,
            },
          ]
        : [];
    });
  for (const op of lijst) {
    if (
      !/^(insert|delete)(Rows|Cols)$/.test(op.type ?? "") ||
      !Number.isInteger(op.at) ||
      !Number.isInteger(op.count) ||
      op.at! < 0 ||
      op.count! < 1
    )
      continue;
    for (const a of ankers)
      if (a.blad === op.sheet) {
        const veld = op.type!.endsWith("Rows") ? "row" : "col",
          start = op.at!,
          aantal = op.count!;
        if (op.type!.startsWith("insert")) {
          if (a[veld] >= start) a[veld] += aantal;
        } else if (a[veld] >= start + aantal) a[veld] -= aantal;
        else if (a[veld] >= start) {
          a[veld] = start;
          a.herstel = true;
        }
      }
  }
  return [
    ...ops,
    ...ankers
      .filter((a) => a.herstel)
      .map((a) => ({
        type: "setDefinedName",
        name: a.naam,
        hidden: true,
        refers_to: `'${info.sheetNames[a.blad].replace(/'/g, "''")}'!${adres(a).replace(/^([A-Z]+)(\d+)$/, "$$$1$$$2")}`,
      })),
  ];
}
function doel(formule: string | undefined) {
  if (!formule || formule.includes("#REF!")) return null;
  return ontleedVerwijzing(formule.replace(/^=/, ""));
}
/** Alleen de kleine namenlijst lezen; afbeeldingen en XML worden per document geladen. */
export function tekenobjecten(h: WorkbookHandle, blad: number): Tekenobject[] {
  const lokaal = cache.get(h) ?? [],
    info = h.sheetInfo();
  if (!lokaal.length) return [];
  const r = h.exportStructured({
    scope: [{ sheet: blad, range: "A1" }],
    maxCells: 1,
    includeDefinedNames: true,
    includeHiddenNames: true,
    includeHiddenSheets: true,
  });
  if (!r.ok) return [];
  const namen = new Map(
    r.content.definedNames
      .filter((n) => n.hidden)
      .map((n) => [n.name, n.formula]),
  );
  return lokaal.flatMap((o) => {
    const ref = namen.get(naam(o));
    if (!ref) return o.blad === blad ? [o] : [];
    const d = doel(ref);
    if (!d || d.blad !== info.sheetNames[blad]) return [];
    const eind = doel(namen.get(naam(o, true)));
    return [
      {
        ...o,
        blad,
        plek: { ...o.plek, row: d.bereik.top, col: d.bereik.left },
        einde:
          o.einde && eind
            ? { ...o.einde, row: eind.bereik.top, col: eind.bereik.left }
            : o.einde,
      },
    ];
  });
}
export function bewaarTekenAnkers(h: object, bytes: Uint8Array) {
  const bron = cache.get(h);
  if (!bron?.length) return bytes;
  const p = new Pakket(bytes),
    wb = werkboek(p);
  const namen = new Map(
    kinderen(kind(wb.root, "definedNames"), "definedName")
      .filter((n) => attr(n, "hidden") === "1")
      .map((n) => [attr(n, "name"), tekstVan(n)]),
  );
  const wijzigingen = new Map<
    string,
    { start: number; eind: number; tekst: string }[]
  >();
  for (const o of bron) {
    const formule = namen.get(naam(o));
    if (!formule || !p.heeft(o.tekening)) continue;
    const xml = p.lees(o.tekening),
      root = leesXml(xml);
    const anker = elementen(root).find((e) =>
      zoekAlle(e, "cNvPr").some((n) => attr(n, "id") === o.id),
    );
    if (!anker) continue;
    const lijst = wijzigingen.get(o.tekening) ?? [];
    wijzigingen.set(o.tekening, lijst);
    const start = doel(formule);
    // Bij een onbekende externe bewerking liever het bestaande object behouden
    // dan op basis van een beschadigde naam beeldgegevens verwijderen.
    if (!start) continue;
    for (const eind of [false, true]) {
      const loc = eind ? doel(namen.get(naam(o, true))) : start,
        el = kind(anker, eind ? "to" : "from");
      if (!loc || !el) continue;
      for (const [veld, waarde] of [
        ["row", loc.bereik.top],
        ["col", loc.bereik.left],
      ] as const) {
        const n = kind(el, veld);
        if (n && tekstVan(n) !== String(waarde))
          lijst.push({
            start: n.inhoudStart,
            eind: n.inhoudEind,
            tekst: String(waarde),
          });
      }
    }
  }
  let veranderd = false;
  for (const [pad, lijst] of wijzigingen)
    if (lijst.length) {
      veranderd = true;
      p.schrijf(pad, vervang(p.lees(pad), lijst));
    }
  return veranderd ? p.inpakken() : bytes;
}
