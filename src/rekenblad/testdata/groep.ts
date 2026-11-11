import { Pakket } from "../../grafieken/pakket";
import {
  elementen,
  kind,
  leesXml,
  vervang,
  type XmlElement,
} from "../../grafieken/xml";
import { leesTekenobjecten, voegTekenobjectToe } from "../tekenobjecten";
const EMU = 9525;
function transform(x: number, y: number, w: number, h: number, rot = 0) {
  return `<a:xfrm rot="${rot * 60000}"><a:off x="${x * EMU}" y="${y * EMU}"/><a:ext cx="${w * EMU}" cy="${h * EMU}"/></a:xfrm>`;
}
function plaats(
  xml: string,
  x: number,
  y: number,
  w: number,
  h: number,
  rot = 0,
) {
  const root = leesXml(xml),
    pr = kind(root, "spPr")!,
    old = kind(pr, "xfrm");
  return vervang(xml, [
    {
      start: old?.start ?? pr.inhoudStart,
      eind: old?.eind ?? pr.inhoudStart,
      tekst: transform(x, y, w, h, rot),
    },
  ]);
}
export function groepFixture(
  basis: Uint8Array,
  png: Uint8Array,
  options: { rotatie?: number; flipX?: boolean; onbekend?: boolean } = {},
) {
  const plek = { row: 2, col: 2, x: 0, y: 0, breedte: 200, hoogte: 180 };
  let bytes = voegTekenobjectToe(basis, 0, {
    naam: "Grouped image",
    plek,
    afbeelding: png,
  });
  bytes = voegTekenobjectToe(bytes, 0, {
    naam: "Grouped text",
    plek,
    tekst: "OK",
    vorm: "rect",
    vulling: "#FF8800",
    lijn: "none",
  });
  const p = new Pakket(bytes),
    pad = leesTekenobjecten(bytes)[0].tekening,
    xml = p.lees(pad),
    root = leesXml(xml);
  const nodes = elementen(root),
    pic = kind(nodes[0], "pic")!,
    sp = kind(nodes[1], "sp")!;
  const fragment = (node: XmlElement) => xml.slice(node.start, node.eind);
  const picture = plaats(fragment(pic), 10, 20, 40, 30);
  const shape = plaats(fragment(sp), 100, 200, 40, 20, 45);
  const nested = `<xdr:grpSp><xdr:nvGrpSpPr><xdr:cNvPr id="301" name="Inner group"/><xdr:cNvGrpSpPr/></xdr:nvGrpSpPr><xdr:grpSpPr><a:xfrm><a:off x="${70 * EMU}" y="${90 * EMU}"/><a:ext cx="${40 * EMU}" cy="${20 * EMU}"/><a:chOff x="${100 * EMU}" y="${200 * EMU}"/><a:chExt cx="${40 * EMU}" cy="${20 * EMU}"/></a:xfrm></xdr:grpSpPr>${shape}</xdr:grpSp>`;
  const unknown = options.onbekend
    ? plaats(fragment(sp), 60, 20, 20, 20)
        .replace('id="2"', 'id="302"')
        .replace('name="Grouped text"', 'name="Unsupported star"')
        .replace('prst="rect"', 'prst="star5"')
    : "";
  const extension =
    '<a:extLst><a:ext uri="urn:oos:group-probe"><g:opaque xmlns:g="urn:oos:group-probe" value="keep"/></a:ext></a:extLst>';
  const group = `<xdr:grpSp><xdr:nvGrpSpPr><xdr:cNvPr id="300" name="Nested group"/><xdr:cNvGrpSpPr/></xdr:nvGrpSpPr><xdr:grpSpPr><a:xfrm rot="${(options.rotatie ?? 0) * 60000}" flipH="${options.flipX ? 1 : 0}"><a:off x="${128 * EMU}" y="${40 * EMU}"/><a:ext cx="${200 * EMU}" cy="${180 * EMU}"/><a:chOff x="${10 * EMU}" y="${20 * EMU}"/><a:chExt cx="${100 * EMU}" cy="${90 * EMU}"/></a:xfrm>${extension}</xdr:grpSpPr>${picture}${nested}${unknown}</xdr:grpSp>`;
  const anchor = `<xdr:oneCellAnchor><xdr:from><xdr:col>2</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>2</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="${200 * EMU}" cy="${180 * EMU}"/>${group}<xdr:clientData/></xdr:oneCellAnchor>`;
  p.schrijf(
    pad,
    vervang(xml, [
      { start: root.inhoudStart, eind: root.inhoudEind, tekst: anchor },
    ]),
  );
  p.schrijf("custom/group-probe.bin", new Uint8Array([2, 7, 1, 8]));
  return { bytes: p.inpakken(), pad, picture, shape, extension };
}
