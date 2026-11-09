import type { WorkbookHandle, XlsxDefinedName } from "@betteroffice/xlsx";
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
} from "../grafieken/xml";
import { ontleedVerwijzing } from "../lint/rekenblad-logica";
import { NS, a1, gebied, kindToevoegen, werkmap } from "./werkboekXml";

const PREFIX = "_OpenAEC_Validation_";
export const isValidatieAnker = (naam: string) =>
  naam.toLowerCase().startsWith(PREFIX.toLowerCase());

/** Verborgen lokale namen laten de kern verwijzingen verschuiven in dezelfde Undo-transactie. */
export function metValidatieAnkers(bytes: Uint8Array) {
  const p = new Pakket(bytes),
    wb = werkmap(p),
    dn = kind(wb.root, "definedNames");
  const oud = kinderen(dn, "definedName"),
    nieuw: string[] = [];
  if (
    oud.some(
      (n) =>
        isValidatieAnker(attr(n, "name") ?? "") && attr(n, "hidden") !== "1",
    )
  )
    throw new Error("De interne validatienamen zijn beschadigd.");
  for (const [blad, b] of wb.bladen.entries()) {
    const root = leesXml(p.lees(b.pad));
    for (const [i, r] of kinderen(
      kind(root, "dataValidations"),
      "dataValidation",
    ).entries()) {
      const naam = (suffix: string) => `${PREFIX}${blad}_${i}_${suffix}`;
      const voeg = (suffix: string, formule: string) =>
        nieuw.push(
          `<definedName xmlns="${NS}"${attrTekst({ name: naam(suffix), localSheetId: String(blad), hidden: "1" })}>${ontsnap(formule)}</definedName>`,
        );
      for (const [j, ref] of (attr(r, "sqref") ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .entries()) {
        voeg(
          "r" + j,
          `'${b.naam.replace(/'/g, "''")}'!${a1(gebied(ref)).replace(/([A-Z]+)(\d+)/g, "$$$1$$$2")}`,
        );
      }
      for (const f of ["formula1", "formula2"]) {
        const el = kind(r, f);
        if (el) voeg(f, tekstVan(el));
      }
    }
  }
  if (
    !nieuw.length &&
    !oud.some((n) => isValidatieAnker(attr(n, "name") ?? ""))
  )
    return bytes;
  const behouden = oud
    .filter((n) => !isValidatieAnker(attr(n, "name") ?? ""))
    .map((n) => wb.xml.slice(n.start, n.eind))
    .join("");
  const blok = `<definedNames ${attrTekst({ xmlns: NS, ...(dn?.attrs ?? {}) })}>${behouden}${nieuw.join("")}</definedNames>`;
  if (dn)
    p.schrijf(
      wb.pad,
      vervang(wb.xml, [{ start: dn.start, eind: dn.eind, tekst: blok }]),
    );
  else {
    const na = elementen(wb.root).find((e) =>
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
      na
        ? vervang(wb.xml, [{ start: na.start, eind: na.start, tekst: blok }])
        : kindToevoegen(wb.xml, wb.root, blok),
    );
  }
  return p.inpakken();
}
export function namenAlle(h: WorkbookHandle) {
  const namen: XlsxDefinedName[] = [];
  let offset = 0;
  do {
    const r = h.listDefinedNames({ offset, limit: 100 });
    namen.push(...r.items);
    if (r.nextOffset === null) break;
    offset = r.nextOffset;
  } while (offset < 100000);
  return namen;
}
export function bewaarValidatieAnkers(h: WorkbookHandle, bytes: Uint8Array) {
  const namen = namenAlle(h).filter((n) => isValidatieAnker(n.name));
  if (!namen.length) return bytes;
  const p = new Pakket(bytes),
    wb = werkmap(p);
  for (const [blad, b] of wb.bladen.entries()) {
    const xml = p.lees(b.pad),
      root = leesXml(xml),
      dv = kind(root, "dataValidations");
    if (!dv) continue;
    const wijzigingen: { start: number; eind: number; tekst: string }[] = [];
    let aantal = 0;
    for (const [i, r] of kinderen(dv, "dataValidation").entries()) {
      const eigen = namen.filter(
        (n) =>
          n.scope === blad && new RegExp(`^${PREFIX}\\d+_${i}_`).test(n.name),
      );
      if (!eigen.length) {
        aantal++;
        continue;
      }
      const refs = eigen
        .filter((n) => /_r\d+$/.test(n.name))
        .flatMap((n) => {
          if (n.refersTo.includes("#REF!")) return [];
          const ref = ontleedVerwijzing(n.refersTo);
          return ref ? [a1(ref.bereik)] : [];
        });
      if (!refs.length) {
        wijzigingen.push({ start: r.start, eind: r.eind, tekst: "" });
        continue;
      }
      aantal++;
      let fragment = xml.slice(r.start, r.eind);
      const lokaal = leesXml(fragment),
        inner: typeof wijzigingen = [];
      for (const f of ["formula1", "formula2"]) {
        const node = kind(lokaal, f),
          naam = eigen.find((n) => n.name.endsWith("_" + f));
        if (node && naam)
          inner.push({
            start: node.inhoudStart,
            eind: node.inhoudEind,
            tekst: ontsnap(naam.refersTo),
          });
      }
      fragment = vervang(fragment, inner);
      const klaar = leesXml(fragment);
      const openEind = fragment.indexOf(">");
      fragment = `<${klaar.naam}${attrTekst({ ...klaar.attrs, sqref: refs.join(" ") })}>${fragment.slice(openEind + 1)}`;
      wijzigingen.push({ start: r.start, eind: r.eind, tekst: fragment });
    }
    let uit = vervang(xml, wijzigingen);
    const dr = kind(leesXml(uit), "dataValidations")!;
    const inhoud = uit.slice(dr.inhoudStart, dr.inhoudEind);
    uit = vervang(uit, [
      {
        start: dr.start,
        eind: dr.eind,
        tekst: aantal
          ? `<${dr.naam}${attrTekst({ ...dr.attrs, count: String(aantal) })}>${inhoud}</${dr.naam}>`
          : "",
      },
    ]);
    p.schrijf(b.pad, uit);
  }
  return p.inpakken();
}
