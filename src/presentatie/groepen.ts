import { Pakket } from "../grafieken/pakket";
import {
  attr,
  attrTekst,
  elementen,
  kind,
  leesXml,
  ontsnap,
  vervang,
  zoekAlle,
  type XmlElement,
} from "../grafieken/xml";
import { leesOntwerpPakket } from "./ontwerp";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main",
  P = "http://schemas.openxmlformats.org/presentationml/2006/main";
export class GroepFout extends Error {
  constructor(public code: "invalid" | "missing" | "unsupported") {
    super(code);
  }
}
export interface GroepObject {
  id: string;
  naam: string;
  groep: boolean;
  mogelijk: boolean;
}
const soorten = new Set(["sp", "pic", "cxnSp", "graphicFrame", "grpSp"]);
function nonvisual(e: XmlElement) {
  return elementen(e).find((k) => k.lokaal.startsWith("nv"));
}
function identiteit(e: XmlElement) {
  return kind(nonvisual(e), "cNvPr");
}
function xfrm(e: XmlElement) {
  return e.lokaal === "graphicFrame"
    ? kind(e, "xfrm")
    : kind(kind(e, e.lokaal === "grpSp" ? "grpSpPr" : "spPr"), "xfrm");
}
function getal(e: XmlElement | null, k: string) {
  const s = attr(e, k),
    n = Number(s);
  if (s === undefined || !Number.isSafeInteger(n))
    throw new GroepFout("unsupported");
  return n;
}
function kader(e: XmlElement) {
  const t = xfrm(e),
    off = kind(t, "off"),
    ext = kind(t, "ext");
  const x = getal(off, "x"),
    y = getal(off, "y"),
    w = getal(ext, "cx"),
    h = getal(ext, "cy");
  const rot = Number(attr(t, "rot") ?? 0) / 60000;
  if (w <= 0 || h <= 0 || !Number.isFinite(rot))
    throw new GroepFout("unsupported");
  return {
    x,
    y,
    w,
    h,
    rot,
    fh: ["1", "true"].includes(attr(t, "flipH") ?? ""),
    fv: ["1", "true"].includes(attr(t, "flipV") ?? ""),
  };
}
function kanGroeperen(e: XmlElement) {
  if (
    zoekAlle(e, "ph").length ||
    [
      "spLocks",
      "picLocks",
      "graphicFrameLocks",
      "grpSpLocks",
      "cxnSpLocks",
    ].some((naam) =>
      zoekAlle(e, naam).some((l) =>
        ["1", "true"].includes(attr(l, "noGrp") ?? ""),
      ),
    )
  )
    return false;
  try {
    kader(e);
    return true;
  } catch {
    return false;
  }
}
function document(bytes: Uint8Array, dia: number) {
  const p = new Pakket(bytes),
    pad = leesOntwerpPakket(p).dias[dia]?.pad;
  if (!pad) throw new GroepFout("missing");
  const xml = p.lees(pad),
    root = leesXml(xml),
    tree = kind(kind(root, "cSld"), "spTree");
  if (!tree) throw new GroepFout("missing");
  const objecten = elementen(tree).filter((e) => soorten.has(e.lokaal));
  return { p, pad, xml, root, tree, objecten };
}
export function leesGroepObjecten(
  bytes: Uint8Array,
  dia: number,
): GroepObject[] {
  return document(bytes, dia).objecten.map((e) => ({
    id: attr(identiteit(e), "id") ?? "",
    naam: attr(identiteit(e), "name") ?? "",
    groep: e.lokaal === "grpSp",
    mogelijk: kanGroeperen(e),
  }));
}
/** Een verplaatst fragment krijgt zijn geërfde namespacebindings mee. */
function zelfstandig(xml: string, el: XmlElement) {
  const bindings: Record<string, string> = {},
    ouders: XmlElement[] = [];
  for (let e: XmlElement | null = el; e; e = e.ouder) ouders.unshift(e);
  for (const e of ouders)
    for (const [k, v] of Object.entries(e.attrs))
      if (k === "xmlns" || k.startsWith("xmlns:")) bindings[k] = v;
  const f = xml.slice(el.start, el.eind),
    root = leesXml(f);
  return vervang(f, [
    {
      start: root.start,
      eind: root.inhoudStart,
      tekst: `<${root.naam}${attrTekst({ ...bindings, ...root.attrs })}${root.leeg ? "/>" : ">"}`,
    },
  ]);
}
export function groepeerObjecten(
  bytes: Uint8Array,
  dia: number,
  ids: readonly string[],
  naam: string,
) {
  const d = document(bytes, dia),
    selectie = new Set(ids);
  if (
    selectie.size < 2 ||
    selectie.size !== ids.length ||
    !naam.trim() ||
    naam.length > 255
  )
    throw new GroepFout("invalid");
  const gekozen = d.objecten.filter((e) =>
    selectie.has(attr(identiteit(e), "id") ?? ""),
  );
  if (gekozen.length !== selectie.size) throw new GroepFout("missing");
  if (gekozen.some((e) => !kanGroeperen(e))) throw new GroepFout("unsupported");
  const boxes = gekozen.map((e) => {
    const r = kader(e),
      theta = (r.rot * Math.PI) / 180,
      c = Math.abs(Math.cos(theta)),
      s = Math.abs(Math.sin(theta)),
      w = r.w * c + r.h * s,
      h = r.w * s + r.h * c;
    return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h };
  });
  const x = Math.floor(Math.min(...boxes.map((r) => r.x))),
    y = Math.floor(Math.min(...boxes.map((r) => r.y))),
    w = Math.ceil(Math.max(...boxes.map((r) => r.x + r.w))) - x,
    h = Math.ceil(Math.max(...boxes.map((r) => r.y + r.h))) - y;
  if (
    ![x, y, w, h].every(Number.isSafeInteger) ||
    w > 2147483647 ||
    h > 2147483647
  )
    throw new GroepFout("unsupported");
  const bestaand = zoekAlle(d.root, "cNvPr").map((e) => getal(e, "id")),
    id = Math.max(0, ...bestaand) + 1;
  if (!Number.isSafeInteger(id) || id > 4294967295)
    throw new GroepFout("unsupported");
  const groep = `<p:grpSp xmlns:p="${P}" xmlns:a="${A}"><p:nvGrpSpPr><p:cNvPr id="${id}" name="${ontsnap(naam.trim())}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/><a:chOff x="${x}" y="${y}"/><a:chExt cx="${w}" cy="${h}"/></a:xfrm></p:grpSpPr>${gekozen.map((e) => zelfstandig(d.xml, e)).join("")}</p:grpSp>`;
  // Een groep neemt de hoogste stapelpositie van de selectie in.
  d.p.schrijf(
    d.pad,
    vervang(
      d.xml,
      gekozen.map((e, i) => ({
        start: e.start,
        eind: e.eind,
        tekst: i === gekozen.length - 1 ? groep : "",
      })),
    ),
  );
  return { bytes: d.p.inpakken(), id: String(id) };
}
function starttag(
  xml: string,
  e: XmlElement,
  attrs: Record<string, string | number | undefined>,
) {
  return vervang(xml, [
    {
      start: e.start,
      eind: e.inhoudStart,
      tekst: `<${e.naam}${attrTekst({ ...e.attrs, ...attrs })}${e.leeg ? "/>" : ">"}`,
    },
  ]);
}
function transformeer(
  fragment: string,
  g: ReturnType<typeof kader>,
  childOff: { x: number; y: number },
  childExt: { w: number; h: number },
) {
  const root = leesXml(fragment),
    r = kader(root),
    sx = g.w / childExt.w,
    sy = g.h / childExt.h;
  const rad = (g.rot * Math.PI) / 180,
    c = Math.cos(rad),
    s = Math.sin(rad),
    fx = g.fh ? -1 : 1,
    fy = g.fv ? -1 : 1;
  const a = c * fx * sx,
    b = s * fx * sx,
    cc = -s * fy * sy,
    dd = c * fy * sy;
  const phi = (r.rot * Math.PI) / 180,
    pc = Math.cos(phi),
    ps = Math.sin(phi),
    rx = r.fh ? -1 : 1,
    ry = r.fv ? -1 : 1;
  const ux = (a * pc + cc * ps) * rx,
    uy = (b * pc + dd * ps) * rx,
    vx = (-a * ps + cc * pc) * ry,
    vy = (-b * ps + dd * pc) * ry;
  const nu = Math.hypot(ux, uy),
    nv = Math.hypot(vx, vy);
  if (
    !Number.isFinite(nu * nv) ||
    nu * nv <= 0 ||
    Math.abs(ux * vx + uy * vy) > 1e-8 * nu * nv
  )
    throw new GroepFout("unsupported");
  const px = r.x + r.w / 2 - childOff.x - childExt.w / 2,
    py = r.y + r.h / 2 - childOff.y - childExt.h / 2;
  const centerX = g.x + g.w / 2 + a * px + cc * py,
    centerY = g.y + g.h / 2 + b * px + dd * py;
  const w = Math.round(r.w * nu),
    h = Math.round(r.h * nv),
    x = Math.round(centerX - w / 2),
    y = Math.round(centerY - h / 2);
  if (
    ![x, y, w, h].every(Number.isSafeInteger) ||
    w <= 0 ||
    h <= 0 ||
    w > 2147483647 ||
    h > 2147483647
  )
    throw new GroepFout("unsupported");
  let result = fragment;
  const update = (
    lokaal: string,
    attrs: Record<string, string | number | undefined>,
  ) => {
    const t = xfrm(leesXml(result))!,
      e = kind(t, lokaal);
    if (!e) throw new GroepFout("unsupported");
    result = starttag(result, e, attrs);
  };
  update("off", { x, y });
  update("ext", { cx: w, cy: h });
  // Een zuivere vertaling behoudt de oorspronkelijke rotatie-/spiegelnotatie.
  if (
    Math.abs(a - 1) > 1e-10 ||
    Math.abs(b) > 1e-10 ||
    Math.abs(cc) > 1e-10 ||
    Math.abs(dd - 1) > 1e-10
  ) {
    const rot =
      ((Math.round(((Math.atan2(uy, ux) * 180) / Math.PI) * 60000) % 21600000) +
        21600000) %
      21600000;
    if (root.lokaal === "graphicFrame" && (rot !== 0 || ux * vy - uy * vx < 0))
      throw new GroepFout("unsupported");
    result = starttag(result, xfrm(leesXml(result))!, {
      rot: rot || undefined,
      flipH: undefined,
      flipV: ux * vy - uy * vx < 0 ? "1" : undefined,
    });
  }
  return result;
}
export function hefGroepOp(bytes: Uint8Array, dia: number, id: string) {
  const d = document(bytes, dia),
    gekozen = d.objecten.filter((e) => attr(identiteit(e), "id") === id);
  if (gekozen.length !== 1 || gekozen[0].lokaal !== "grpSp")
    throw new GroepFout("missing");
  const groep = gekozen[0],
    props = kind(groep, "grpSpPr"),
    nv = identiteit(groep);
  if (!props || !nv || !nonvisual(groep)) throw new GroepFout("unsupported");
  if (
    elementen(props!).some((e) => e.lokaal !== "xfrm") ||
    elementen(nv).length ||
    elementen(nonvisual(groep)!).some(
      (e) =>
        !["cNvPr", "cNvGrpSpPr", "nvPr"].includes(e.lokaal) ||
        (e.lokaal === "nvPr" && elementen(e).length),
    ) ||
    zoekAlle(nonvisual(groep)!, "grpSpLocks").some((e) =>
      ["1", "true"].includes(attr(e, "noUngrp") ?? ""),
    )
  )
    throw new GroepFout("unsupported");
  // Verwijzingen naar de groep zelf mogen niet stilzwijgend verdwijnen.
  const heeftReferentie = (e: XmlElement): boolean =>
    Object.entries(e.attrs).some(
      ([k, v]) =>
        (["spid", "spId", "shapeId"].includes(k.split(":").pop()!) &&
          v === id) ||
        (["stCxn", "endCxn"].includes(e.lokaal) && k === "id" && v === id),
    ) || elementen(e).some(heeftReferentie);
  if (heeftReferentie(d.root)) throw new GroepFout("unsupported");
  const t = xfrm(groep),
    g = kader(groep),
    co = kind(t, "chOff"),
    ce = kind(t, "chExt"),
    childOff = { x: getal(co, "x"), y: getal(co, "y") },
    childExt = { w: getal(ce, "cx"), h: getal(ce, "cy") };
  if (childExt.w <= 0 || childExt.h <= 0) throw new GroepFout("unsupported");
  const children = elementen(groep).filter((e) => soorten.has(e.lokaal));
  if (
    !children.length ||
    elementen(groep).some(
      (e) =>
        !soorten.has(e.lokaal) && !["nvGrpSpPr", "grpSpPr"].includes(e.lokaal),
    )
  )
    throw new GroepFout("unsupported");
  const fragments = children.map((e) => {
    let f = transformeer(zelfstandig(d.xml, e), g, childOff, childExt);
    if (["1", "true"].includes(attr(nv, "hidden") ?? "")) {
      const childNv = identiteit(leesXml(f));
      if (!childNv) throw new GroepFout("unsupported");
      f = starttag(f, childNv, { hidden: "1" });
    }
    return f;
  });
  d.p.schrijf(
    d.pad,
    vervang(d.xml, [
      { start: groep.start, eind: groep.eind, tekst: fragments.join("") },
    ]),
  );
  return d.p.inpakken();
}
