import { Pakket, REL } from "../grafieken/pakket";
import i18next from "../i18n/config";
import {
  attr,
  attrTekst,
  elementen,
  kind,
  kinderen,
  leesXml,
  ontsnap,
  rid,
  tekstVan,
  vervang,
  zoekAlle,
  type XmlElement,
} from "../grafieken/xml";
import {
  notitieId,
  legeNotities,
  valideerNotities,
  type NotitieDocument,
  type NotitieStijl,
  type NotitieRun,
  type NotitieAlinea,
} from "./notitiesModel";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main",
  P = "http://schemas.openxmlformats.org/presentationml/2006/main",
  R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  NOTES = `${R}/notesSlide`;
export class NotitieFout extends Error {
  constructor(
    public code: "invalid" | "unsupported" | "changed" | "tooLarge" | "field",
  ) {
    super(i18next.t(`presentation:richNotes.errors.${code}`));
  }
}
function zelfstandig(xml: string, e: XmlElement) {
  const ns: Record<string, string> = {},
    parents: XmlElement[] = [];
  for (let n: XmlElement | null = e; n; n = n.ouder) parents.unshift(n);
  for (const n of parents)
    for (const [k, v] of Object.entries(n.attrs))
      if (k === "xmlns" || k.startsWith("xmlns:")) ns[k] = v;
  return `<${e.naam}${attrTekst({ ...ns, ...e.attrs })}${e.leeg ? "/>" : ">" + xml.slice(e.inhoudStart, e.inhoudEind) + `</${e.naam}>`}`;
}
export function notitieDiaPaden(p: Pakket) {
  const rel = p
    .relaties("")
    .find((r) => r.type === REL.officeDocument && !r.extern);
  if (!rel) throw new NotitieFout("invalid");
  const path = Pakket.doelPad("", rel.target),
    root = leesXml(p.lees(path));
  return kinderen(kind(root, "sldIdLst"), "sldId").map(
    (e) => p.doel(path, rid(e) ?? "") ?? "",
  );
}
function notePart(p: Pakket, slide: string) {
  const r = p.relaties(slide).find((r) => r.type === NOTES && !r.extern);
  return r ? p.doel(slide, r.id) : null;
}
function tekstBody(root: XmlElement) {
  const shapes = zoekAlle(root, "sp").filter(
    (s) => attr(kind(kind(kind(s, "nvSpPr"), "nvPr"), "ph"), "type") === "body",
  );
  if (shapes.length > 1) throw new NotitieFout("unsupported");
  return shapes[0] ? kind(shapes[0], "txBody") : null;
}
function stijl(e: XmlElement | null, base: NotitieStijl = {}): NotitieStijl {
  const result = { ...base };
  if (!e) return result;
  for (const [key, name] of [
    ["bold", "b"],
    ["italic", "i"],
  ] as const) {
    const value = attr(e, name);
    if (value !== undefined) result[key] = ["1", "true"].includes(value);
  }
  if (attr(e, "u") !== undefined) result.underline = attr(e, "u") !== "none";
  const size = Number(attr(e, "sz")) / 100;
  if (size >= 1 && size <= 400) result.size = size;
  const font = attr(kind(e, "latin"), "typeface");
  if (font && !font.startsWith("+")) result.font = font;
  const solid = kind(e, "solidFill"),
    rgb =
      attr(kind(solid, "srgbClr"), "val") ??
      attr(kind(solid, "sysClr"), "lastClr");
  if (rgb && /^[\da-f]{6}$/i.test(rgb)) result.color = "#" + rgb.toUpperCase();
  return result;
}
function runXml(r: NotitieRun): string {
  const value = { text: r.text, style: r.style };
  if (r.raw && r.original === JSON.stringify(value)) return r.raw;
  const root = r.raw ? leesXml(r.raw) : null,
    old = root ? kind(root, "rPr") : null,
    before = r.original ? (JSON.parse(r.original).style as NotitieStijl) : {};
  const attrs: Record<string, string | number | undefined> = {
    ...old?.attrs,
    "xmlns:a": A,
  };
  for (const [k, name] of [
    ["bold", "b"],
    ["italic", "i"],
    ["underline", "u"],
    ["size", "sz"],
  ] as const)
    if (r.style[k] !== before[k])
      attrs[name] =
        r.style[k] === undefined
          ? undefined
          : k === "size"
            ? Math.round(Number(r.style[k]) * 100)
            : k === "underline"
              ? r.style[k]
                ? "sng"
                : "none"
              : r.style[k]
                ? "1"
                : "0";
  let children = old
    ? elementen(old).map((e) => ({
        name: e.lokaal,
        xml: zelfstandig(r.raw!, e),
      }))
    : [];
  if (r.style.color !== before.color) {
    children = children.filter(
      (e) =>
        ![
          "noFill",
          "solidFill",
          "gradFill",
          "blipFill",
          "pattFill",
          "grpFill",
        ].includes(e.name),
    );
    if (r.style.color)
      children.splice(children.findIndex((e) => e.name === "ln") + 1, 0, {
        name: "solidFill",
        xml: `<a:solidFill xmlns:a="${A}"><a:srgbClr val="${r.style.color.slice(1)}"/></a:solidFill>`,
      });
  }
  if (r.style.font !== before.font) {
    children = children.filter((e) => e.name !== "latin");
    if (r.style.font) {
      const at = children.findIndex((e) =>
        [
          "ea",
          "cs",
          "sym",
          "hlinkClick",
          "hlinkMouseOver",
          "rtl",
          "extLst",
        ].includes(e.name),
      );
      children.splice(at < 0 ? children.length : at, 0, {
        name: "latin",
        xml: `<a:latin xmlns:a="${A}" typeface="${ontsnap(r.style.font)}"/>`,
      });
    }
  }
  const pr = `<a:rPr${attrTekst(attrs)}>${children.map((e) => e.xml).join("")}</a:rPr>`;
  if (root?.lokaal === "br") return `<a:br xmlns:a="${A}">${pr}</a:br>`;
  if (!r.field && r.text.includes("\u2028")) {
    return r.text
      .split("\u2028")
      .map((text) =>
        runXml({ ...r, text, raw: undefined, original: undefined }),
      )
      .join(`<a:br xmlns:a="${A}">${pr}</a:br>`);
  }
  const text = kind(root, "t"),
    content = `<a:t${attrTekst({ ...text?.attrs, "xml:space": "preserve" })}>${ontsnap(r.text)}</a:t>`;
  const other = root
    ? elementen(root)
        .filter((e) => e !== old && e !== text)
        .map((e) => r.raw!.slice(e.start, e.eind))
        .join("")
    : "";
  return `<${root?.naam ?? "a:r"}${attrTekst({ ...root?.attrs, "xmlns:a": A })}>${pr}${content}${other}</${root?.naam ?? "a:r"}>`;
}
function paraXml(p: NotitieAlinea) {
  if (
    p.raw &&
    p.original ===
      JSON.stringify({
        align: p.align,
        list: p.list,
        runs: p.runs.map((r) => ({ text: r.text, style: r.style, raw: r.raw })),
      })
  )
    return p.raw;
  const root = p.raw ? leesXml(p.raw) : null,
    old = kind(root, "pPr"),
    original = p.original ? JSON.parse(p.original) : {},
    attrs: Record<string, string | number | undefined> = {
      ...old?.attrs,
      "xmlns:a": A,
    };
  if (p.align !== original.align)
    attrs.algn = (
      { left: "l", center: "ctr", right: "r", justify: "just" } as const
    )[p.align];
  let props = old
    ? elementen(old).map((e) => ({
        name: e.lokaal,
        xml: zelfstandig(p.raw!, e),
      }))
    : [];
  if (p.list !== original.list) {
    props = props.filter(
      (e) => !["buNone", "buChar", "buAutoNum", "buBlip"].includes(e.name),
    );
    const bullet =
      p.list === "none"
        ? "<a:buNone/>"
        : p.list === "bullet"
          ? '<a:buChar char="•"/>'
          : '<a:buAutoNum type="arabicPeriod"/>';
    const at = props.findIndex((e) =>
      ["tabLst", "defRPr", "extLst"].includes(e.name),
    );
    props.splice(at < 0 ? props.length : at, 0, {
      name: "bullet",
      xml: bullet,
    });
  }
  const pp = `<a:pPr${attrTekst(attrs)}>${props.map((e) => e.xml).join("")}</a:pPr>`,
    other = root
      ? elementen(root)
          .filter((e) => !["pPr", "r", "fld", "br"].includes(e.lokaal))
          .map((e) => p.raw!.slice(e.start, e.eind))
          .join("")
      : "";
  return `<a:p${attrTekst({ ...root?.attrs, "xmlns:a": A })}>${pp}${p.runs.map(runXml).join("")}${other}</a:p>`;
}
export function leesRijkeNotities(p: Pakket, slide: string): NotitieDocument {
  const path = notePart(p, slide);
  if (!path) return legeNotities();
  const xml = p.lees(path),
    root = leesXml(xml),
    body = tekstBody(root);
  if (!body) {
    if (zoekAlle(root, "t").some((e) => tekstVan(e).trim()))
      throw new NotitieFout("unsupported");
    return legeNotities();
  }
  const master = p
      .relaties(path)
      .find((r) => r.type === `${R}/notesMaster` && !r.extern),
    masterRoot = master
      ? leesXml(p.lees(Pakket.doelPad(path, master.target)))
      : null,
    styleRoot = kind(masterRoot, "notesStyle");
  const paragraphs = kinderen(body, "p").map((para): NotitieAlinea => {
    const pp = kind(para, "pPr"),
      level = Number(attr(pp, "lvl") ?? 0),
      masterStyle = kind(styleRoot, `lvl${level + 1}pPr`),
      listStyle = kind(kind(body, "lstStyle"), `lvl${level + 1}pPr`),
      base = stijl(
        kind(pp, "defRPr"),
        stijl(kind(listStyle, "defRPr"), stijl(kind(masterStyle, "defRPr"))),
      );
    const listProp = [pp, listStyle, masterStyle].find(
        (e) =>
          e &&
          elementen(e).some((k) =>
            ["buNone", "buChar", "buAutoNum", "buBlip"].includes(k.lokaal),
          ),
      ),
      list = kind(listProp, "buAutoNum")
        ? "number"
        : kind(listProp, "buChar") || kind(listProp, "buBlip")
          ? "bullet"
          : "none",
      align =
        ({ l: "left", ctr: "center", r: "right", just: "justify" } as const)[
          (attr(pp, "algn") ??
            attr(listStyle, "algn") ??
            attr(masterStyle, "algn")) as "l"
        ] ?? "left";
    const runs = elementen(para).flatMap((e): NotitieRun[] => {
      if (["pPr", "endParaRPr", "extLst"].includes(e.lokaal)) return [];
      if (!["r", "fld", "br"].includes(e.lokaal))
        throw new NotitieFout("unsupported");
      const raw = zelfstandig(xml, e),
        text = e.lokaal === "br" ? "\u2028" : tekstVan(kind(e, "t")),
        style = stijl(kind(e, "rPr"), base);
      return [
        {
          id: notitieId(),
          text,
          style,
          raw,
          field: e.lokaal === "fld",
          original: JSON.stringify({ text, style }),
        },
      ];
    });
    const result: NotitieAlinea = {
      id: notitieId(),
      align,
      list,
      runs,
      raw: zelfstandig(xml, para),
    };
    result.original = JSON.stringify({
      align,
      list,
      runs: runs.map((r) => ({ text: r.text, style: r.style, raw: r.raw })),
    });
    return result;
  });
  const result = {
    paragraphs: paragraphs.length ? paragraphs : legeNotities().paragraphs,
  };
  try {
    return valideerNotities(result);
  } catch (e) {
    throw new NotitieFout(
      e instanceof Error && e.message === "tooLarge" ? "tooLarge" : "invalid",
    );
  }
}
export function schrijfRijkeNotities(
  bytes: Uint8Array,
  updates: ReadonlyMap<number, NotitieDocument>,
): Uint8Array {
  if (!updates.size) return bytes;
  const p = new Pakket(bytes),
    slides = notitieDiaPaden(p);
  for (const [index, doc] of updates) {
    try {
      valideerNotities(doc);
    } catch (e) {
      throw new NotitieFout(
        e instanceof Error && e.message === "tooLarge" ? "tooLarge" : "invalid",
      );
    }
    const slide = slides[index];
    if (!slide) throw new NotitieFout("changed");
    let path = notePart(p, slide);
    if (!path) {
      path = p.vrijPad("ppt/notesSlides/oosNotes#.xml");
      p.schrijf(
        path,
        `<p:notes xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`,
      );
      p.voegOverrideToe(
        path,
        "application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml",
      );
      p.voegRelatieToe(slide, NOTES, path);
      p.voegRelatieToe(path, REL.slide, slide);
      const master = p
        .namen()
        .find((n) => /^ppt\/notesMasters\/[^/]+\.xml$/.test(n));
      if (master) p.voegRelatieToe(path, `${R}/notesMaster`, master);
    }
    const xml = p.lees(path),
      body = tekstBody(leesXml(xml));
    if (!body) throw new NotitieFout("unsupported");
    let inserted = false;
    const parts = elementen(body).flatMap((e) => {
      if (e.lokaal !== "p") return [xml.slice(e.start, e.eind)];
      if (inserted) return [];
      inserted = true;
      return doc.paragraphs.map(paraXml);
    });
    if (!inserted) parts.push(...doc.paragraphs.map(paraXml));
    p.schrijf(
      path,
      vervang(xml, [
        {
          start: body.start,
          eind: body.eind,
          tekst: `<${body.naam}${attrTekst(body.attrs)}>${parts.join("")}</${body.naam}>`,
        },
      ]),
    );
  }
  return p.inpakken();
}
export function leesAlleRijkeNotities(
  bytes: Uint8Array,
): (NotitieDocument | null)[] {
  try {
    const p = new Pakket(bytes);
    return notitieDiaPaden(p).map((path) => {
      try {
        return leesRijkeNotities(p, path);
      } catch {
        return null;
      }
    });
  } catch {
    return [];
  }
}
