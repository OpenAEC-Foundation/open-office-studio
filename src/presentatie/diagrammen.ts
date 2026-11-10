/** SmartArt-tekst en eenvoudige diagrammen als gewone, bewerkbare PresentationML-vormen. */
import { Pakket } from "../grafieken/pakket";
import {
  attr,
  attrNs,
  elementen,
  kind,
  kinderen,
  leesXml,
  namespaceVan,
  ontsnap,
  tekstVan,
  vervang,
  zoekAlle,
  type XmlElement,
} from "../grafieken/xml";
import { controleerPakket } from "../pakketcontrole";
import { diaPaden } from "./overgangen";

export const DIAGRAM_NS =
  "http://schemas.openxmlformats.org/drawingml/2006/diagram";
export const DIAGRAM_DRAW_NS =
  "http://schemas.microsoft.com/office/drawing/2008/diagram";
export const PRESENTATIE_NS =
  "http://schemas.openxmlformats.org/presentationml/2006/main";
export const TEKEN_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
export const RELATIE_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
export class DiagramFout extends Error {}
export interface DiagramPunt {
  id: string;
  tekst: string;
  bewerkbaar: boolean;
}
export interface Diagram {
  id: number;
  naam: string;
  punten: DiagramPunt[];
  dataPad: string | null;
  tekeningPad: string | null;
  gedeeld: boolean;
  cacheVormen: number;
}

export function diagramDia(p: Pakket, index: number) {
  const pad = diaPaden(p)[index];
  if (!Number.isInteger(index) || !pad) throw new DiagramFout("invalidSlide");
  const xml = p.lees(pad);
  return { pad, xml, root: leesXml(xml) };
}
function diagramFrames(root: XmlElement) {
  return zoekAlle(root, "graphicFrame").filter((f) => {
    const g = kind(kind(f, "graphic"), "graphicData");
    return (
      namespaceVan(f, f.voorvoegsel) === PRESENTATIE_NS &&
      attr(g, "uri") === DIAGRAM_NS
    );
  });
}
function dataPad(p: Pakket, diaPad: string, f: XmlElement) {
  const ids = kind(kind(kind(f, "graphic"), "graphicData"), "relIds"),
    id = attrNs(ids, RELATIE_NS, "dm");
  const rel = p
    .relaties(diaPad)
    .find((r) => r.id === id && r.type.endsWith("/diagramData") && !r.extern);
  const pad = rel ? Pakket.doelPad(diaPad, rel.target) : null;
  return pad && p.heeft(pad) ? pad : null;
}
export function diagramCache(p: Pakket, slidePad: string, data: XmlElement) {
  const ext = zoekAlle(data, "dataModelExt").find(
    (n) => namespaceVan(n, n.voorvoegsel) === DIAGRAM_DRAW_NS,
  );
  const id = attr(ext, "relId");
  const rel = p
    .relaties(slidePad)
    .find(
      (r) => r.id === id && r.type.endsWith("/diagramDrawing") && !r.extern,
    );
  const pad = rel ? Pakket.doelPad(slidePad, rel.target) : null;
  return pad && p.heeft(pad) ? pad : null;
}
function tekstBody(body: XmlElement | null) {
  return kinderen(body, "p")
    .map((p) =>
      elementen(p)
        .map((n) => (n.lokaal === "br" ? "\n" : tekstVan(kind(n, "t"))))
        .join(""),
    )
    .join("\n");
}
function eenvoudigeTekst(body: XmlElement | null) {
  if (!body) return false;
  return (
    !zoekAlle(body, "fld").length &&
    !zoekAlle(body, "hlinkClick").length &&
    !zoekAlle(body, "hlinkMouseOver").length &&
    kinderen(body, "p").length > 0 &&
    kinderen(body, "p").every(
      (p) =>
        !p.leeg &&
        elementen(p).every((n) =>
          ["pPr", "r", "endParaRPr"].includes(n.lokaal),
        ),
    )
  );
}
function cacheVoorPunt(data: XmlElement, cache: XmlElement | null, id: string) {
  if (!cache) return [];
  const ids = new Set([id]);
  for (const c of kinderen(kind(data, "cxnLst"), "cxn"))
    if (attr(c, "type") === "presOf" && attr(c, "srcId") === id)
      ids.add(attr(c, "destId") ?? "");
  for (const point of kinderen(kind(data, "ptLst"), "pt"))
    if (attr(kind(point, "prSet"), "presAssocID") === id)
      ids.add(attr(point, "modelId") ?? "");
  return zoekAlle(cache, "sp").filter(
    (s) =>
      ids.has(attr(s, "modelId") ?? "") &&
      kind(s, "txBody") &&
      tekstBody(kind(s, "txBody")).length > 0,
  );
}
export function leesDiagrammen(bytes: Uint8Array, index: number): Diagram[] {
  const p = new Pakket(bytes),
    d = diagramDia(p, index),
    gebruik = new Map<string, number>(),
    cacheGebruik = new Map<string, number>();
  for (const pad of diaPaden(p))
    for (const f of diagramFrames(leesXml(p.lees(pad)))) {
      const data = dataPad(p, pad, f);
      if (data) {
        gebruik.set(data, (gebruik.get(data) ?? 0) + 1);
        const cache = diagramCache(p, pad, leesXml(p.lees(data)));
        if (cache) cacheGebruik.set(cache, (cacheGebruik.get(cache) ?? 0) + 1);
      }
    }
  return diagramFrames(d.root).map((f) => {
    const dp = dataPad(p, d.pad, f),
      data = dp ? leesXml(p.lees(dp)) : null,
      cp = data ? diagramCache(p, d.pad, data) : null,
      cache = cp ? leesXml(p.lees(cp)) : null;
    const gedeeld =
      (!!dp && (gebruik.get(dp) ?? 0) > 1) ||
      (!!cp && (cacheGebruik.get(cp) ?? 0) > 1);
    const cacheTekst =
      !!cache && zoekAlle(cache, "txBody").some((b) => tekstBody(b).length > 0);
    return {
      id: Number(attr(kind(kind(f, "nvGraphicFramePr"), "cNvPr"), "id")),
      naam:
        attr(kind(kind(f, "nvGraphicFramePr"), "cNvPr"), "name") ?? "Diagram",
      dataPad: dp,
      tekeningPad: cp,
      gedeeld,
      cacheVormen: cache ? zoekAlle(cache, "sp").length : 0,
      punten: kinderen(kind(data, "ptLst"), "pt")
        .filter(
          (n) =>
            !attr(n, "type") || ["node", "asst"].includes(attr(n, "type")!),
        )
        .map((n) => {
          const id = attr(n, "modelId") ?? "",
            body = kind(n, "t"),
            tekst = tekstBody(body),
            bodies = data
              ? cacheVoorPunt(data, cache, id).map((s) => kind(s, "txBody"))
              : [];
          return {
            id,
            tekst,
            bewerkbaar:
              !gedeeld &&
              !!id &&
              eenvoudigeTekst(body) &&
              (!cacheTekst || bodies.length > 0) &&
              bodies.every((b) => eenvoudigeTekst(b) && tekstBody(b) === tekst),
          };
        }),
    };
  });
}
/** Behoud bestaande run-/alineaopmaak; verdeel nieuwe tekst over dezelfde runs. */
function veranderBody(xml: string, body: XmlElement, nieuw: string) {
  const paras = kinderen(body, "p"),
    regels = nieuw.split("\n");
  if (regels.length !== paras.length) throw new DiagramFout("paragraphCount");
  const edits: { start: number; eind: number; tekst: string }[] = [];
  paras.forEach((p, i) => {
    const ts = kinderen(p, "r")
      .map((r) => kind(r, "t"))
      .filter((t): t is XmlElement => !!t);
    if (!ts.length) {
      const pos = kind(p, "endParaRPr")?.start ?? p.inhoudEind;
      if (p.leeg) throw new DiagramFout("unsupportedText");
      edits.push({
        start: pos,
        eind: pos,
        tekst: `<a:r xmlns:a="${TEKEN_NS}"><a:t xml:space="preserve">${ontsnap(regels[i])}</a:t></a:r>`,
      });
    } else {
      let offset = 0;
      const letters = Array.from(regels[i]);
      ts.forEach((t, j) => {
        const n =
            j === ts.length - 1
              ? letters.length - offset
              : Math.min(
                  Array.from(tekstVan(t)).length,
                  letters.length - offset,
                ),
          text = letters.slice(offset, offset + Math.max(0, n)).join("");
        offset += Math.max(0, n);
        edits.push({
          start: t.start,
          eind: t.eind,
          tekst: `<${t.naam} xml:space="preserve">${ontsnap(text)}</${t.naam}>`,
        });
      });
    }
  });
  return vervang(
    xml.slice(body.start, body.eind),
    edits.map((e) => ({
      ...e,
      start: e.start - body.start,
      eind: e.eind - body.start,
    })),
  );
}
export function schrijfDiagramTekst(
  bytes: Uint8Array,
  index: number,
  id: number,
  teksten: Readonly<Record<string, string>>,
) {
  const lijst = leesDiagrammen(bytes, index),
    model = lijst.find((d) => d.id === id);
  if (!model?.dataPad) throw new DiagramFout("missingData");
  if (Object.keys(teksten).some((k) => !model.punten.some((p) => p.id === k)))
    throw new DiagramFout("invalidNode");
  const gewijzigd = model.punten.filter(
    (p) => p.id in teksten && teksten[p.id] !== p.tekst,
  );
  if (!gewijzigd.length) return bytes;
  if (
    gewijzigd.some(
      (p) =>
        !p.bewerkbaar ||
        teksten[p.id].length > 8000 ||
        /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(teksten[p.id]),
    )
  )
    throw new DiagramFout("unsupportedText");
  const p = new Pakket(bytes),
    changes = new Map<
      string,
      Map<number, { body: XmlElement; tekst: string }>
    >(),
    data = leesXml(p.lees(model.dataPad)),
    cache = model.tekeningPad ? leesXml(p.lees(model.tekeningPad)) : null;
  function zet(pad: string, body: XmlElement | null, tekst: string) {
    if (!body) throw new DiagramFout("unsupportedText");
    if (!changes.has(pad)) changes.set(pad, new Map());
    changes.get(pad)!.set(body.start, { body, tekst });
  }
  for (const point of gewijzigd) {
    const node = kinderen(kind(data, "ptLst"), "pt").find(
      (n) => attr(n, "modelId") === point.id,
    )!;
    zet(model.dataPad, kind(node, "t"), teksten[point.id]);
    if (model.tekeningPad)
      for (const shape of cacheVoorPunt(data, cache, point.id))
        zet(model.tekeningPad, kind(shape, "txBody"), teksten[point.id]);
  }
  for (const [pad, edits] of changes) {
    const xml = p.lees(pad);
    p.schrijf(
      pad,
      vervang(
        xml,
        [...edits.values()].map(({ body, tekst }) => ({
          start: body.start,
          eind: body.eind,
          tekst: veranderBody(xml, body, tekst),
        })),
      ),
    );
  }
  return klaar(p);
}
export function klaar(p: Pakket) {
  const b = p.inpakken();
  controleerPakket(b, "pptx");
  return b;
}

export type DiagramSoort = "process" | "cycle" | "hierarchy";
export interface DiagramKnoop {
  tekst: string;
  ouder: number | null;
  x: number;
  y: number;
  b: number;
  h: number;
}
export function diagramIndeling(
  soort: DiagramSoort,
  tekst: string,
): DiagramKnoop[] {
  if (
    !["process", "cycle", "hierarchy"].includes(soort) ||
    tekst.length > 12000
  )
    throw new DiagramFout("invalidText");
  const rows = tekst
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((t) => t.trim());
  if (
    rows.length < 2 ||
    rows.length > (soort === "hierarchy" ? 24 : 12) ||
    rows.some((t) => t.trim().length > 180)
  )
    throw new DiagramFout("invalidText");
  const nodes: DiagramKnoop[] = rows.map((tekst) => ({
    tekst: tekst.trim(),
    ouder: null,
    x: 0,
    y: 0,
    b: 0,
    h: 0,
  }));
  if (soort === "process") {
    const cols = Math.min(4, rows.length),
      lines = Math.ceil(rows.length / cols),
      b = 0.82 / cols,
      h = Math.min(0.25, 0.72 / lines);
    nodes.forEach((n, i) => {
      const r = Math.floor(i / cols),
        c = r % 2 ? cols - 1 - (i % cols) : i % cols;
      Object.assign(n, {
        x: 0.05 + (c * 0.9) / cols,
        y: 0.08 + (r * 0.84) / lines,
        b,
        h,
        ouder: i ? i - 1 : null,
      });
    });
  } else if (soort === "cycle") {
    const b = rows.length > 7 ? 0.17 : 0.24,
      h = rows.length > 7 ? 0.12 : 0.18;
    nodes.forEach((n, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / rows.length;
      Object.assign(n, {
        x: 0.5 + Math.cos(a) * 0.36 - b / 2,
        y: 0.5 + Math.sin(a) * 0.35 - h / 2,
        b,
        h,
        ouder: (i + rows.length - 1) % rows.length,
      });
    });
  } else {
    const stack: number[] = [],
      depths: number[] = [];
    rows.forEach((row, i) => {
      const prefix = /^[\t ]*/.exec(row)![0],
        depth = prefix.includes("\t")
          ? (prefix.match(/\t/g)?.length ?? 0)
          : prefix.length / 2;
      if (
        !Number.isInteger(depth) ||
        depth > 4 ||
        (i === 0 && depth !== 0) ||
        (i > 0 && (depth === 0 || depth > depths[i - 1] + 1))
      )
        throw new DiagramFout("invalidHierarchy");
      nodes[i].ouder = depth ? stack[depth - 1] : null;
      stack[depth] = i;
      depths.push(depth);
    });
    const children = nodes.map((_, i) =>
        nodes.map((n, j) => (n.ouder === i ? j : -1)).filter((j) => j >= 0),
      ),
      leaves = children.filter((c) => !c.length).length,
      maxDepth = Math.max(...depths),
      b = Math.min(0.28, 0.72 / leaves),
      h = Math.min(0.2, 0.62 / (maxDepth + 1));
    let leaf = 0;
    function place(i: number): number {
      const x = children[i].length
        ? children[i].map(place).reduce((s, v) => s + v, 0) / children[i].length
        : 0.08 + ((++leaf - 0.5) * 0.84) / leaves;
      Object.assign(nodes[i], {
        x: x - b / 2,
        y: 0.08 + (depths[i] * 0.82) / (maxDepth + 1),
        b,
        h,
      });
      return x;
    }
    place(0);
  }
  return nodes;
}
export function diagramVerbindingen(nodes: readonly DiagramKnoop[]) {
  const site = (dx: number, dy: number, n: DiagramKnoop) =>
    Math.abs(dx / n.b) >= Math.abs(dy / n.h)
      ? dx >= 0
        ? 3
        : 1
      : dy >= 0
        ? 2
        : 0;
  const punt = (n: DiagramKnoop, s: number) => ({
    x: n.x + (s === 1 ? 0 : s === 3 ? n.b : n.b / 2),
    y: n.y + (s === 0 ? 0 : s === 2 ? n.h : n.h / 2),
  });
  return nodes.flatMap((n, i) => {
    if (n.ouder === null) return [];
    const a = nodes[n.ouder],
      dx = n.x + n.b / 2 - a.x - a.b / 2,
      dy = n.y + n.h / 2 - a.y - a.h / 2,
      start = site(dx, dy, a),
      end = site(-dx, -dy, n),
      p = punt(a, start),
      q = punt(n, end);
    return [
      { van: n.ouder, naar: i, start, end, x1: p.x, y1: p.y, x2: q.x, y2: q.y },
    ];
  });
}
function nv(id: number, name: string, group = false) {
  return `<p:${group ? "nvGrpSpPr" : "nvSpPr"}><p:cNvPr id="${id}" name="${ontsnap(name)}"/><p:${group ? "cNvGrpSpPr" : "cNvSpPr"}/><p:nvPr/></p:${group ? "nvGrpSpPr" : "nvSpPr"}>`;
}
export function voegDiagramToe(
  bytes: Uint8Array,
  index: number,
  soort: DiagramSoort,
  tekst: string,
  naam: string,
) {
  const nodes = diagramIndeling(soort, tekst),
    p = new Pakket(bytes),
    d = diagramDia(p, index),
    tree = kind(kind(d.root, "cSld"), "spTree"),
    size = kind(leesXml(p.lees("ppt/presentation.xml")), "sldSz"),
    w = Number(attr(size, "cx")),
    h = Number(attr(size, "cy"));
  if (!tree || tree.leeg || !(w > 0 && h > 0))
    throw new DiagramFout("invalidSlide");
  let id =
    Math.max(
      1,
      ...zoekAlle(d.root, "cNvPr").map((n) => Number(attr(n, "id")) || 0),
    ) + 1;
  const groupId = id++,
    ids = nodes.map(() => id++),
    unitW = Math.round(w * 0.8),
    unitH = Math.round(h * 0.65),
    roundX = (v: number) => Math.round(v * unitW),
    roundY = (v: number) => Math.round(v * unitH);
  const edges = diagramVerbindingen(nodes)
    .map(({ van, naar, start, end, x1, y1, x2, y2 }) => {
      return `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${id++}" name="${ontsnap(naam)} — ${van + 1} → ${naar + 1}"/><p:cNvCxnSpPr><a:stCxn id="${ids[van]}" idx="${start}"/><a:endCxn id="${ids[naar]}" idx="${end}"/></p:cNvCxnSpPr><p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm${x2 < x1 ? ' flipH="1"' : ""}${y2 < y1 ? ' flipV="1"' : ""}><a:off x="${roundX(Math.min(x1, x2))}" y="${roundY(Math.min(y1, y2))}"/><a:ext cx="${Math.max(1, roundX(Math.abs(x2 - x1)))}" cy="${Math.max(1, roundY(Math.abs(y2 - y1)))}"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="19050"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill><a:tailEnd type="${soort === "hierarchy" ? "none" : "triangle"}"/></a:ln></p:spPr></p:cxnSp>`;
    })
    .join("");
  const shapes = nodes
    .map(
      (n, i) =>
        `<p:sp>${nv(ids[i], n.tekst.slice(0, 80))}<p:spPr><a:xfrm><a:off x="${roundX(n.x)}" y="${roundY(n.y)}"/><a:ext cx="${roundX(n.b)}" cy="${roundY(n.h)}"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom><a:solidFill><a:schemeClr val="accent1"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" anchor="ctr" lIns="40000" rIns="40000" tIns="20000" bIns="20000"><a:normAutofit/></a:bodyPr><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr sz="${nodes.length > 8 ? 1100 : 1600}"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr><a:t xml:space="preserve">${ontsnap(n.tekst)}</a:t></a:r></a:p></p:txBody></p:sp>`,
    )
    .join("");
  const group = `<p:grpSp xmlns:p="${PRESENTATIE_NS}" xmlns:a="${TEKEN_NS}">${nv(groupId, naam, true)}<p:grpSpPr><a:xfrm><a:off x="${Math.round(w * 0.1)}" y="${Math.round(h * 0.2)}"/><a:ext cx="${unitW}" cy="${unitH}"/><a:chOff x="0" y="0"/><a:chExt cx="${unitW}" cy="${unitH}"/></a:xfrm></p:grpSpPr>${edges}${shapes}</p:grpSp>`;
  p.schrijf(
    d.pad,
    vervang(d.xml, [
      { start: tree.inhoudEind, eind: tree.inhoudEind, tekst: group },
    ]),
  );
  return klaar(p);
}
