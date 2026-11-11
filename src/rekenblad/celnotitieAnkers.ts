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
  rid,
  tekstVan,
  vervang,
} from "../grafieken/xml";
import { adres, ontleedVerwijzing } from "../lint/rekenblad-logica";
import {
  leesCelnotities,
  Notitiefout,
  verplaatsCelnotities,
  type Celnotitie,
} from "./celnotities";
import { isNotitieAnker, NOTITIEANKER } from "./notitieAnkerNaam";
import {
  leesDiscussies,
  verplaatsDiscussies,
  type Discussie,
} from "./discussies";

function alleAnnotaties(p: Pakket) {
  const discussies = leesDiscussies(p);
  return leesCelnotities(p).map((notities, i) => [
    ...notities.map((notitie) => ({
      notitie,
      discussie: undefined as Discussie | undefined,
    })),
    ...(discussies[i] ?? []).map((discussie) => ({
      discussie,
      notitie: {
        cel: discussie.cel,
        tekst: discussie.berichten[0]?.tekst ?? "",
        auteur: discussie.berichten[0]?.auteur ?? "",
        zichtbaar: false,
      },
    })),
  ]);
}

function werkboek(p: Pakket) {
  const hoofd = p
    .relaties("")
    .find((r) => !r.extern && r.type.endsWith("/officeDocument"));
  const pad = hoofd ? Pakket.doelPad("", hoofd.target) : "xl/workbook.xml";
  const xml = p.lees(pad),
    root = leesXml(xml);
  const bladen = kinderen(kind(root, "sheets"), "sheet").map((s) => ({
    naam: attr(s, "name") ?? "",
    pad: p.doel(pad, rid(s) ?? ""),
  }));
  return { pad, xml, root, bladen };
}
const ankerNaam = (blad: number, cel: string) =>
  `${NOTITIEANKER}${blad}_${cel}`;
const bladRef = (naam: string) => `'${naam.replace(/'/g, "''")}'`;
function doel(formule: string) {
  if (formule.includes("#REF!")) return null;
  const ref = ontleedVerwijzing(formule.replace(/^=/, ""));
  if (
    !ref?.blad ||
    ref.bereik.top !== ref.bereik.bottom ||
    ref.bereik.left !== ref.bereik.right
  )
    throw new Notitiefout("damagedNotes");
  return {
    blad: ref.blad,
    cel: adres({ row: ref.bereik.top, col: ref.bereik.left }),
  };
}
/** Voegt alleen bij laden verborgen celverwijzingen toe. De kern schuift deze mee,
 * inclusief Undo/Redo. Bestaande namen buiten de gereserveerde reeks blijven staan. */
export function metCelnotitieAnkers(bytes: Uint8Array) {
  const p = new Pakket(bytes),
    notities = alleAnnotaties(p),
    wb = werkboek(p);
  const dn = kind(wb.root, "definedNames");
  const namen = kinderen(dn, "definedName");
  if (
    !notities.some((l) => l.length) &&
    !namen.some((n) => isNotitieAnker(attr(n, "name") ?? ""))
  )
    return bytes;
  if (
    namen.some(
      (n) => isNotitieAnker(attr(n, "name") ?? "") && attr(n, "hidden") !== "1",
    )
  )
    throw new Notitiefout("damagedNotes");
  const behouden = namen
    .filter((n) => !isNotitieAnker(attr(n, "name") ?? ""))
    .map((n) => wb.xml.slice(n.start, n.eind));
  const q = (naam: string) =>
    (wb.root.voorvoegsel ? wb.root.voorvoegsel + ":" : "") + naam;
  const nieuw = notities.flatMap((lijst, blad) =>
    lijst.map(({ notitie: n }) => {
      const a = /^([A-Z]+)(\d+)$/.exec(n.cel)!;
      return `<${q("definedName")} name="${ankerNaam(blad, n.cel)}" hidden="1">${ontsnap(`${bladRef(wb.bladen[blad].naam)}!$${a[1]}$${a[2]}`)}</${q("definedName")}>`;
    }),
  );
  const blok = `<${q("definedNames")}${dn ? attrTekst(dn.attrs) : ""}>${behouden.join("")}${nieuw.join("")}</${q("definedNames")}>`;
  const volgende = elementen(wb.root).find((e) =>
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
  p.schrijf(
    wb.pad,
    vervang(wb.xml, [
      {
        start: dn?.start ?? volgende?.start ?? wb.root.inhoudEind,
        eind: dn?.eind ?? volgende?.start ?? wb.root.inhoudEind,
        tekst: blok,
      },
    ]),
  );
  return p.inpakken();
}
type NotitieHandle = {
  sheetInfo(): Pick<
    ReturnType<WorkbookHandle["sheetInfo"]>,
    "sheetIds" | "sheetNames"
  >;
} & Partial<Pick<WorkbookHandle, "exportStructured">>;
interface Anker {
  naam: string | null;
  notitie: Celnotitie;
  deel: string | null;
  discussie?: Discussie;
}
const perWerkboek = new WeakMap<object, Map<string, Anker[]>>();
export function laadCelnotities(handle: NotitieHandle, bytes: Uint8Array) {
  const p = new Pakket(bytes),
    lijst = alleAnnotaties(p),
    wb = werkboek(p);
  const namen = new Set(
    kinderen(kind(wb.root, "definedNames"), "definedName")
      .filter((n) => attr(n, "hidden") === "1")
      .map((n) => attr(n, "name")),
  );
  perWerkboek.set(
    handle,
    new Map(
      handle.sheetInfo().sheetIds.map((id, i) => [
        id,
        (lijst[i] ?? []).map(({ notitie, discussie }) => ({
          notitie,
          discussie,
          deel: wb.bladen[i]?.pad
            ? (p
                .relaties(wb.bladen[i].pad!)
                .filter(
                  (r) =>
                    !r.extern &&
                    r.type.endsWith(
                      discussie ? "/threadedComment" : "/comments",
                    ),
                )
                .map((r) => Pakket.doelPad(wb.bladen[i].pad!, r.target))[0] ??
              null)
            : null,
          naam: namen.has(ankerNaam(i, notitie.cel))
            ? ankerNaam(i, notitie.cel)
            : null,
        })),
      ]),
    ),
  );
}
/** Alleen de posities lezen; notitietekst blijft eenmalig per document gecachet. */
export function celnotities(handle: NotitieHandle, blad: number): Celnotitie[] {
  return annotaties(handle, blad)
    .filter((a) => !a.discussie)
    .map((a) => a.notitie);
}
export function celDiscussies(
  handle: NotitieHandle,
  blad: number,
): Discussie[] {
  return annotaties(handle, blad).flatMap((a) =>
    a.discussie ? [{ ...a.discussie, cel: a.notitie.cel }] : [],
  );
}
function annotaties(handle: NotitieHandle, blad: number): Anker[] {
  const info = handle.sheetInfo(),
    cache = perWerkboek.get(handle);
  const lokaal = cache?.get(info.sheetIds[blad]) ?? [];
  const ankers = [...(cache?.values() ?? [])].flat();
  if (!ankers.some((a) => a.naam) || !handle.exportStructured) return lokaal;
  const r = handle.exportStructured({
    scope: [{ sheet: blad, range: "A1" }],
    maxCells: 1,
    includeHiddenNames: true,
    includeHiddenSheets: true,
  });
  if (!r.ok) return [];
  const namen = new Map(
    r.content.definedNames
      .filter((n) => n.hidden)
      .map((n) => [n.name, n.formula]),
  );
  return ankers.flatMap((a) => {
    if (!a.naam) return lokaal.includes(a) ? [a] : [];
    const formule = namen.get(a.naam);
    if (!formule) return [];
    const d = doel(formule);
    return d && d.blad === info.sheetNames[blad]
      ? [{ ...a, notitie: { ...a.notitie, cel: d.cel } }]
      : [];
  });
}
/** Past voor elke bewaarroute de notities aan de door de kern bijgehouden ankers aan. */
export function bewaarCelnotitieAnkers(
  handle: { sheetInfo(): { sheetNames: string[]; sheetIds?: string[] } },
  bytes: Uint8Array,
) {
  const cache = perWerkboek.get(handle);
  if (!cache || ![...cache.values()].some((l) => l.some((a) => a.naam)))
    return bytes;
  const p = new Pakket(bytes),
    wb = werkboek(p);
  const namen = new Map(
    kinderen(kind(wb.root, "definedNames"), "definedName")
      .filter((n) => attr(n, "hidden") === "1")
      .map((n) => [attr(n, "name"), tekstVan(n)]),
  );
  const info = handle.sheetInfo();
  const wijzigingen = new Map<number, Map<string, string | null>>();
  for (const a of [...cache.values()].flat()) {
    if (!a.naam) continue;
    const i = wb.bladen.findIndex(
      (b) =>
        b.pad &&
        p
          .relaties(b.pad)
          .some(
            (r) =>
              !r.extern &&
              r.type.endsWith(a.discussie ? "/threadedComment" : "/comments") &&
              Pakket.doelPad(b.pad!, r.target) === a.deel,
          ),
    );
    if (i < 0) continue; // Het oorspronkelijke blad is verwijderd.
    const formule = namen.get(a.naam);
    if (formule === undefined) throw new Notitiefout("damagedNotes");
    const d = doel(formule);
    if (d && d.blad !== info.sheetNames[i])
      throw new Notitiefout("damagedNotes");
    const cel = d?.cel ?? null;
    if (cel !== a.notitie.cel) {
      if (!wijzigingen.has(i)) wijzigingen.set(i, new Map());
      wijzigingen.get(i)!.set(a.notitie.cel, cel);
    }
  }
  return verplaatsCelnotities(
    verplaatsDiscussies(bytes, wijzigingen),
    wijzigingen,
  );
}
