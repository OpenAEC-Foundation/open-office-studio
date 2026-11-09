import { Pakket } from "../grafieken/pakket";
import {
  attr,
  attrTekst,
  kind,
  kinderen,
  leesXml,
  rid,
  vervang,
  type XmlElement,
} from "../grafieken/xml";
import {
  adres,
  ontleedVerwijzing,
  type Bereik,
} from "../lint/rekenblad-logica";

export const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
export function werkmap(p: Pakket) {
  const r = p
    .relaties("")
    .find((r) => !r.extern && r.type.endsWith("/officeDocument"));
  const pad = r ? Pakket.doelPad("", r.target) : "xl/workbook.xml";
  const xml = p.lees(pad),
    root = leesXml(xml);
  const bladen = kinderen(kind(root, "sheets"), "sheet").map((s) => ({
    naam: attr(s, "name") ?? "",
    pad: p.doel(pad, rid(s) ?? "")!,
  }));
  return { pad, xml, root, bladen };
}
export function gebied(ref: string): Bereik {
  const b = ontleedVerwijzing(ref.replace(/\$/g, ""))?.bereik;
  if (!b || b.top < 0 || b.left < 0 || b.bottom >= 1048576 || b.right >= 16384)
    throw new Error("Ongeldig celbereik: " + ref);
  return b;
}
export const a1 = (b: Bereik) =>
  `${adres({ row: b.top, col: b.left })}:${adres({ row: b.bottom, col: b.right })}`;
export const bevat = (b: Bereik, row: number, col: number) =>
  row >= b.top && row <= b.bottom && col >= b.left && col <= b.right;
export function tagXml(el: XmlElement, inhoud: string, attrs = el.attrs) {
  return `<${el.naam}${attrTekst(attrs)}>${inhoud}</${el.naam}>`;
}
export function zetAttrs(
  xml: string,
  el: XmlElement,
  wijzigingen: Record<string, string | null>,
) {
  const attrs = { ...el.attrs };
  for (const [naam, v] of Object.entries(wijzigingen)) {
    if (v === null) delete attrs[naam];
    else attrs[naam] = v;
  }
  return vervang(xml, [
    {
      start: el.start,
      eind: el.eind,
      tekst: tagXml(el, xml.slice(el.inhoudStart, el.inhoudEind), attrs),
    },
  ]);
}
const volgorde =
  "sheetPr dimension sheetViews sheetFormatPr cols sheetData sheetCalcPr sheetProtection protectedRanges scenarios autoFilter sortState dataConsolidate customSheetViews mergeCells phoneticPr conditionalFormatting dataValidations hyperlinks printOptions pageMargins pageSetup headerFooter rowBreaks colBreaks customProperties cellWatches ignoredErrors smartTags drawing legacyDrawing legacyDrawingHF picture oleObjects controls webPublishItems tableParts extLst".split(
    " ",
  );
export function sectie(p: Pakket, pad: string, naam: string, tekst: string) {
  const xml = p.lees(pad),
    root = leesXml(xml),
    oud = kind(root, naam);
  if (oud)
    p.schrijf(pad, vervang(xml, [{ start: oud.start, eind: oud.eind, tekst }]));
  else if (tekst) {
    const volgende = root.kinderen.find(
      (k): k is XmlElement =>
        k.soort === "element" &&
        volgorde.indexOf(k.lokaal) > volgorde.indexOf(naam),
    );
    const pos = volgende?.start ?? root.inhoudEind;
    p.schrijf(pad, vervang(xml, [{ start: pos, eind: pos, tekst }]));
  }
}
export function kindToevoegen(
  xml: string,
  ouder: XmlElement,
  fragment: string,
) {
  return ouder.leeg
    ? vervang(xml, [
        {
          start: ouder.start,
          eind: ouder.eind,
          tekst: tagXml(ouder, fragment),
        },
      ])
    : vervang(xml, [
        { start: ouder.inhoudEind, eind: ouder.inhoudEind, tekst: fragment },
      ]);
}
export function celStijl(
  p: Pakket,
  pad: string,
  row: number,
  col: number,
  stijl: number,
) {
  let xml = p.lees(pad),
    root = leesXml(xml),
    data = kind(root, "sheetData");
  if (!data) throw new Error("Werkblad mist celgegevens.");
  let rij = kinderen(data, "row").find((r) => Number(attr(r, "r")) === row + 1);
  const cel =
    rij && kinderen(rij, "c").find((c) => attr(c, "r") === adres({ row, col }));
  if (cel) xml = zetAttrs(xml, cel, { s: String(stijl) });
  else {
    const fragment = `<c xmlns="${NS}" r="${adres({ row, col })}" s="${stijl}"/>`;
    if (rij) {
      const na = kinderen(rij, "c").find(
        (c) => gebied(attr(c, "r")!).left > col,
      );
      if (na)
        xml = vervang(xml, [
          { start: na.start, eind: na.start, tekst: fragment },
        ]);
      else xml = kindToevoegen(xml, rij, fragment);
    } else {
      const fragmentRij = `<row xmlns="${NS}" r="${row + 1}">${fragment}</row>`;
      const na = kinderen(data, "row").find(
        (r) => Number(attr(r, "r")) > row + 1,
      );
      xml = na
        ? vervang(xml, [
            { start: na.start, eind: na.start, tekst: fragmentRij },
          ])
        : kindToevoegen(xml, data, fragmentRij);
    }
  }
  p.schrijf(pad, xml);
}
