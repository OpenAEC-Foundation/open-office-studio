import type { SlidePrimitive } from "@betteroffice/pptx";
import { Pakket } from "../grafieken/pakket";
import {
  attr,
  attrTekst,
  elementen,
  kind,
  kinderen,
  leesXml,
  namespaceVan,
  vervang,
  zoekAlle,
  type XmlElement,
} from "../grafieken/xml";
import { leesOntwerpPakket } from "./ontwerp";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
export class OpmaakKopieFout extends Error {
  constructor(public code: "invalid" | "missing" | "unsupported") {
    super(code);
  }
}
export interface OpmaakObject {
  id: string;
  naam: string;
  object: boolean;
  tekst: boolean;
}
export interface EffectieveOpmaak {
  font: string;
  size: number;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: string;
}
/** Alleen bij openen van het venster: geen layout of snapshot tijdens typen. */
export function effectieveOpmaak(
  primitives: readonly SlidePrimitive[],
): Map<string, EffectieveOpmaak> {
  const result = new Map<string, EffectieveOpmaak>();
  for (const p of primitives)
    if (p.kind === "textBox") {
      const paragraph = p.paragraphs.find((p) =>
          p.runs.some((r) => r.text.length),
        ),
        run = paragraph?.runs.find((r) => r.text.length);
      if (run)
        result.set(String(p.objectId), {
          font: run.fontFamily,
          size: run.fontSizePt,
          color: run.color,
          bold: run.bold ?? false,
          italic: run.italic ?? false,
          underline: run.underline ?? false,
          align:
            (
              {
                left: "l",
                center: "ctr",
                right: "r",
                justify: "just",
              } as Record<string, string>
            )[paragraph?.align ?? "left"] ?? "l",
        });
    }
  return result;
}
const soorten = new Set(["sp", "pic", "cxnSp"]);
function identiteit(e: XmlElement) {
  return kind(
    elementen(e).find((c) => c.lokaal.startsWith("nv")),
    "cNvPr",
  );
}
function document(bytes: Uint8Array, dia: number) {
  const p = new Pakket(bytes),
    pad = leesOntwerpPakket(p).dias[dia]?.pad;
  if (!pad) throw new OpmaakKopieFout("missing");
  const xml = p.lees(pad),
    tree = kind(kind(leesXml(xml), "cSld"), "spTree");
  if (!tree) throw new OpmaakKopieFout("missing");
  return {
    p,
    pad,
    xml,
    objecten: elementen(tree).filter((e) =>
      ["sp", "pic", "cxnSp", "grpSp", "graphicFrame"].includes(e.lokaal),
    ),
  };
}
export function leesOpmaakObjecten(
  bytes: Uint8Array,
  dia: number,
): OpmaakObject[] {
  return document(bytes, dia).objecten.map((e) => ({
    id: attr(identiteit(e), "id") ?? "",
    naam: attr(identiteit(e), "name") ?? "",
    object: soorten.has(e.lokaal) && !!kind(e, "spPr"),
    tekst: soorten.has(e.lokaal) && !!kind(e, "txBody"),
  }));
}
function zelfstandig(xml: string, e: XmlElement) {
  const ns: Record<string, string> = {},
    ouders: XmlElement[] = [];
  for (let n: XmlElement | null = e; n; n = n.ouder) ouders.unshift(n);
  for (const n of ouders)
    for (const [k, v] of Object.entries(n.attrs))
      if (k === "xmlns" || k.startsWith("xmlns:")) ns[k] = v;
  return `<${e.naam}${attrTekst({ ...ns, ...e.attrs })}${e.leeg ? "/>" : ">" + xml.slice(e.inhoudStart, e.inhoudEind) + `</${e.naam}>`}`;
}
function element(
  e: XmlElement,
  inhoud: string,
  attrs: Record<string, string | number | undefined> = e.attrs,
) {
  return `<${e.naam}${attrTekst(attrs)}>${inhoud}</${e.naam}>`;
}
const fills = new Set([
  "noFill",
  "solidFill",
  "gradFill",
  "blipFill",
  "pattFill",
  "grpFill",
]);
const objectStijl = new Set([
  ...fills,
  "ln",
  "effectLst",
  "effectDag",
  "scene3d",
  "sp3d",
]);
const charAttrs = new Set([
  "kumimoji",
  "lang",
  "altLang",
  "sz",
  "b",
  "i",
  "u",
  "strike",
  "kern",
  "cap",
  "spc",
  "normalizeH",
  "baseline",
  "noProof",
]);
const charChildren = new Set([
  "ln",
  ...fills,
  "effectLst",
  "effectDag",
  "highlight",
  "uLnTx",
  "uLn",
  "uFillTx",
  "uFill",
  "latin",
  "ea",
  "cs",
  "sym",
  "rtl",
]);
const paraAttrs = new Set([
  "marL",
  "marR",
  "lvl",
  "indent",
  "algn",
  "defTabSz",
  "rtl",
  "eaLnBrk",
  "fontAlgn",
  "latinLnBrk",
  "hangingPunct",
]);
const paraChildren = new Set([
  "lnSpc",
  "spcBef",
  "spcAft",
  "buClrTx",
  "buClr",
  "buSzTx",
  "buSzPct",
  "buSzPts",
  "buFontTx",
  "buFont",
  "buNone",
  "buAutoNum",
  "buChar",
  "buBlip",
  "tabLst",
  "defRPr",
]);
function isA(e: XmlElement) {
  return namespaceVan(e, e.voorvoegsel) === A;
}
function stijlFragment(xml: string, e: XmlElement | null, namen: Set<string>) {
  return e
    ? elementen(e)
        .filter((k) => isA(k) && namen.has(k.lokaal))
        .map((k) => zelfstandig(xml, k))
        .join("")
    : "";
}
function rPr(
  bronXml: string,
  bron: XmlElement | null,
  targetXml: string,
  target: XmlElement | null,
  eff?: EffectieveOpmaak,
  naam = "a:rPr",
) {
  const attrs: Record<string, string | number | undefined> = {
    ...target?.attrs,
  };
  for (const k of charAttrs) delete attrs[k];
  if (bron)
    for (const [k, v] of Object.entries(bron.attrs))
      if (charAttrs.has(k)) attrs[k] = v;
  attrs["xmlns:a"] = A;
  let inhoud = stijlFragment(bronXml, bron, charChildren);
  if (eff) {
    if (attrs.sz === undefined && Number.isFinite(eff.size) && eff.size > 0)
      attrs.sz = Math.round(eff.size * 100);
    attrs.b ??= eff.bold ? "1" : "0";
    attrs.i ??= eff.italic ? "1" : "0";
    attrs.u ??= eff.underline ? "sng" : "none";
    if (
      !elementen(bron ?? leesXml("<x/>")).some(
        (e) => isA(e) && e.lokaal === "latin",
      )
    )
      inhoud += `<a:latin xmlns:a="${A}"${attrTekst({ typeface: eff.font })}/>`;
    if (
      !elementen(bron ?? leesXml("<x/>")).some(
        (e) => isA(e) && fills.has(e.lokaal),
      ) &&
      /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(eff.color)
    ) {
      const alpha =
        eff.color.length === 9
          ? Math.round((parseInt(eff.color.slice(7), 16) / 255) * 100000)
          : 100000;
      inhoud += `<a:solidFill xmlns:a="${A}"><a:srgbClr val="${eff.color.slice(1, 7)}">${alpha === 100000 ? "" : `<a:alpha val="${alpha}"/>`}</a:srgbClr></a:solidFill>`;
    }
  }
  // Hyperlinks, extension IDs and other target metadata belong to the target.
  if (target)
    inhoud += elementen(target)
      .filter((e) => !isA(e) || !charChildren.has(e.lokaal))
      .map((e) => targetXml.slice(e.start, e.eind))
      .join("");
  const wrapper = `<a:rPr xmlns:a="${A}">${inhoud}</a:rPr>`;
  const volgorde = (e: XmlElement) =>
    !isA(e)
      ? 13
      : fills.has(e.lokaal)
        ? 1
        : ((
            {
              ln: 0,
              effectLst: 2,
              effectDag: 2,
              highlight: 3,
              uLnTx: 4,
              uLn: 4,
              uFillTx: 5,
              uFill: 5,
              latin: 6,
              ea: 7,
              cs: 8,
              sym: 9,
              hlinkClick: 10,
              hlinkMouseOver: 11,
              rtl: 12,
              extLst: 14,
            } as Record<string, number>
          )[e.lokaal] ?? 13);
  inhoud = elementen(leesXml(wrapper))
    .sort((a, b) => volgorde(a) - volgorde(b))
    .map((e) => wrapper.slice(e.start, e.eind))
    .join("");
  return `<${naam}${attrTekst(attrs)}>${inhoud}</${naam}>`;
}
function tekstKopie(
  bronXml: string,
  body: XmlElement,
  targetXml: string,
  target: XmlElement,
  eff?: EffectieveOpmaak,
) {
  const paragraphs = kinderen(body, "p"),
    p =
      paragraphs.find((p) =>
        zoekAlle(p, "t").some(
          (t) => bronXml.slice(t.inhoudStart, t.inhoudEind).length,
        ),
      ) ?? paragraphs[0];
  if (!p) throw new OpmaakKopieFout("unsupported");
  const pp = kind(p, "pPr"),
    run = elementen(p).find(
      (e) => ["r", "fld"].includes(e.lokaal) && !!kind(e, "t"),
    ),
    level = Number(attr(pp, "lvl") ?? 0);
  const lagen = [
    kind(kind(kind(body, "lstStyle"), `lvl${level + 1}pPr`), "defRPr"),
    kind(pp, "defRPr"),
    kind(run, "rPr") ?? kind(p, "endParaRPr"),
  ].filter((e): e is XmlElement => !!e);
  const ca: Record<string, string> = { "xmlns:a": A };
  let cc: XmlElement[] = [];
  const groep = (e: XmlElement) =>
    fills.has(e.lokaal)
      ? "fill"
      : ["effectLst", "effectDag"].includes(e.lokaal)
        ? "effect"
        : ["uLnTx", "uLn"].includes(e.lokaal)
          ? "underline"
          : ["uFillTx", "uFill"].includes(e.lokaal)
            ? "underlineFill"
            : e.lokaal;
  for (const laag of lagen) {
    for (const [k, v] of Object.entries(laag.attrs))
      if (charAttrs.has(k)) ca[k] = v;
    for (const child of elementen(laag).filter(
      (e) => isA(e) && charChildren.has(e.lokaal),
    )) {
      cc = cc.filter((e) => groep(e) !== groep(child));
      cc.push(child);
    }
  }
  const bronStijl = `<a:rPr${attrTekst(ca)}>${cc.map((e) => zelfstandig(bronXml, e)).join("")}</a:rPr>`,
    rp = leesXml(bronStijl);
  const parts = elementen(target).map((e) => {
    if (e.lokaal === "bodyPr" || e.lokaal === "lstStyle") {
      const src = kind(body, e.lokaal);
      return src
        ? zelfstandig(bronXml, src)
        : `<a:${e.lokaal} xmlns:a="${A}"/>`;
    }
    if (e.lokaal !== "p") return targetXml.slice(e.start, e.eind);
    const oldpp = kind(e, "pPr"),
      pa: Record<string, string | number | undefined> = {
        ...oldpp?.attrs,
        "xmlns:a": A,
      };
    for (const k of paraAttrs) delete pa[k];
    if (pp)
      for (const [k, v] of Object.entries(pp.attrs))
        if (paraAttrs.has(k)) pa[k] = v;
    if (eff) pa.algn ??= eff.align;
    const paraStyle =
      stijlFragment(
        bronXml,
        pp,
        new Set([...paraChildren].filter((k) => k !== "defRPr")),
      ) +
      rPr(bronStijl, rp, targetXml, kind(oldpp, "defRPr"), eff, "a:defRPr") +
      (oldpp
        ? elementen(oldpp)
            .filter((k) => !isA(k) || !paraChildren.has(k.lokaal))
            .map((k) => targetXml.slice(k.start, k.eind))
            .join("")
        : "");
    let inhoud = `<a:pPr${attrTekst(pa)}>${paraStyle}</a:pPr>`;
    for (const c of elementen(e)) {
      if (c.lokaal === "pPr") continue;
      if (["r", "fld", "br"].includes(c.lokaal)) {
        const old = kind(c, "rPr"),
          style = rPr(bronStijl, rp, targetXml, old, eff);
        inhoud += element(
          c,
          style +
            elementen(c)
              .filter((k) => k !== old)
              .map((k) => targetXml.slice(k.start, k.eind))
              .join(""),
        );
      } else if (c.lokaal === "endParaRPr")
        inhoud += rPr(bronStijl, rp, targetXml, c, eff, c.naam);
      else inhoud += targetXml.slice(c.start, c.eind);
    }
    if (!kind(e, "endParaRPr"))
      inhoud += rPr(bronStijl, rp, targetXml, null, eff, "a:endParaRPr");
    return element(e, inhoud);
  });
  return element(target, parts.join(""));
}
export function kopieerObjectOpmaak(
  bytes: Uint8Array,
  dia: number,
  bronId: string,
  doelen: readonly string[],
  opties: { object: boolean; tekst: boolean; effectief?: EffectieveOpmaak },
) {
  const d = document(bytes, dia),
    ids = new Set(doelen),
    source = d.objecten.filter((e) => attr(identiteit(e), "id") === bronId);
  if (
    !ids.size ||
    ids.size !== doelen.length ||
    ids.has(bronId) ||
    (!opties.object && !opties.tekst)
  )
    throw new OpmaakKopieFout("invalid");
  const targets = d.objecten.filter((e) =>
    ids.has(attr(identiteit(e), "id") ?? ""),
  );
  if (source.length !== 1 || targets.length !== ids.size)
    throw new OpmaakKopieFout("missing");
  const src = source[0],
    srcProps = kind(src, "spPr"),
    srcText = kind(src, "txBody");
  if (
    !soorten.has(src.lokaal) ||
    !srcProps ||
    (opties.tekst && !srcText) ||
    targets.some(
      (e) =>
        !soorten.has(e.lokaal) ||
        !kind(e, "spPr") ||
        (opties.tekst && !kind(e, "txBody")),
    )
  )
    throw new OpmaakKopieFout("unsupported");
  const edits = targets.map((t) => {
    const tp = kind(t, "spPr")!,
      style = kind(t, "style"),
      text = kind(t, "txBody"),
      changes = [];
    if (opties.object) {
      const kept = elementen(tp).filter(
          (e) => !isA(e) || !objectStijl.has(e.lokaal),
        ),
        pos = kept.findIndex((e) => e.lokaal === "extLst"),
        insert = pos < 0 ? kept.length : pos;
      const children = kept.map((e) => d.xml.slice(e.start, e.eind));
      children.splice(insert, 0, stijlFragment(d.xml, srcProps, objectStijl));
      changes.push({
        start: tp.start,
        eind: tp.eind,
        tekst: element(tp, children.join("")),
      });
      const srcStyle = kind(src, "style"),
        nieuw = srcStyle ? zelfstandig(d.xml, srcStyle) : "";
      if (style)
        changes.push({ start: style.start, eind: style.eind, tekst: nieuw });
      else if (nieuw) {
        const pos = text?.start ?? kind(t, "extLst")?.start ?? t.inhoudEind;
        changes.push({ start: pos, eind: pos, tekst: nieuw });
      }
    }
    if (opties.tekst)
      changes.push({
        start: text!.start,
        eind: text!.eind,
        tekst: tekstKopie(d.xml, srcText!, d.xml, text!, opties.effectief),
      });
    // Positions remain relative to the original slide XML; replace each root once.
    const inner = vervang(d.xml, changes).slice(
      t.start,
      t.eind +
        changes.reduce((n, c) => n + c.tekst.length - (c.eind - c.start), 0),
    );
    return { start: t.start, eind: t.eind, tekst: inner };
  });
  d.p.schrijf(d.pad, vervang(d.xml, edits));
  return d.p.inpakken();
}
