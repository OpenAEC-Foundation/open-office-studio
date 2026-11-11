/** Kleine pakketbewerkingen voor eigenschappen die de kern nog niet wijzigt. */
import { Pakket } from "../grafieken/pakket";
import {
  attr,
  kinderen,
  kind,
  leesXml,
  ontsnap,
  rid,
  type XmlElement,
} from "../grafieken/xml";

export function werkbladDeel(pakket: Pakket, index: number) {
  const relatie = pakket
    .relaties("")
    .find((r) => !r.extern && r.type.endsWith("/officeDocument"));
  if (!relatie) throw new Error("Missing workbook relationship");
  const werkmap = Pakket.doelPad("", relatie.target),
    root = leesXml(pakket.lees(werkmap));
  const blad = kinderen(kind(root, "sheets"), "sheet")[index];
  const pad = blad && pakket.doel(werkmap, rid(blad) ?? "");
  if (!blad || !pad) throw new Error("Missing worksheet relationship");
  return { werkmap, root, blad, pad };
}

/** Alleen de begintag wijzigen; inhoud en onbekende opmaak blijven behouden. */
export function xmlAttribuut(
  xml: string,
  naam: string,
  waarde: string | number | null,
): string {
  const root = leesXml(xml),
    einde = root.inhoudStart;
  const regex = new RegExp(`\\s+${naam}\\s*=\\s*(?:"[^"]*"|'[^']*')`);
  const kop = xml.slice(0, einde).replace(regex, "");
  return (
    kop.replace(
      /(\/?>)$/,
      `${waarde === null ? "" : ` ${naam}="${ontsnap(String(waarde))}"`}$1`,
    ) + xml.slice(einde)
  );
}

export const voorvoegsel = (node: XmlElement) =>
  node.voorvoegsel ? `${node.voorvoegsel}:` : "";
export const fragment = (xml: string, node: XmlElement) =>
  xml.slice(node.start, node.eind);
export function metInhoud(
  xml: string,
  node: XmlElement,
  inhoud: string,
): string {
  const bron = fragment(xml, node);
  return node.leeg
    ? bron.slice(0, -2) + `>${inhoud}</${node.naam}>`
    : bron.slice(0, node.inhoudStart - node.start) +
        inhoud +
        bron.slice(node.inhoudEind - node.start);
}
export function bladBeveiligd(root: XmlElement): boolean {
  const p = kind(root, "sheetProtection"),
    vlag = attr(p, "sheet");
  return (
    !!p &&
    vlag !== undefined &&
    vlag !== null &&
    vlag !== "0" &&
    vlag !== "false"
  );
}
