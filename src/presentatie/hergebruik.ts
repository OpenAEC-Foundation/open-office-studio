import { strToU8, zipSync, unzipSync } from "fflate";
import { Pakket, REL } from "../grafieken/pakket";
import {
  attr,
  attrTekst,
  kind,
  kinderen,
  leesXml,
  rid,
  tekstVan,
  vervang,
  zoekAlle,
  type XmlElement,
} from "../grafieken/xml";
import { maakOnderdeelKopie } from "../pakket/kopieren";
import { leesOntwerpPakket, ontwerpIds } from "./ontwerp";
import { leesSecties, schrijfSecties } from "./pakket";

const P = "http://schemas.openxmlformats.org/presentationml/2006/main",
  R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PREFIX = "OpenOfficeStudio.Slides/1\n";
export class HergebruikFout extends Error {
  constructor(
    public code: "invalid" | "size" | "notes" | "metadata" | "tooLarge",
  ) {
    super(code);
  }
}
function bronPakket(bytes: Uint8Array) {
  let delen = 0,
    totaal = 0;
  unzipSync(bytes, {
    filter: (f) => {
      delen++;
      totaal += f.originalSize;
      if (delen > 10000 || totaal > 100 * 1024 * 1024)
        throw new HergebruikFout("tooLarge");
      return false;
    },
  });
  return new Pakket(bytes);
}
function presentatie(p: Pakket) {
  const r = p
    .relaties("")
    .find((r) => r.type === REL.officeDocument && !r.extern);
  if (!r) throw new HergebruikFout("invalid");
  const pad = Pakket.doelPad("", r.target),
    xml = p.lees(pad),
    root = leesXml(xml),
    maat = kind(root, "sldSz");
  const width = Number(attr(maat, "cx")),
    height = Number(attr(maat, "cy"));
  if (root.lokaal !== "presentation" || !width || !height)
    throw new HergebruikFout("invalid");
  return { pad, xml, root, width, height };
}
export function leesHergebruik(bytes: Uint8Array) {
  const p = bronPakket(bytes),
    d = presentatie(p),
    info = leesOntwerpPakket(p);
  if (info.dias.length > 500) throw new HergebruikFout("tooLarge");
  return {
    width: d.width,
    height: d.height,
    dias: info.dias.map((s, i) => ({
      index: i,
      naam: zoekAlle(leesXml(p.lees(s.pad)), "t")
        .slice(0, 5)
        .map(tekstVan)
        .join(" ")
        .slice(0, 180),
    })),
  };
}
function append(
  xml: string,
  root: XmlElement,
  naam: string,
  regels: string,
  voor: string[],
) {
  const old = kind(root, naam);
  if (old)
    return vervang(xml, [
      {
        start: old.start,
        eind: old.eind,
        tekst: `<${old.naam}${attrTekst(old.attrs)}>${old.leeg ? "" : xml.slice(old.inhoudStart, old.inhoudEind)}${regels}</${old.naam}>`,
      },
    ]);
  const pos =
    voor.map((n) => kind(root, n)?.start).find((n) => n !== undefined) ??
    root.inhoudEind;
  return vervang(xml, [
    {
      start: pos,
      eind: pos,
      tekst: `<p:${naam} xmlns:p="${P}">${regels}</p:${naam}>`,
    },
  ]);
}
function gelijk(
  a: Pakket,
  ap: string,
  b: Pakket,
  bp: string,
  gezien = new Set<string>(),
): boolean {
  const key = `${ap}|${bp}`;
  if (gezien.has(key)) return true;
  if (gezien.size >= 512) return false;
  gezien.add(key);
  const x = a.bytes(ap),
    y = b.bytes(bp);
  if (!x || !y || x.length !== y.length || !x.every((v, i) => v === y[i]))
    return false;
  const ar = a.relaties(ap),
    br = b.relaties(bp);
  if (ar.length !== br.length) return false;
  return ar.every((r) => {
    const q = br.find(
      (q) => q.id === r.id && q.type === r.type && q.extern === r.extern,
    );
    return (
      !!q &&
      (r.extern
        ? r.target === q.target
        : gelijk(
            a,
            Pakket.doelPad(ap, r.target),
            b,
            Pakket.doelPad(bp, q.target),
            gezien,
          ))
    );
  });
}

/** Houd bronopmaak. Ook intern gelinkte dia's komen mee, zodat hun koppelingen blijven werken. */
export function hergebruikDias(
  bytes: Uint8Array,
  bronBytes: Uint8Array,
  selectie: readonly number[],
  na: number,
) {
  const p = new Pakket(bytes),
    bron = bronPakket(bronBytes),
    d = presentatie(p),
    s = presentatie(bron),
    dst = leesOntwerpPakket(p),
    src = leesOntwerpPakket(bron);
  const keuze = [...new Set(selectie)].sort((a, b) => a - b);
  if (
    !keuze.length ||
    keuze.some((i) => !Number.isInteger(i) || !src.dias[i]) ||
    !Number.isInteger(na) ||
    na < -1 ||
    na >= dst.dias.length
  )
    throw new HergebruikFout("invalid");
  if (src.dias.length > 500 || dst.dias.length + keuze.length > 500)
    throw new HergebruikFout("tooLarge");
  if (
    Math.abs(d.width - s.width) > Math.max(1000, d.width * 0.0001) ||
    Math.abs(d.height - s.height) > Math.max(1000, d.height * 0.0001)
  )
    throw new HergebruikFout("size");
  // Deze pakketbrede lijsten hebben extra identiteitsregels; weiger ze voorlopig expliciet.
  if (
    kinderen(kind(s.root, "embeddedFontLst"), "embeddedFont").length ||
    bron
      .relaties(s.pad)
      .some((r) => /\/(commentAuthors|person|persons)$/i.test(r.type))
  )
    throw new HergebruikFout("metadata");
  const notes = kinderen(kind(d.root, "notesMasterIdLst"), "notesMasterId").map(
    (e) => p.doel(d.pad, rid(e) ?? "") ?? "",
  );
  if (notes.length > 1) throw new HergebruikFout("notes");
  const kopie = maakOnderdeelKopie(bron, p, {
    maxBytes: 100 * 1024 * 1024,
    maxOnderdelen: 10000,
    fout: () => new HergebruikFout("invalid"),
    naam: (pad, type) => {
      const ext = /\.([A-Za-z0-9]{1,10})$/.exec(pad)?.[1] ?? "bin";
      const map = type.endsWith(".slide+xml")
        ? "slides/oosSlide"
        : type.endsWith(".slideMaster+xml")
          ? "slideMasters/oosMaster"
          : type.endsWith(".slideLayout+xml")
            ? "slideLayouts/oosLayout"
            : type.endsWith(".notesMaster+xml")
              ? "notesMasters/oosNotesMaster"
              : type.endsWith(".notesSlide+xml")
                ? "notesSlides/oosNotes"
                : type ===
                    "application/vnd.openxmlformats-officedocument.theme+xml"
                  ? "theme/oosTheme"
                  : type.startsWith("image/")
                    ? "media/oosMedia"
                    : "import/oosPart";
      return p.vrijPad(`ppt/${map}#.${ext}`);
    },
  });
  const sourceNotes = bron
    .namen()
    .filter((n) => kopie.inhoudstype(n)?.endsWith(".notesMaster+xml"));
  for (const n of sourceNotes)
    if (notes[0] && gelijk(bron, n, p, notes[0])) kopie.map.set(n, notes[0]);
  for (const i of keuze) kopie.kopieer(src.dias[i].pad);
  const overgenomen = src.dias
    .map((dia, i) => ({ ...dia, index: i, nieuw: kopie.map.get(dia.pad) }))
    .filter((dia): dia is typeof dia & { nieuw: string } => !!dia.nieuw);
  if (dst.dias.length + overgenomen.length > 500)
    throw new HergebruikFout("tooLarge");
  const nieuwNotes = sourceNotes
    .map((n) => kopie.map.get(n))
    .filter((n): n is string => !!n && !notes.includes(n));
  if (nieuwNotes.length > 1 || (notes.length && nieuwNotes.length))
    throw new HergebruikFout("notes");
  const masters = src.masters.filter((m) => kopie.map.has(m.pad));
  let layoutId = Math.max(2147483647, ...ontwerpIds(p));
  for (const m of masters) {
    const pad = kopie.map.get(m.pad)!,
      xml = p.lees(pad),
      root = leesXml(xml);
    p.schrijf(
      pad,
      vervang(
        xml,
        zoekAlle(root, "sldLayoutId").map((e) => {
          if (++layoutId > 4294967295) throw new HergebruikFout("invalid");
          return {
            start: e.start,
            eind: e.inhoudStart,
            tekst: `<${e.naam}${attrTekst({ ...e.attrs, id: String(layoutId) })}${e.leeg ? "/>" : ">"}`,
          };
        }),
      ),
    );
  }
  let mid = Math.max(
    layoutId,
    ...kinderen(kind(d.root, "sldMasterIdLst"), "sldMasterId").map(
      (e) => Number(attr(e, "id")) || 0,
    ),
  );
  const masterRegels = masters
    .map((m) => {
      if (++mid > 4294967295) throw new HergebruikFout("invalid");
      return `<p:sldMasterId xmlns:p="${P}" xmlns:r="${R}" id="${mid}" r:id="${p.voegRelatieToe(d.pad, `${R}/slideMaster`, kopie.map.get(m.pad)!)}"/>`;
    })
    .join("");
  if (masterRegels) {
    const doc = presentatie(p);
    p.schrijf(
      d.pad,
      append(doc.xml, doc.root, "sldMasterIdLst", masterRegels, [
        "notesMasterIdLst",
        "handoutMasterIdLst",
        "sldIdLst",
        "sldSz",
      ]),
    );
  }
  if (nieuwNotes.length) {
    const doc = presentatie(p),
      r = p.voegRelatieToe(d.pad, `${R}/notesMaster`, nieuwNotes[0]);
    p.schrijf(
      d.pad,
      append(
        doc.xml,
        doc.root,
        "notesMasterIdLst",
        `<p:notesMasterId xmlns:p="${P}" xmlns:r="${R}" r:id="${r}"/>`,
        ["handoutMasterIdLst", "sldIdLst", "sldSz"],
      ),
    );
  }
  const doc = presentatie(p),
    list = kind(doc.root, "sldIdLst"),
    ids = kinderen(list, "sldId");
  let id = Math.max(255, ...ids.map((e) => Number(attr(e, "id")) || 0));
  const regels = overgenomen
    .map((dia) => {
      if (++id > 2147483647) throw new HergebruikFout("invalid");
      return `<p:sldId xmlns:p="${P}" xmlns:r="${R}" id="${id}" r:id="${p.voegRelatieToe(doc.pad, REL.slide, dia.nieuw)}"/>`;
    })
    .join("");
  if (!list || list.leeg)
    p.schrijf(
      doc.pad,
      append(doc.xml, doc.root, "sldIdLst", regels, [
        "sldSz",
        "notesSz",
        "defaultTextStyle",
        "extLst",
      ]),
    );
  else {
    const pos = na < 0 ? list.inhoudStart : ids[na].eind;
    p.schrijf(
      doc.pad,
      vervang(doc.xml, [{ start: pos, eind: pos, tekst: regels }]),
    );
  }
  const secties = leesSecties(bytes);
  if (secties.length)
    schrijfSecties(
      p,
      secties.map((sec) =>
        sec.begin > 0 && sec.begin >= na + 1
          ? { ...sec, begin: sec.begin + overgenomen.length }
          : sec,
      ),
    );
  return {
    bytes: p.inpakken(),
    eerste: na + 1,
    aantal: overgenomen.length,
    extra: overgenomen.length - keuze.length,
  };
}

/** Zelfstandig klembordpakket met uitsluitend de gekozen dia's en bereikbare onderdelen. */
export function maakDiaKopie(bytes: Uint8Array, selectie: readonly number[]) {
  const p = new Pakket(bytes),
    d = presentatie(p),
    frag = (naam: string) => {
      const e = kind(d.root, naam);
      return e ? d.xml.slice(e.start, e.eind) : "";
    };
  const xml = `<${d.root.naam}${attrTekst(d.root.attrs)}><p:sldMasterIdLst xmlns:p="${P}"/><p:sldIdLst xmlns:p="${P}"/>${frag("sldSz")}${frag("notesSz")}${frag("defaultTextStyle")}</${d.root.naam}>`;
  const leeg = zipSync({
    "[Content_Types].xml": strToU8(
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL.officeDocument}" Target="ppt/presentation.xml"/></Relationships>`,
    ),
    "ppt/presentation.xml": strToU8(xml),
  });
  const b = hergebruikDias(leeg, bytes, selectie, -1).bytes;
  if (b.length > 32 * 1024 * 1024) throw new HergebruikFout("tooLarge");
  let raw = "";
  for (let i = 0; i < b.length; i += 8192)
    raw += String.fromCharCode(...b.subarray(i, i + 8192));
  return PREFIX + btoa(raw);
}
export const isDiaKopie = (s: string) =>
  s.startsWith(PREFIX) || s.startsWith(PREFIX.replace("\n", "\r\n"));
export function leesDiaKopie(tekst: string) {
  if (!isDiaKopie(tekst) || tekst.length > 45 * 1024 * 1024)
    throw new HergebruikFout("invalid");
  const raw = tekst.slice(tekst.indexOf("\n") + 1);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(raw)) throw new HergebruikFout("invalid");
  const b = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  let aantal = 0,
    totaal = 0;
  unzipSync(b, {
    filter: (f) => {
      aantal++;
      totaal += f.originalSize;
      if (aantal > 10000 || totaal > 100 * 1024 * 1024)
        throw new HergebruikFout("tooLarge");
      return false;
    },
  });
  leesHergebruik(b);
  return b;
}
