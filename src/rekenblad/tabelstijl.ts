import type { WorkbookHandle } from "@betteroffice/xlsx";
import { Pakket } from "../grafieken/pakket";
import {
  attr,
  attrTekst,
  elementen,
  kind,
  kinderen,
  leesXml,
  vervang,
} from "../grafieken/xml";
import { NS, tagXml, werkmap } from "./werkboekXml";

export const TABELSTIJLEN = {
  blue: { kop: "#365F91", band: "#DCE6F1", licht: "#FFFFFF", tekst: "#222222" },
  green: {
    kop: "#375623",
    band: "#E2EFDA",
    licht: "#FFFFFF",
    tekst: "#222222",
  },
  orange: {
    kop: "#9E480E",
    band: "#FCE4D6",
    licht: "#FFFFFF",
    tekst: "#222222",
  },
} as const;
export type Tabelstijl = keyof typeof TABELSTIJLEN | "none" | "existing";
export const herkenTabelstijl = (naam: string): Tabelstijl =>
  (Object.keys(TABELSTIJLEN).find((s) => naam.startsWith(`OpenAEC_${s}_`)) as
    | keyof typeof TABELSTIJLEN
    | undefined) ?? (naam ? "existing" : "none");
/** Register a standard custom table style and its differential formats; never overwrite a source style. */
export function registreerTabelstijl(
  p: Pakket,
  soort: keyof typeof TABELSTIJLEN,
) {
  const wb = werkmap(p),
    rel = p
      .relaties(wb.pad)
      .find((r) => !r.extern && r.type.endsWith("/styles"));
  if (!rel) throw new Error("missingStyles");
  const pad = Pakket.doelPad(wb.pad, rel.target);
  let xml = p.lees(pad),
    root = leesXml(xml),
    dxfs = kind(root, "dxfs");
  const kleur = TABELSTIJLEN[soort],
    rgb = (kleur: string) => "FF" + kleur.slice(1).toUpperCase();
  const fill = (kleur: string) =>
    `<fill><patternFill patternType="solid"><fgColor rgb="${rgb(kleur)}"/><bgColor indexed="64"/></patternFill></fill>`;
  const font = (kleur: string, vet = false) =>
    `<font>${vet ? "<b/>" : ""}<color rgb="${rgb(kleur)}"/></font>`;
  const fragmenten = [
    font(kleur.tekst) + fill(kleur.licht),
    font("#FFFFFF", true) + fill(kleur.kop),
    fill(kleur.band),
    fill(kleur.licht),
    font(kleur.tekst, true) +
      fill(kleur.band) +
      '<border><top style="thin"><color rgb="FF808080"/></top></border>',
  ].map((s) => `<dxf xmlns="${NS}">${s}</dxf>`);
  const eerste = kinderen(dxfs, "dxf").length;
  if (dxfs)
    p.schrijf(
      pad,
      vervang(xml, [
        {
          start: dxfs.start,
          eind: dxfs.eind,
          tekst: tagXml(
            dxfs,
            xml.slice(dxfs.inhoudStart, dxfs.inhoudEind) + fragmenten.join(""),
            { ...dxfs.attrs, count: String(eerste + fragmenten.length) },
          ),
        },
      ]),
    );
  else {
    const pos =
      elementen(root).find((e) =>
        ["tableStyles", "colors", "extLst"].includes(e.lokaal),
      )?.start ?? root.inhoudEind;
    p.schrijf(
      pad,
      vervang(xml, [
        {
          start: pos,
          eind: pos,
          tekst: `<dxfs xmlns="${NS}" count="${fragmenten.length}">${fragmenten.join("")}</dxfs>`,
        },
      ]),
    );
  }
  xml = p.lees(pad);
  root = leesXml(xml);
  const tableStyles = kind(root, "tableStyles"),
    bestaand = kinderen(tableStyles, "tableStyle");
  let i = 1;
  while (bestaand.some((e) => attr(e, "name") === `OpenAEC_${soort}_${i}`)) i++;
  const naam = `OpenAEC_${soort}_${i}`;
  const types = [
    "wholeTable",
    "headerRow",
    "firstRowStripe",
    "secondRowStripe",
    "totalRow",
  ];
  const fragment = `<tableStyle xmlns="${NS}"${attrTekst({ name: naam, pivot: 0, table: 1, count: types.length })}>${types.map((type, index) => `<tableStyleElement${attrTekst({ type, dxfId: eerste + index, ...(type.includes("Stripe") ? { size: 1 } : {}) })}/>`).join("")}</tableStyle>`;
  if (tableStyles)
    p.schrijf(
      pad,
      vervang(xml, [
        {
          start: tableStyles.start,
          eind: tableStyles.eind,
          tekst: tagXml(
            tableStyles,
            xml.slice(tableStyles.inhoudStart, tableStyles.inhoudEind) +
              fragment,
            { ...tableStyles.attrs, count: String(bestaand.length + 1) },
          ),
        },
      ]),
    );
  else {
    const pos =
      elementen(root).find((e) => ["colors", "extLst"].includes(e.lokaal))
        ?.start ?? root.inhoudEind;
    p.schrijf(
      pad,
      vervang(xml, [
        {
          start: pos,
          eind: pos,
          tekst: `<tableStyles xmlns="${NS}" count="1">${fragment}</tableStyles>`,
        },
      ]),
    );
  }
  return naam;
}
/** A single native format batch retains number formats, protection and source XF provenance. */
export function maakTabelopmaak(
  h: WorkbookHandle,
  blad: number,
  ref: string,
  kop: boolean,
  totaal: boolean,
  banden: boolean,
  soort: keyof typeof TABELSTIJLEN,
) {
  const kleur = TABELSTIJLEN[soort],
    f = h.captureFormat(blad, ref);
  f.sourceFormats = f.sourceFormats?.map((v, i) => ({
    ...(v as object),
    derived_from:
      (v as { derived_from?: number; source_xf?: number }).derived_from ??
      (v as { source_xf?: number }).source_xf ??
      f.sourceStyles?.[i] ??
      0,
  }));
  f.formats = f.formats.map((v, i) => {
    const o = v as { font: Record<string, unknown>; [key: string]: unknown },
      rij = Math.floor(i / f.columns),
      header = kop && rij === 0,
      total = totaal && rij === f.rows - 1;
    const band = banden && (rij - (kop ? 1 : 0)) % 2 === 0;
    const fill = header ? kleur.kop : total || band ? kleur.band : kleur.licht;
    return {
      ...o,
      font: {
        ...o.font,
        ...(header || total ? { bold: true } : {}),
        color: { Rgb: header ? "#FFFFFF" : kleur.tekst },
      },
      fill: { Solid: { Rgb: fill } },
    };
  });
  h.applyFormat(blad, ref, f);
}
