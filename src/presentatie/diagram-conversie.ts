/** Zet een opgeslagen SmartArt-tekening expliciet om naar een gewone vormengroep. */
import { Pakket } from "../grafieken/pakket";
import {
  attr,
  attrTekst,
  elementen,
  kind,
  leesXml,
  namespaceVan,
  vervang,
  zoekAlle,
  type XmlElement,
} from "../grafieken/xml";
import {
  DiagramFout,
  diagramDia,
  klaar,
  leesDiagrammen,
  DIAGRAM_DRAW_NS,
  PRESENTATIE_NS,
  TEKEN_NS,
  RELATIE_NS,
} from "./diagrammen";

function nsVan(el: XmlElement) {
  const lijst = new Map<string, string>();
  for (let n: XmlElement | null = el; n; n = n.ouder)
    for (const [k, v] of Object.entries(n.attrs))
      if (k === "xmlns" || k.startsWith("xmlns:"))
        if (!lijst.has(k)) lijst.set(k, v);
  return Object.fromEntries(lijst);
}
function bevatRelatie(el: XmlElement) {
  return (
    Object.keys(el.attrs).some(
      (k) =>
        k.includes(":") &&
        !k.startsWith("xmlns:") &&
        namespaceVan(el, k.split(":")[0]) === RELATIE_NS,
    ) || elementen(el).some(bevatRelatie)
  );
}
function buiten(xml: string, el: XmlElement, lokaal: string) {
  const inhoud = xml.slice(el.start, el.eind),
    naam = el.naam.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return inhoud
    .replace(new RegExp(`^<${naam}(?=[\\s/>])`), `<p:${lokaal}`)
    .replace(new RegExp(`</${naam}>$`), `</p:${lokaal}>`);
}
export function naarDiagramVormen(
  bytes: Uint8Array,
  index: number,
  id: number,
) {
  const p = new Pakket(bytes),
    d = diagramDia(p, index),
    model = leesDiagrammen(bytes, index).find((v) => v.id === id);
  if (!model?.tekeningPad) throw new DiagramFout("missingCache");
  const frame = zoekAlle(d.root, "graphicFrame").find(
    (f) =>
      Number(attr(kind(kind(f, "nvGraphicFramePr"), "cNvPr"), "id")) === id,
  );
  if (!frame || frame.ouder?.lokaal !== "spTree")
    throw new DiagramFout("unsupportedCache");
  const xml = p.lees(model.tekeningPad),
    root = leesXml(xml),
    tree = kind(root, "spTree"),
    shapes = tree ? elementen(tree).filter((n) => n.lokaal === "sp") : [],
    groupProps = kind(tree, "grpSpPr");
  if (
    !tree ||
    !groupProps ||
    !shapes.length ||
    shapes.length > 200 ||
    namespaceVan(root, root.voorvoegsel) !== DIAGRAM_DRAW_NS ||
    bevatRelatie(root) ||
    elementen(groupProps).length ||
    elementen(tree).some(
      (n) => !["nvGrpSpPr", "grpSpPr", "sp"].includes(n.lokaal),
    ) ||
    zoekAlle(d.root, "bldDgm").some((n) => Number(attr(n, "spid")) === id) ||
    zoekAlle(d.root, "spTgt").some(
      (n) => Number(attr(n, "spid")) === id && elementen(n).length,
    )
  )
    throw new DiagramFout("unsupportedCache");
  const xf = kind(frame, "xfrm"),
    off = kind(xf, "off"),
    size = kind(xf, "ext"),
    w = Number(attr(size, "cx")),
    h = Number(attr(size, "cy"));
  if (!xf || !off || !(w > 0 && h > 0))
    throw new DiagramFout("unsupportedCache");
  let next =
    Math.max(
      1,
      ...zoekAlle(d.root, "cNvPr").map((n) => Number(attr(n, "id")) || 0),
    ) + 1;
  const nv = kind(frame, "nvGraphicFramePr")!,
    cnv = kind(nv, "cNvPr")!;
  const appPr = kind(nv, "nvPr");
  // Een oude PowerPoint-modificatiestempel is niet meer geldig voor de nieuwe groep.
  // Overige niet-visuele eigenschappen blijven behouden.
  const alleenStempel =
    appPr &&
    elementen(appPr).every(
      (e) =>
        e.lokaal === "extLst" &&
        elementen(e).every(
          (ext) =>
            ext.lokaal === "ext" &&
            elementen(ext).length === 1 &&
            elementen(ext)[0].lokaal === "modId" &&
            namespaceVan(elementen(ext)[0], elementen(ext)[0].voorvoegsel) ===
              "http://schemas.microsoft.com/office/powerpoint/2010/main",
        ),
    );
  const nonvisual = `<p:nvGrpSpPr>${d.xml.slice(cnv.start, cnv.eind)}<p:cNvGrpSpPr/>${appPr && !alleenStempel ? d.xml.slice(appPr.start, appPr.eind) : `<p:nvPr${attrTekst(appPr?.attrs ?? {})}/>`}</p:nvGrpSpPr>`;
  const shapeNv = (s: XmlElement, name: string) => {
    const source = kind(kind(s, "nvSpPr"), "cNvPr"),
      body = source ? xml.slice(source.inhoudStart, source.inhoudEind) : "";
    return `<p:nvSpPr><p:cNvPr${attrTekst({ ...source?.attrs, id: next++, name })}>${body}</p:cNvPr><p:cNvSpPr/><p:nvPr/></p:nvSpPr>`;
  };
  const inhoud = shapes
    .map((s, i) => {
      const sp = kind(s, "spPr"),
        body = kind(s, "txBody"),
        tx = kind(s, "txXfrm"),
        style = kind(s, "style");
      if (
        !sp ||
        elementen(s).some(
          (n) =>
            !["nvSpPr", "spPr", "style", "txBody", "txXfrm"].includes(n.lokaal),
        )
      )
        throw new DiagramFout("unsupportedCache");
      const visual = `<p:sp>${shapeNv(s, `${model.naam} ${i + 1}`)}${buiten(xml, sp, "spPr")}${style ? buiten(xml, style, "style") : ""}${body && !tx ? buiten(xml, body, "txBody") : ""}</p:sp>`;
      if (!body || !tx) return visual;
      if (!kind(tx, "off") || !kind(tx, "ext"))
        throw new DiagramFout("unsupportedCache");
      const textXfrm = xml
        .slice(tx.start, tx.eind)
        .replace(new RegExp(`^<${tx.naam}(?=[\\s/>])`), "<a:xfrm")
        .replace(`</${tx.naam}>`, "</a:xfrm>");
      return `${visual}<p:sp>${shapeNv(s, `${model.naam} ${i + 1} — text`)}<p:spPr>${textXfrm}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr>${style ? buiten(xml, style, "style") : ""}${buiten(xml, body, "txBody")}</p:sp>`;
    })
    .join("");
  const group = `<p:grpSp${attrTekst({ ...nsVan(root), "xmlns:p": PRESENTATIE_NS, "xmlns:a": TEKEN_NS, "xmlns:r": RELATIE_NS })}>${nonvisual}<p:grpSpPr><a:xfrm${attrTekst(xf.attrs)}><a:off${attrTekst(off.attrs)}/><a:ext${attrTekst(size!.attrs)}/><a:chOff x="0" y="0"/><a:chExt cx="${w}" cy="${h}"/></a:xfrm></p:grpSpPr>${inhoud}</p:grpSp>`;
  p.schrijf(
    d.pad,
    vervang(d.xml, [{ start: frame.start, eind: frame.eind, tekst: group }]),
  );
  return klaar(p);
}
