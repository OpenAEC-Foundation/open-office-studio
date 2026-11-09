/** Dianummers, datums en voettekst als echte PPTX-placeholders en tekstvelden (#87). */
import { Pakket, REL } from "../grafieken/pakket";
import {
  attr,
  attrTekst,
  elementen,
  kind,
  kinderen,
  leesXml,
  namespaceVan,
  ontsnap,
  rid,
  tekstVan,
  vervang,
  zoekAlle,
  type Vervanging,
  type XmlElement,
} from "../grafieken/xml";

const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
type Soort = "dt" | "ftr" | "sldNum";
const SOORTEN: Soort[] = ["dt", "ftr", "sldNum"];

export interface Voetteksten {
  dianummer: boolean;
  datum: boolean;
  automatisch: boolean;
  datumTekst: string;
  voettekst: boolean;
  tekst: string;
  nietOpTitel: boolean;
}

export class VoettekstFout extends Error {
  constructor(
    public code: "noSlides" | "invalidSelection" | "invalidPresentation",
  ) {
    super(code);
  }
}

function presentatie(pakket: Pakket) {
  const rel = pakket
    .relaties("")
    .find((r) => r.type === REL.officeDocument && !r.extern);
  if (!rel) throw new VoettekstFout("invalidPresentation");
  const pad = Pakket.doelPad("", rel.target);
  const xml = pakket.lees(pad),
    wortel = leesXml(xml);
  const dias = kinderen(kind(wortel, "sldIdLst"), "sldId").map(
    (d) => pakket.doel(pad, rid(d) ?? "") ?? "",
  );
  if (!dias.length) throw new VoettekstFout("noSlides");
  const maat = kind(wortel, "sldSz");
  return {
    pad,
    xml,
    wortel,
    dias,
    breedte: Number(attr(maat, "cx")) || 9144000,
    hoogte: Number(attr(maat, "cy")) || 6858000,
  };
}

function layOut(pakket: Pakket, dia: string) {
  const rel = pakket
    .relaties(dia)
    .find((r) => r.type === `${R}/slideLayout` && !r.extern);
  return rel ? pakket.doel(dia, rel.id) : null;
}

function titelDia(pakket: Pakket, dia: string) {
  const pad = layOut(pakket, dia);
  return !!pad && attr(leesXml(pakket.lees(pad)), "type") === "title";
}

const soort = (vorm: XmlElement) =>
  attr(kind(kind(kind(vorm, "nvSpPr"), "nvPr"), "ph"), "type");
const vormen = (wortel: XmlElement) =>
  kinderen(kind(kind(wortel, "cSld"), "spTree"), "sp");

function inhoud(vorm: XmlElement | undefined) {
  if (!vorm) return "";
  const tekst = (el: XmlElement): string =>
    el.lokaal === "t"
      ? tekstVan(el)
      : el.lokaal === "br"
        ? "\n"
        : elementen(el).map(tekst).join("");
  return kinderen(kind(vorm, "txBody"), "p").map(tekst).join("\n");
}

/** Instellingen van één dia; bestaande plaats en opmaak blijven bij wijzigen behouden. */
export function leesVoetteksten(bytes: Uint8Array, index: number): Voetteksten {
  const pakket = new Pakket(bytes),
    pres = presentatie(pakket);
  if (!Number.isInteger(index) || index < 0 || index >= pres.dias.length)
    throw new VoettekstFout("invalidSelection");
  const lijst = vormen(leesXml(pakket.lees(pres.dias[index])));
  const datum = lijst.find((v) => soort(v) === "dt"),
    voet = lijst.find((v) => soort(v) === "ftr");
  return {
    dianummer: lijst.some((v) => soort(v) === "sldNum"),
    datum: !!datum,
    automatisch:
      !!datum &&
      zoekAlle(datum, "fld").some((f) =>
        /^datetime/i.test(attr(f, "type") ?? ""),
      ),
    datumTekst: inhoud(datum),
    voettekst: !!voet,
    tekst: inhoud(voet),
    nietOpTitel: !["true", "1"].includes(
      attr(pres.wortel, "showSpecialPlsOnTitleSld") ?? "false",
    ),
  };
}

/** Dezelfde, 1-gebaseerde diareeks als in een afdrukvenster: 1, 3-5. */
export function diaKeuze(tekst: string, aantal: number): number[] {
  const uit = new Set<number>();
  if (!tekst.trim()) throw new VoettekstFout("invalidSelection");
  for (const deel of tekst.split(/[,;]/)) {
    const m = /^\s*(\d+)\s*(?:[-–]\s*(\d+))?\s*$/.exec(deel);
    if (!m) throw new VoettekstFout("invalidSelection");
    const a = Number(m[1]),
      b = Number(m[2] ?? m[1]);
    if (
      !Number.isSafeInteger(a) ||
      !Number.isSafeInteger(b) ||
      a < 1 ||
      b < a ||
      b > aantal
    )
      throw new VoettekstFout("invalidSelection");
    for (let n = a; n <= b; n++) uit.add(n - 1);
  }
  return [...uit].sort((a, b) => a - b);
}

function tagAttrs(
  xml: string,
  el: XmlElement,
  updates: Record<string, string>,
): Vervanging {
  return {
    start: el.start,
    eind: el.inhoudStart,
    tekst: `<${el.naam}${attrTekst({ ...el.attrs, ...updates })}${el.leeg ? "/>" : ">"}`,
  };
}

/** Neem een eenvoudige voettekstvorm uit de lay-out of het diamodel over. */
function sjabloon(pakket: Pakket, dia: string, type: Soort) {
  const layout = layOut(pakket, dia);
  const masterRel =
    layout &&
    pakket
      .relaties(layout)
      .find((r) => r.type === `${R}/slideMaster` && !r.extern);
  const master = layout && masterRel ? pakket.doel(layout, masterRel.id) : null;
  for (const pad of [layout, master]) {
    if (!pad) continue;
    const xml = pakket.lees(pad),
      lijst = vormen(leesXml(xml));
    const vorm = lijst.find(
      (v) => soort(v) === type && !!kind(kind(v, "spPr"), "xfrm"),
    );
    if (!vorm) continue;
    // Relatiegebonden vullingen/hyperlinks horen bij het brononderdeel.
    // Gebruik daarvoor een zelfstandige vorm; neem nooit een verkeerde r:id over.
    const alle = [
      vorm,
      ...zoekAlle(vorm, "blip"),
      ...zoekAlle(vorm, "hlinkClick"),
      ...zoekAlle(vorm, "hlinkMouseOver"),
    ];
    if (
      alle.some((v) =>
        Object.keys(v.attrs).some(
          (k) => k.includes(":") && namespaceVan(v, k.split(":")[0]) === R,
        ),
      )
    )
      continue;
    const bindings: Record<string, string> = {};
    const loop = (el: XmlElement) => {
      for (const q of [
        el.voorvoegsel,
        ...Object.keys(el.attrs)
          .filter((k) => k.includes(":") && !k.startsWith("xmlns:"))
          .map((k) => k.split(":")[0]),
      ]) {
        const ns = namespaceVan(vorm, q);
        if (ns) bindings[q ? `xmlns:${q}` : "xmlns"] = ns;
      }
      elementen(el).forEach(loop);
    };
    loop(vorm);
    // Nieuwe tekstvelden gebruiken a:, ongeacht de voorvoegsels in de bron.
    const fragment = xml.slice(vorm.start, vorm.eind);
    return vervang(fragment, [
      tagAttrs(fragment, leesXml(fragment), { ...bindings, "xmlns:a": A }),
    ]);
  }
  return null;
}

function nieuweVorm(type: Soort, id: number, breedte: number, hoogte: number) {
  const kolom = SOORTEN.indexOf(type),
    marge = Math.round(breedte * 0.04);
  const w = Math.round(breedte * 0.29),
    h = Math.round(hoogte * 0.065),
    y = Math.round(hoogte * 0.92);
  const x =
    kolom === 0
      ? marge
      : kolom === 1
        ? Math.round((breedte - w) / 2)
        : breedte - marge - w;
  return `<p:sp xmlns:p="${P}" xmlns:a="${A}"><p:nvSpPr><p:cNvPr id="${id}" name="${type}"/><p:cNvSpPr/><p:nvPr><p:ph type="${type}" idx="${1000 + kolom}"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="${kolom === 0 ? "l" : kolom === 1 ? "ctr" : "r"}"/><a:endParaRPr sz="1200"/></a:p></p:txBody></p:sp>`;
}

function vormTekst(
  xml: string,
  type: Soort,
  waarde: string,
  automatisch: boolean,
  id?: number,
) {
  const root = leesXml(xml),
    tx = kind(root, "txBody");
  if (!tx) throw new VoettekstFout("invalidPresentation");
  const p = kind(tx, "p"),
    ppr = kind(p, "pPr");
  const run = p && (kind(p, "r") ?? kind(p, "fld"));
  const rpr = kind(run, "rPr"),
    end = kind(p, "endParaRPr");
  const fragment = (el: XmlElement | null) =>
    el ? xml.slice(el.start, el.eind) : "";
  const stijl = rpr
    ? fragment(rpr)
    : end
      ? `<a:rPr${attrTekst(end.attrs)}/>`
      : '<a:rPr sz="1200"/>';
  const veld =
    type === "sldNum"
      ? "slidenum"
      : type === "dt" && automatisch
        ? "datetime1"
        : null;
  const guid =
    id === undefined && kind(p, "fld") ? attr(kind(p, "fld"), "id") : undefined;
  const tekst = veld
    ? `<a:fld id="${ontsnap(guid ?? `{${crypto.randomUUID().toUpperCase()}}`)}" type="${veld}">${stijl}<a:t>${ontsnap(waarde)}</a:t></a:fld>`
    : waarde
        .split("\n")
        .map((t) => `<a:r>${stijl}<a:t>${ontsnap(t)}</a:t></a:r>`)
        .join("<a:br/>");
  const body = `<${tx.naam} xmlns:a="${A}">${fragment(kind(tx, "bodyPr")) || "<a:bodyPr/>"}${fragment(kind(tx, "lstStyle")) || "<a:lstStyle/>"}<a:p>${fragment(ppr)}${tekst}${fragment(end)}</a:p></${tx.naam}>`;
  const wijzigingen: Vervanging[] = [
    { start: tx.start, eind: tx.eind, tekst: body },
  ];
  if (id !== undefined) {
    const cnv = kind(kind(root, "nvSpPr"), "cNvPr");
    if (cnv) wijzigingen.push(tagAttrs(xml, cnv, { id: String(id) }));
  }
  return vervang(xml, wijzigingen);
}

/** Pas toe op de gekozen dia's. De overige dia's en pakketonderdelen blijven bytegelijk. */
export function schrijfVoetteksten(
  bytes: Uint8Array,
  selectie: readonly number[],
  opties: Voetteksten,
  nu = new Date(),
  locale = "nl-NL",
) {
  const pakket = new Pakket(bytes),
    pres = presentatie(pakket);
  if (
    !selectie.length ||
    selectie.some((i) => !Number.isInteger(i) || i < 0 || i >= pres.dias.length)
  )
    throw new VoettekstFout("invalidSelection");
  const eerste = Number(attr(pres.wortel, "firstSlideNum") ?? 1);
  const datum = opties.automatisch
    ? new Intl.DateTimeFormat(locale, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(nu)
    : opties.datumTekst;
  for (const index of new Set(selectie)) {
    const pad = pres.dias[index],
      xml = pakket.lees(pad),
      root = leesXml(xml);
    const tree = kind(kind(root, "cSld"), "spTree");
    if (!tree || tree.leeg) throw new VoettekstFout("invalidPresentation");
    const bestaand = vormen(root),
      wijzigingen: Vervanging[] = [];
    let id = zoekAlle(root, "cNvPr").reduce(
      (max, n) => Math.max(max, Number(attr(n, "id")) || 0),
      0,
    );
    const nieuw: string[] = [];
    const titel = opties.nietOpTitel && titelDia(pakket, pad);
    for (const type of SOORTEN) {
      const aan =
        !titel &&
        (type === "dt"
          ? opties.datum
          : type === "ftr"
            ? opties.voettekst
            : opties.dianummer);
      const oud = bestaand.filter((v) => soort(v) === type);
      const waarde =
        type === "dt"
          ? datum
          : type === "ftr"
            ? opties.tekst
            : String(eerste + index);
      oud.forEach((v, i) =>
        wijzigingen.push({
          start: v.start,
          eind: v.eind,
          tekst:
            aan && i === 0
              ? vormTekst(
                  xml.slice(v.start, v.eind),
                  type,
                  waarde,
                  opties.automatisch,
                )
              : "",
        }),
      );
      if (aan && !oud.length) {
        const vorm =
          sjabloon(pakket, pad, type) ??
          nieuweVorm(type, id + 1, pres.breedte, pres.hoogte);
        nieuw.push(vormTekst(vorm, type, waarde, opties.automatisch, ++id));
      }
    }
    if (nieuw.length) {
      const plek = kind(tree, "extLst")?.start ?? tree.inhoudEind;
      wijzigingen.push({ start: plek, eind: plek, tekst: nieuw.join("") });
    }
    if (wijzigingen.length) pakket.schrijf(pad, vervang(xml, wijzigingen));
  }
  pakket.schrijf(
    pres.pad,
    vervang(pres.xml, [
      tagAttrs(pres.xml, pres.wortel, {
        showSpecialPlsOnTitleSld: opties.nietOpTitel ? "0" : "1",
      }),
    ]),
  );
  return pakket.inpakken();
}
