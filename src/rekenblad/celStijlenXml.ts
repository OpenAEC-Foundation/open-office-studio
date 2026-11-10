/** Batch style assignment in one worksheet pass, retaining cell values and unknown XML. */
import { Pakket } from "../grafieken/pakket";
import {
  attr,
  attrTekst,
  kind,
  kinderen,
  leesXml,
  vervang,
  type XmlElement,
} from "../grafieken/xml";
import { adres, ontleedAdres, type Bereik } from "../lint/rekenblad-logica";
import { NS, tagXml } from "./werkboekXml";

export function zetBereikStijlen(
  p: Pakket,
  pad: string,
  bereik: Bereik,
  kies: (row: number, col: number, oud: number) => number,
) {
  if (
    (bereik.bottom - bereik.top + 1) * (bereik.right - bereik.left + 1) >
    100000
  )
    throw new Error("selectionTooLarge");
  const xml = p.lees(pad),
    root = leesXml(xml),
    data = kind(root, "sheetData");
  if (!data) throw new Error("damagedStyles");
  const kolommen = kinderen(kind(root, "cols"), "col").map((c) => ({
    van: Number(attr(c, "min")) - 1,
    tot: Number(attr(c, "max")) - 1,
    stijl: Number(attr(c, "style") ?? 0),
  }));
  const rijen = kinderen(data, "row"),
    indices = new Map<XmlElement, number>();
  let vorig = -1;
  for (const r of rijen) {
    const nr = attr(r, "r") ? Number(attr(r, "r")) - 1 : vorig + 1;
    if (!Number.isInteger(nr) || nr <= vorig || nr >= 1048576)
      throw new Error("damagedStyles");
    indices.set(r, nr);
    vorig = nr;
  }
  const celXml = (row: number, col: number, stijl: number) =>
    `<c xmlns="${NS}" r="${adres({ row, col })}" s="${stijl}"/>`;
  function rijXml(row: number, el?: XmlElement) {
    const rijStijl = el && attr(el, "s");
    const standaard = (col: number) =>
      rijStijl !== undefined && rijStijl !== null
        ? Number(rijStijl)
        : (kolommen.find((c) => col >= c.van && col <= c.tot)?.stijl ?? 0);
    if (!el)
      return `<row xmlns="${NS}" r="${row + 1}">${Array.from(
        { length: bereik.right - bereik.left + 1 },
        (_, i) => {
          const col = bereik.left + i;
          return celXml(row, col, kies(row, col, standaard(col)));
        },
      ).join("")}</row>`;
    const cellen = kinderen(el, "c");
    let col = bereik.left,
      vorigeKolom = -1,
      cursor = el.inhoudStart,
      inhoud = "";
    for (const c of cellen) {
      const ref = attr(c, "r"),
        loc = ref ? ontleedAdres(ref) : { row, col: vorigeKolom + 1 };
      if (!loc || loc.row !== row || loc.col <= vorigeKolom)
        throw new Error("damagedStyles");
      vorigeKolom = loc.col;
      inhoud += xml.slice(cursor, c.start);
      while (col < loc.col && col <= bereik.right) {
        inhoud += celXml(row, col, kies(row, col, standaard(col)));
        col++;
      }
      const attrs = { ...c.attrs };
      if (!ref) attrs.r = adres(loc);
      if (loc.col >= bereik.left && loc.col <= bereik.right) {
        attrs.s = String(
          kies(row, loc.col, Number(attr(c, "s") ?? standaard(loc.col))),
        );
        col = loc.col + 1;
      }
      inhoud += tagXml(c, xml.slice(c.inhoudStart, c.inhoudEind), attrs);
      cursor = c.eind;
    }
    while (col <= bereik.right) {
      inhoud += celXml(row, col, kies(row, col, standaard(col)));
      col++;
    }
    inhoud += xml.slice(cursor, el.inhoudEind);
    return tagXml(el, inhoud, { ...el.attrs, r: String(row + 1) });
  }
  let volgende = bereik.top,
    cursor = data.inhoudStart,
    inhoud = "";
  for (const r of rijen) {
    const row = indices.get(r)!;
    inhoud += xml.slice(cursor, r.start);
    while (volgende < row && volgende <= bereik.bottom) {
      inhoud += rijXml(volgende++);
    }
    if (row >= bereik.top && row <= bereik.bottom) {
      inhoud += rijXml(row, r);
      volgende = row + 1;
    } else if (!attr(r, "r"))
      inhoud += tagXml(r, xml.slice(r.inhoudStart, r.inhoudEind), {
        ...r.attrs,
        r: String(row + 1),
      });
    else inhoud += xml.slice(r.start, r.eind);
    cursor = r.eind;
  }
  while (volgende <= bereik.bottom) inhoud += rijXml(volgende++);
  inhoud += xml.slice(cursor, data.inhoudEind);
  p.schrijf(
    pad,
    vervang(xml, [
      {
        start: data.start,
        eind: data.eind,
        tekst: `<${data.naam}${attrTekst(data.attrs)}>${inhoud}</${data.naam}>`,
      },
    ]),
  );
}
