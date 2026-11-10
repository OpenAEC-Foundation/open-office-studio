/** Normative font/fill fallback for named built-in table styles (ECMA-376 Annex D). */
import feiten from "./ingebouwdeTabelstijlFeiten.json";
import { attrTekst, leesXml } from "../grafieken/xml";
import type { Pakket } from "../grafieken/pakket";
import { NS } from "./werkboekXml";
import { leesDxfStijlen, type DxfStijl } from "./voorwaardelijke-dxf";

interface Kleur {
  theme: number;
  tint?: number;
}
interface Feit {
  type: string;
  size: number;
  fill?: Kleur;
  fontColor?: Kleur;
  bold?: boolean;
}
export interface TabelstijlElement {
  type: string;
  size: number;
  stijl: DxfStijl;
}
const catalogus = feiten.stijlen as Record<string, Feit[]>;

/** Reuse the workbook-aware DXF reader; the temporary XML never enters the package. */
export function leesIngebouwdeTabelstijl(
  p: Pakket,
  werkmap: string,
  naam: string,
): TabelstijlElement[] | undefined {
  if (!Object.hasOwn(catalogus, naam)) return undefined;
  const elementen = catalogus[naam];
  const kleur = (c: Kleur) => `<color${attrTekst({ ...c })}/>`;
  const xml = `<styleSheet xmlns="${NS}"><dxfs count="${elementen.length}">${elementen
    .map((e) => {
      const font =
        e.fontColor || e.bold !== undefined
          ? `<font>${e.bold === undefined ? "" : `<b val="${e.bold ? 1 : 0}"/>`}${e.fontColor ? kleur(e.fontColor) : ""}</font>`
          : "";
      const fill = e.fill
        ? `<fill><patternFill patternType="solid"><fgColor${attrTekst({ ...e.fill })}/></patternFill></fill>`
        : "";
      return `<dxf>${font}${fill}</dxf>`;
    })
    .join("")}</dxfs></styleSheet>`;
  const stijlen = leesDxfStijlen(p, werkmap, leesXml(xml));
  return elementen.map((e, i) => ({
    type: e.type,
    size: e.size,
    stijl: stijlen[i],
  }));
}
