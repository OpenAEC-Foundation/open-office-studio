/** Verliesvrije PPTX-ontwerpbewerkingen waarvoor de engine geen schrijf-API heeft. */
import { Pakket, REL } from "../grafieken/pakket";
import {
  attr,
  attrTekst,
  elementen,
  kind,
  kinderen,
  leesXml,
  ontsnap,
  rid,
  vervang,
  zoekAlle,
  type XmlElement,
} from "../grafieken/xml";

const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const MASTER = `${R}/slideMaster`,
  LAYOUT = `${R}/slideLayout`,
  THEME = `${R}/theme`;
const CT = "application/vnd.openxmlformats-officedocument.presentationml.";
export class OntwerpFout extends Error {
  constructor(public code: "invalid" | "inUse" | "lastLayout" | "missing") {
    super(code);
  }
}
export interface OntwerpDeel {
  pad: string;
  naam: string;
  master: string;
  gebruikt: number;
}
export interface OntwerpInfo {
  masters: OntwerpDeel[];
  layouts: OntwerpDeel[];
  dias: { pad: string; layout: string }[];
}

function document(p: Pakket) {
  const rel = p
    .relaties("")
    .find((r) => r.type === REL.officeDocument && !r.extern);
  if (!rel) throw new OntwerpFout("invalid");
  const pad = Pakket.doelPad("", rel.target),
    xml = p.lees(pad),
    root = leesXml(xml);
  if (root.lokaal !== "presentation") throw new OntwerpFout("invalid");
  const dias = kinderen(kind(root, "sldIdLst"), "sldId").map(
    (d) => p.doel(pad, rid(d) ?? "") ?? "",
  );
  return { pad, xml, root, dias };
}
function doel(p: Pakket, pad: string, type: string) {
  const r = p.relaties(pad).find((r) => r.type === type && !r.extern);
  return r ? (p.doel(pad, r.id) ?? "") : "";
}
function info(p: Pakket): OntwerpInfo {
  const doc = document(p);
  const dias = doc.dias.map((pad) => ({ pad, layout: doel(p, pad, LAYOUT) }));
  const masters = kinderen(kind(doc.root, "sldMasterIdLst"), "sldMasterId").map(
    (el) => {
      const pad = p.doel(doc.pad, rid(el) ?? "") ?? "";
      if (!pad) throw new OntwerpFout("invalid");
      const naam =
        attr(kind(leesXml(p.lees(pad)), "cSld"), "name") ??
        pad.split("/").pop()!;
      return { pad, naam, master: pad, gebruikt: 0 };
    },
  );
  const layouts: OntwerpDeel[] = [];
  for (const master of masters) {
    const root = leesXml(p.lees(master.pad));
    for (const el of kinderen(kind(root, "sldLayoutIdLst"), "sldLayoutId")) {
      const pad = p.doel(master.pad, rid(el) ?? "") ?? "";
      if (!pad) throw new OntwerpFout("invalid");
      const layout = leesXml(p.lees(pad));
      const gebruikt = dias.filter((d) => d.layout === pad).length;
      layouts.push({
        pad,
        naam:
          attr(kind(layout, "cSld"), "name") ??
          attr(layout, "type") ??
          pad.split("/").pop()!,
        master: master.pad,
        gebruikt,
      });
      master.gebruikt += gebruikt;
    }
  }
  return { masters, layouts, dias };
}
export const leesOntwerp = (bytes: Uint8Array) => info(new Pakket(bytes));
export { info as leesOntwerpPakket };
/** Masters en indelingen delen één gereserveerd nummergebied. */
export function ontwerpIds(p: Pakket) {
  const doc = document(p);
  return [
    ...kinderen(kind(doc.root, "sldMasterIdLst"), "sldMasterId").map(
      (e) => Number(attr(e, "id")) || 0,
    ),
    ...info(p).masters.flatMap((m) =>
      zoekAlle(leesXml(p.lees(m.pad)), "sldLayoutId").map(
        (e) => Number(attr(e, "id")) || 0,
      ),
    ),
  ];
}

function attrs(xml: string, el: XmlElement, updates: Record<string, string>) {
  return vervang(xml, [
    {
      start: el.start,
      eind: el.inhoudStart,
      tekst: `<${el.naam}${attrTekst({ ...el.attrs, ...updates })}${el.leeg ? "/>" : ">"}`,
    },
  ]);
}
function vervangKind(
  xml: string,
  parent: XmlElement,
  naam: string,
  inhoud: string,
  voor?: XmlElement | null,
) {
  const oud = kind(parent, naam);
  if (oud)
    return vervang(xml, [{ start: oud.start, eind: oud.eind, tekst: inhoud }]);
  if (parent.leeg)
    return vervang(xml, [
      {
        start: parent.start,
        eind: parent.eind,
        tekst: `<${parent.naam}${attrTekst(parent.attrs)}>${inhoud}</${parent.naam}>`,
      },
    ]);
  const pos = voor?.start ?? parent.inhoudEind;
  return vervang(xml, [{ start: pos, eind: pos, tekst: inhoud }]);
}
function veranderRelatie(p: Pakket, pad: string, id: string, target: string) {
  const rp = Pakket.relsPad(pad),
    xml = p.lees(rp);
  const el = kinderen(leesXml(xml), "Relationship").find(
    (r) => attr(r, "Id") === id,
  );
  if (!el) throw new OntwerpFout("missing");
  p.schrijf(rp, attrs(xml, el, { Target: Pakket.relatief(pad, target) }));
}
function koppel(p: Pakket, pad: string, type: string, target: string) {
  const rel = p.relaties(pad).find((r) => r.type === type && !r.extern);
  if (rel) veranderRelatie(p, pad, rel.id, target);
  else p.voegRelatieToe(pad, type, target);
}
function naamGeldig(naam: string) {
  if (!naam.trim() || naam.length > 255) throw new OntwerpFout("invalid");
  return naam.trim();
}
export function hernoemOntwerp(bytes: Uint8Array, pad: string, naam: string) {
  const p = new Pakket(bytes),
    lijst = info(p);
  if (![...lijst.layouts, ...lijst.masters].some((d) => d.pad === pad))
    throw new OntwerpFout("missing");
  const xml = p.lees(pad),
    root = leesXml(xml),
    cs = kind(root, "cSld");
  if (!cs) throw new OntwerpFout("invalid");
  p.schrijf(pad, attrs(xml, cs, { name: naamGeldig(naam) }));
  return p.inpakken();
}
function kopie(p: Pakket, bron: string, patroon: string) {
  const pad = p.vrijPad(patroon);
  p.schrijf(pad, p.lees(bron));
  const relaties = Pakket.relsPad(bron);
  if (p.heeft(relaties)) {
    p.schrijf(Pakket.relsPad(pad), p.lees(relaties));
    // Kopieën mogen ook een andere map hebben; behoud alle interne doelen.
    for (const rel of p.relaties(bron).filter((r) => !r.extern))
      veranderRelatie(p, pad, rel.id, Pakket.doelPad(bron, rel.target));
  }
  return pad;
}
function voegLayoutToe(p: Pakket, master: string, pad: string) {
  const r = p.voegRelatieToe(master, LAYOUT, pad),
    xml = p.lees(master),
    root = leesXml(xml);
  const lijst = kind(root, "sldLayoutIdLst");
  // IDs zijn presentatiebreed uniek, inclusief alle diamodellen.
  const ids = ontwerpIds(p);
  const id = Math.max(2147483648, ...ids) + 1;
  if (id > 4294967295) throw new OntwerpFout("invalid");
  const regel = `<p:sldLayoutId xmlns:p="${P}" xmlns:r="${R}" id="${id}" r:id="${r}"/>`;
  if (lijst)
    p.schrijf(
      master,
      vervangKind(
        xml,
        root,
        "sldLayoutIdLst",
        `<${lijst.naam}${attrTekst(lijst.attrs)}>${lijst.leeg ? "" : xml.slice(lijst.inhoudStart, lijst.inhoudEind)}${regel}</${lijst.naam}>`,
      ),
    );
  else
    p.schrijf(
      master,
      vervangKind(
        xml,
        root,
        "sldLayoutIdLst",
        `<p:sldLayoutIdLst xmlns:p="${P}">${regel}</p:sldLayoutIdLst>`,
        kind(root, "transition") ??
          kind(root, "timing") ??
          kind(root, "hf") ??
          kind(root, "txStyles") ??
          kind(root, "extLst"),
      ),
    );
}
export function dupliceerLayout(bytes: Uint8Array, bron: string, naam: string) {
  const p = new Pakket(bytes),
    layout = info(p).layouts.find((l) => l.pad === bron);
  if (!layout) throw new OntwerpFout("missing");
  naamGeldig(naam);
  const pad = kopie(p, bron, "ppt/slideLayouts/oosLayout#.xml");
  p.voegOverrideToe(pad, `${CT}slideLayout+xml`);
  koppel(p, pad, MASTER, layout.master);
  voegLayoutToe(p, layout.master, pad);
  return hernoemOntwerp(p.inpakken(), pad, naam);
}
export function verwijderLayout(bytes: Uint8Array, pad: string) {
  const p = new Pakket(bytes),
    lijst = info(p),
    layout = lijst.layouts.find((l) => l.pad === pad);
  if (!layout) throw new OntwerpFout("missing");
  if (layout.gebruikt) throw new OntwerpFout("inUse");
  if (lijst.layouts.filter((l) => l.master === layout.master).length < 2)
    throw new OntwerpFout("lastLayout");
  const xml = p.lees(layout.master),
    root = leesXml(xml);
  const el = kinderen(kind(root, "sldLayoutIdLst"), "sldLayoutId").find(
    (e) => p.doel(layout.master, rid(e) ?? "") === pad,
  );
  if (!el) throw new OntwerpFout("missing");
  p.schrijf(
    layout.master,
    vervang(xml, [{ start: el.start, eind: el.eind, tekst: "" }]),
  );
  p.verwijderRelatie(layout.master, rid(el)!);
  // Een ander onderdeel kan het ongebruikte ontwerp nog refereren: laat gedeelde media intact.
  const verwijst = p
    .namen()
    .filter((n) => !n.endsWith(".rels") && n !== pad)
    .some((n) =>
      p
        .relaties(n)
        .some((r) => !r.extern && Pakket.doelPad(n, r.target) === pad),
    );
  if (!verwijst) {
    p.verwijder(pad);
    p.verwijder(Pakket.relsPad(pad));
    p.verwijderOverride(pad);
  }
  return p.inpakken();
}
function selectieGeldig(p: Pakket, selectie: readonly number[]) {
  const doc = document(p);
  if (
    !selectie.length ||
    selectie.some((i) => !Number.isInteger(i) || i < 0 || i >= doc.dias.length)
  )
    throw new OntwerpFout("invalid");
  return [...new Set(selectie)].map((i) => doc.dias[i]);
}
/** Houd inhoud en gewone objecten; herstel alleen geometrie van bestaande placeholders. */
export function pasLayoutToe(
  bytes: Uint8Array,
  selectie: readonly number[],
  layout: string,
  reset = false,
) {
  const p = new Pakket(bytes);
  if (!info(p).layouts.some((l) => l.pad === layout))
    throw new OntwerpFout("missing");
  for (const pad of selectieGeldig(p, selectie)) {
    koppel(p, pad, LAYOUT, layout);
    if (reset) {
      const xml = p.lees(pad),
        root = leesXml(xml),
        wijzigingen = [];
      const tree = kind(kind(root, "cSld"), "spTree");
      if (!tree) throw new OntwerpFout("invalid");
      for (const sp of elementen(tree)) {
        if (!kind(kind(kind(sp, "nvSpPr"), "nvPr"), "ph")) continue;
        const xf = kind(kind(sp, "spPr"), "xfrm");
        if (xf) wijzigingen.push({ start: xf.start, eind: xf.eind, tekst: "" });
      }
      if (wijzigingen.length) p.schrijf(pad, vervang(xml, wijzigingen));
    }
  }
  return p.inpakken();
}

export type Achtergrond =
  | { soort: "erven" }
  | { soort: "kleur"; kleur: string }
  | { soort: "verloop"; kleur: string; tweede: string; hoek: number }
  | { soort: "afbeelding"; bytes: Uint8Array };
const hex = (s: string) => {
  if (!/^#[0-9a-f]{6}$/i.test(s)) throw new OntwerpFout("invalid");
  return s.slice(1).toUpperCase();
};
function achtergrondXml(p: Pakket, pad: string, a: Achtergrond) {
  if (a.soort === "erven") return "";
  let fill: string;
  if (a.soort === "kleur")
    fill = `<a:solidFill><a:srgbClr val="${hex(a.kleur)}"/></a:solidFill>`;
  else if (a.soort === "verloop") {
    if (!Number.isFinite(a.hoek) || a.hoek < 0 || a.hoek > 360)
      throw new OntwerpFout("invalid");
    fill = `<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:srgbClr val="${hex(a.kleur)}"/></a:gs><a:gs pos="100000"><a:srgbClr val="${hex(a.tweede)}"/></a:gs></a:gsLst><a:lin ang="${Math.round(a.hoek * 60000)}" scaled="1"/></a:gradFill>`;
  } else {
    const b = a.bytes;
    const png =
      b.length > 8 &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v);
    const jpg = b.length > 3 && b[0] === 255 && b[1] === 216 && b[2] === 255;
    if ((!png && !jpg) || b.length > 20 * 1024 * 1024)
      throw new OntwerpFout("invalid");
    const media = p.vrijPad(`ppt/media/oosBackground#.${png ? "png" : "jpg"}`);
    p.schrijf(media, b);
    p.voegDefaultToe(png ? "png" : "jpg", png ? "image/png" : "image/jpeg");
    const id = p.voegRelatieToe(pad, `${R}/image`, media);
    fill = `<a:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></a:blipFill>`;
  }
  return `<p:bg xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${R}"><p:bgPr>${fill}<a:effectLst/></p:bgPr></p:bg>`;
}
/** Doelen zijn uitsluitend echte dia-, layout- of masteronderdelen uit de presentatie. */
export function schrijfAchtergrond(
  bytes: Uint8Array,
  doelen: readonly string[],
  achtergrond: Achtergrond,
) {
  const p = new Pakket(bytes),
    lijst = info(p);
  const geldig = new Set(
    [...lijst.dias, ...lijst.layouts, ...lijst.masters].map((d) => d.pad),
  );
  if (!doelen.length || doelen.some((d) => !geldig.has(d)))
    throw new OntwerpFout("invalid");
  for (const pad of new Set(doelen)) {
    const xml = p.lees(pad),
      root = leesXml(xml),
      cs = kind(root, "cSld");
    if (!cs) throw new OntwerpFout("invalid");
    p.schrijf(
      pad,
      vervangKind(
        xml,
        cs,
        "bg",
        achtergrondXml(p, pad, achtergrond),
        kind(cs, "spTree"),
      ),
    );
  }
  return p.inpakken();
}

export const KLEUREN = [
  "dk1",
  "lt1",
  "dk2",
  "lt2",
  "accent1",
  "accent2",
  "accent3",
  "accent4",
  "accent5",
  "accent6",
  "hlink",
  "folHlink",
] as const;
export interface Thema {
  naam: string;
  kleuren: string[];
  kop: string;
  tekst: string;
  achtergrond: string;
}
export const THEMAS: Thema[] = [
  {
    naam: "Paper",
    kleuren: [
      "#172033",
      "#FFFFFF",
      "#43506A",
      "#F2F4F8",
      "#356BC4",
      "#E07B39",
      "#47916D",
      "#9B65A8",
      "#D4AF37",
      "#4AA4AD",
      "#0563C1",
      "#954F72",
    ],
    kop: "Aptos Display",
    tekst: "Aptos",
    achtergrond: "#FFFFFF",
  },
  {
    naam: "Ocean",
    kleuren: [
      "#133244",
      "#FFFFFF",
      "#28667A",
      "#E6F4F5",
      "#007F8B",
      "#DF9253",
      "#48986A",
      "#846EAC",
      "#C8AE42",
      "#4B93C0",
      "#0563C1",
      "#954F72",
    ],
    kop: "Arial",
    tekst: "Arial",
    achtergrond: "#E6F4F5",
  },
  {
    naam: "Slate",
    kleuren: [
      "#FFFFFF",
      "#192334",
      "#CCD5E4",
      "#304057",
      "#79ADF0",
      "#F3AC78",
      "#89CBA6",
      "#BEA0DF",
      "#E1CF7B",
      "#7EC8CF",
      "#79ADF0",
      "#BEA0DF",
    ],
    kop: "Arial",
    tekst: "Arial",
    achtergrond: "#192334",
  },
];
export function valideerThema(t: Thema): Thema {
  if (
    !t ||
    typeof t.naam !== "string" ||
    !t.naam.trim() ||
    t.naam.length > 255 ||
    !Array.isArray(t.kleuren) ||
    t.kleuren.length !== 12 ||
    typeof t.kop !== "string" ||
    typeof t.tekst !== "string" ||
    !t.kop.trim() ||
    !t.tekst.trim() ||
    t.kop.length > 255 ||
    t.tekst.length > 255
  )
    throw new OntwerpFout("invalid");
  t.kleuren.forEach(hex);
  hex(t.achtergrond);
  return t;
}
function themaXml(xml: string, t: Thema) {
  const root = leesXml(xml),
    te = kind(root, "themeElements"),
    cs = kind(te, "clrScheme"),
    fs = kind(te, "fontScheme");
  if (!te || !cs || !fs) throw new OntwerpFout("invalid");
  const wijzigingen = [
    {
      start: cs.start,
      eind: cs.eind,
      tekst: `<a:clrScheme xmlns:a="${A}" name="${ontsnap(t.naam)}">${KLEUREN.map((k, i) => `<a:${k}><a:srgbClr val="${hex(t.kleuren[i])}"/></a:${k}>`).join("")}</a:clrScheme>`,
    },
  ];
  for (const [naam, font] of [
    ["majorFont", t.kop],
    ["minorFont", t.tekst],
  ]) {
    const f = kind(fs, naam),
      latin = kind(f, "latin");
    if (!f) throw new OntwerpFout("invalid");
    if (latin)
      wijzigingen.push({
        start: latin.start,
        eind: latin.eind,
        tekst: `<a:latin${attrTekst({ ...latin.attrs, "xmlns:a": A, typeface: font })}/>`,
      });
    else
      wijzigingen.push({
        start: f.inhoudStart,
        eind: f.inhoudStart,
        tekst: `<a:latin xmlns:a="${A}" typeface="${ontsnap(font)}"/>`,
      });
  }
  return attrs(vervang(xml, wijzigingen), leesXml(vervang(xml, wijzigingen)), {
    name: t.naam,
  });
}
/** Isoleer een master met alle layouts: gedeelde media blijven relaties naar dezelfde onderdelen. */
function kopieerMaster(p: Pakket, bron: string) {
  const oud = info(p),
    master = kopie(p, bron, "ppt/slideMasters/oosMaster#.xml");
  p.voegOverrideToe(master, `${CT}slideMaster+xml`);
  const layouts = new Map<string, string>();
  for (const l of oud.layouts.filter((l) => l.master === bron)) {
    const pad = kopie(p, l.pad, "ppt/slideLayouts/oosLayout#.xml");
    p.voegOverrideToe(pad, `${CT}slideLayout+xml`);
    koppel(p, pad, MASTER, master);
    layouts.set(l.pad, pad);
    for (const r of p
      .relaties(master)
      .filter(
        (r) =>
          r.type === LAYOUT &&
          !r.extern &&
          Pakket.doelPad(master, r.target) === l.pad,
      ))
      veranderRelatie(p, master, r.id, pad);
  }
  // Layout IDs zijn ook tussen meerdere masters uniek.
  let max = Math.max(2147483647, ...ontwerpIds(p));
  let xml = p.lees(master);
  const edits = zoekAlle(leesXml(xml), "sldLayoutId").map((e) => {
    if (++max > 4294967295) throw new OntwerpFout("invalid");
    return {
      start: e.start,
      eind: e.inhoudStart,
      tekst: `<${e.naam}${attrTekst({ ...e.attrs, id: String(max) })}${e.leeg ? "/>" : ">"}`,
    };
  });
  p.schrijf(master, vervang(xml, edits));
  const doc = document(p),
    id = p.voegRelatieToe(doc.pad, MASTER, master),
    list = kind(doc.root, "sldMasterIdLst");
  if (!list) throw new OntwerpFout("invalid");
  const mid =
    Math.max(
      max,
      ...kinderen(list, "sldMasterId").map((e) => Number(attr(e, "id")) || 0),
    ) + 1;
  if (mid > 4294967295) throw new OntwerpFout("invalid");
  const regel = `<p:sldMasterId xmlns:p="${P}" xmlns:r="${R}" id="${mid}" r:id="${id}"/>`;
  p.schrijf(
    doc.pad,
    vervangKind(
      doc.xml,
      doc.root,
      "sldMasterIdLst",
      `<${list.naam}${attrTekst(list.attrs)}>${list.leeg ? "" : doc.xml.slice(list.inhoudStart, list.inhoudEind)}${regel}</${list.naam}>`,
    ),
  );
  return { master, layouts };
}
export function dupliceerMaster(bytes: Uint8Array, bron: string, naam: string) {
  const p = new Pakket(bytes);
  if (!info(p).masters.some((m) => m.pad === bron))
    throw new OntwerpFout("missing");
  naamGeldig(naam);
  const { master } = kopieerMaster(p, bron);
  return hernoemOntwerp(p.inpakken(), master, naam);
}
export function pasThemaToe(
  bytes: Uint8Array,
  selectie: readonly number[],
  thema: Thema,
) {
  valideerThema(thema);
  const p = new Pakket(bytes),
    lijst = info(p),
    dias = selectieGeldig(p, selectie);
  const groepen = new Map<string, string[]>();
  for (const pad of dias) {
    const layout = lijst.layouts.find(
      (l) => l.pad === lijst.dias.find((d) => d.pad === pad)?.layout,
    );
    if (!layout) throw new OntwerpFout("missing");
    groepen.set(layout.master, [...(groepen.get(layout.master) ?? []), pad]);
  }
  for (const [bron, doelen] of groepen) {
    const { master, layouts } = kopieerMaster(p, bron),
      theme = doel(p, bron, THEME);
    if (!theme) throw new OntwerpFout("missing");
    const nieuw = kopie(p, theme, "ppt/theme/oosTheme#.xml");
    p.voegOverrideToe(
      nieuw,
      "application/vnd.openxmlformats-officedocument.theme+xml",
    );
    p.schrijf(nieuw, themaXml(p.lees(nieuw), thema));
    koppel(p, master, THEME, nieuw);
    for (const pad of doelen) {
      const l = lijst.dias.find((d) => d.pad === pad)!.layout;
      koppel(p, pad, LAYOUT, layouts.get(l)!);
    }
  }
  // Een expliciete achtergrond is onderdeel van het gekozen ontwerp.
  return schrijfAchtergrond(p.inpakken(), dias, {
    soort: "kleur",
    kleur: thema.achtergrond,
  });
}
