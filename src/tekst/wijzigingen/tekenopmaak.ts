/** Beperkte, verliesvrije opmaakvergelijking voor gewone hoofdalinea's (#297). */
import type { DocxComparedChange } from "@betteroffice/docx";
import { unzipSync } from "fflate";
import { Pakket, REL } from "../../grafieken/pakket";
import { zipDelen } from "../../grafieken/zipdelen";
import {
  attrNs,
  elementen,
  leesXml,
  namespaceVan,
  ontsnap,
  tekstVan,
  vervang,
  type XmlElement,
  type Vervanging,
} from "../../grafieken/xml";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const XML = "http://www.w3.org/XML/1998/namespace";
const W14 = "http://schemas.microsoft.com/office/word/2010/wordml";
const MAX_WIJZIGINGEN = 128;
const MAX_XML = 16 * 1024 * 1024;
const EIGENSCHAPPEN = new Set([
  "b",
  "i",
  "u",
  "strike",
  "dstrike",
  "color",
  "sz",
  "szCs",
  "rFonts",
  "highlight",
  "vertAlign",
  "caps",
  "smallCaps",
  "bCs",
  "iCs",
  "lang",
  "rtl",
  "spacing",
  "kern",
  "position",
  "w",
  "noProof",
]);
export type OpmaakWijziging = DocxComparedChange & { opmaak: true };
interface Run {
  el: XmlElement;
  opmaak: XmlElement | undefined;
  sleutel: string;
  metadata: string;
  start: number;
  eind: number;
}
interface Alinea {
  el: XmlElement;
  runs: Run[];
  tekst: string;
}
const isW = (e: XmlElement, naam: string) =>
  e.lokaal === naam && namespaceVan(e, e.voorvoegsel) === W;
function naamNs(e: XmlElement, naam: string, attribuut = false) {
  const dp = naam.indexOf(":");
  const prefix = dp < 0 ? "" : naam.slice(0, dp);
  const ns =
    prefix === "xml"
      ? XML
      : attribuut && !prefix
        ? ""
        : (namespaceVan(e, prefix) ?? "");
  return `{${ns}}${dp < 0 ? naam : naam.slice(dp + 1)}`;
}
function attributen(e: XmlElement) {
  return Object.entries(e.attrs)
    .filter(([k]) => k !== "xmlns" && !k.startsWith("xmlns:"))
    .map(([k, v]) => [naamNs(e, k, true), v])
    .filter(([k]) => !k.startsWith(`{${W}}rsid`) && k !== `{${W14}}textId`)
    .sort(([a], [b]) => a.localeCompare(b));
}
function boom(e: XmlElement): unknown {
  const kinderen = elementen(e);
  return [
    naamNs(e, e.naam),
    attributen(e),
    kinderen.length ? kinderen.map(boom) : tekstVan(e),
  ];
}
const canon = (e: XmlElement) => JSON.stringify(boom(e));
const bytesGelijk = (a: Uint8Array, b: Uint8Array) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};
function andereDelenGelijk(a: Uint8Array, b: Uint8Array, hoofdpakket: string) {
  const za = zipDelen(a),
    zb = zipDelen(b);
  if (!za || !zb) return false;
  const meenemen = (naam: string) =>
    naam !== hoofdpakket && naam !== "docProps/core.xml" && !naam.endsWith("/");
  const aa = za.filter((d) => meenemen(d.naam)),
    bb = new Map(zb.filter((d) => meenemen(d.naam)).map((d) => [d.naam, d]));
  if (aa.length !== bb.size) return false;
  for (const deel of aa) {
    const ander = bb.get(deel.naam);
    if (!ander) return false;
    if (bytesGelijk(deel.lokaal, ander.lokaal)) continue;
    const uitA = unzipSync(a, { filter: (f) => f.name === deel.naam })[
      deel.naam
    ];
    const uitB = unzipSync(b, { filter: (f) => f.name === deel.naam })[
      deel.naam
    ];
    if (!uitA || !uitB || !bytesGelijk(uitA, uitB)) return false;
  }
  return true;
}
function leesAlinea(el: XmlElement): Alinea | null {
  const kinderen = elementen(el);
  if (kinderen.some((k, i) => !isW(k, "r") && !(i === 0 && isW(k, "pPr"))))
    return null;
  // Geen betekenisvolle losse tekst tussen runs laten verdwijnen.
  if (el.kinderen.some((k) => k.soort === "tekst" && k.tekst.trim()))
    return null;
  let tekst = "";
  const runs: Run[] = [];
  for (const r of kinderen.filter((k) => isW(k, "r"))) {
    const inhoud = elementen(r),
      pr = inhoud.find((k) => isW(k, "rPr"));
    const teksten = inhoud.filter((k) => isW(k, "t"));
    if (
      teksten.length !== 1 ||
      inhoud.some((k) => k !== pr && k !== teksten[0]) ||
      r.kinderen.some((k) => k.soort === "tekst" && k.tekst.trim())
    )
      return null;
    const t = teksten[0];
    if (
      elementen(t).length ||
      attributen(t).some(([k]) => k !== `{${XML}}space`)
    )
      return null;
    if (pr) {
      const props = elementen(pr);
      if (
        attributen(pr).length ||
        props.some(
          (k) =>
            namespaceVan(k, k.voorvoegsel) !== W ||
            !EIGENSCHAPPEN.has(k.lokaal) ||
            elementen(k).length > 0 ||
            tekstVan(k).trim().length > 0,
        ) ||
        new Set(props.map((k) => k.lokaal)).size !== props.length
      )
        return null;
    }
    const start = tekst.length;
    tekst += tekstVan(t);
    if (tekst.length === start) return null;
    runs.push({
      el: r,
      opmaak: pr,
      start,
      eind: tekst.length,
      sleutel: JSON.stringify(pr ? elementen(pr).map(canon).sort() : []),
      metadata: JSON.stringify(attributen(r)),
    });
  }
  return { el, runs, tekst };
}
function namespaces(el: XmlElement) {
  const attrs = new Map<string, string>();
  for (let e: XmlElement | null = el; e; e = e.ouder)
    for (const [k, v] of Object.entries(e.attrs))
      if ((k === "xmlns" || k.startsWith("xmlns:")) && !attrs.has(k))
        attrs.set(k, v);
  return [...attrs]
    .filter(([k]) => !(k in el.attrs))
    .map(([k, v]) => ` ${k}="${ontsnap(v)}"`)
    .join("");
}
function deelRun(
  xml: string,
  a: Alinea,
  van: number,
  tot: number,
  verwijderd = false,
  eigenBron = false,
  budget?: { over: number },
) {
  return a.runs
    .filter((r) => r.start < tot && r.eind > van)
    .map((r) => {
      const start = Math.max(r.start, van),
        eind = Math.min(r.eind, tot);
      const controleer = (tekst: string) => {
        if (budget) {
          budget.over -= tekst.length;
          if (budget.over < 0)
            throw new Error("format comparison output limit");
        }
        return tekst;
      };
      if (!verwijderd && start === r.start && eind === r.eind)
        return controleer(
          eigenBron
            ? xml.slice(r.el.start, r.el.eind)
            : vervang(xml.slice(r.el.start, r.el.eind), [
                {
                  start: r.el.inhoudStart - r.el.start - 1,
                  eind: r.el.inhoudStart - r.el.start - 1,
                  tekst: namespaces(r.el),
                },
              ]),
        );
      const open =
        xml.slice(r.el.start, r.el.inhoudStart - 1) + namespaces(r.el) + ">";
      const pr = r.opmaak ? xml.slice(r.opmaak.start, r.opmaak.eind) : "";
      const tag = verwijderd ? "delText" : "t";
      return controleer(
        `${open}${pr}<oosw:${tag} xmlns:oosw="${W}" xml:space="preserve">${ontsnap(a.tekst.slice(start, eind))}</oosw:${tag}></${r.el.naam}>`,
      );
    })
    .join("");
}
function deelPad(p: Pakket) {
  const rels = p
    .relaties("")
    .filter((r) => r.type === REL.officeDocument && !r.extern);
  if (rels.length !== 1) return null;
  return decodeURIComponent(Pakket.doelPad("", rels[0].target));
}
const sha = async (bytes: Uint8Array) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes)),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

/** Alleen voor nacontrole: de native opslag laat een lege slotsectie weg.
 * Een sectiegrens in pPr of een slotsectie met instellingen blijft intact. */
export function zonderLegeSlotSectie(bytes: Uint8Array) {
  const pakket = new Pakket(bytes),
    pad = deelPad(pakket);
  if (!pad) return bytes;
  const xml = pakket.lees(pad),
    root = leesXml(xml),
    body = elementen(root).find((e) => isW(e, "body"));
  const slot = body && elementen(body).at(-1);
  if (
    !slot ||
    !isW(slot, "sectPr") ||
    attributen(slot).length ||
    elementen(slot).length ||
    tekstVan(slot).trim()
  )
    return bytes;
  pakket.schrijf(
    pad,
    vervang(xml, [{ start: slot.start, eind: slot.eind, tekst: "" }]),
  );
  return pakket.inpakken();
}

/** Alleen aanroepen nadat de native inspectie uitsluitend tekenopmaak weigert. */
export async function vergelijkTekenopmaak(
  origineel: Uint8Array,
  gewijzigd: Uint8Array,
  auteur: string,
  datum: string,
) {
  try {
    const a = new Pakket(origineel),
      b = new Pakket(gewijzigd);
    const padA = deelPad(a),
      padB = deelPad(b);
    if (!padA || padA !== padB) return null;
    if (!andereDelenGelijk(origineel, gewijzigd, padA)) return null;
    const xmlA = a.lees(padA),
      xmlB = b.lees(padB);
    if (xmlA.length > MAX_XML || xmlB.length > MAX_XML) return null;
    const rootA = leesXml(xmlA),
      rootB = leesXml(xmlB);
    if (!isW(rootA, "document") || !isW(rootB, "document")) return null;
    const bodiesA = elementen(rootA).filter((k) => isW(k, "body")),
      bodiesB = elementen(rootB).filter((k) => isW(k, "body"));
    if (bodiesA.length !== 1 || bodiesB.length !== 1) return null;
    const bodyA = bodiesA[0],
      bodyB = bodiesB[0],
      alineaA = new Map<XmlElement, Alinea>(),
      alineaB = new Map<XmlElement, Alinea>();
    for (const [body, doel] of [
      [bodyA, alineaA],
      [bodyB, alineaB],
    ] as const)
      for (const el of elementen(body).filter((k) => isW(k, "p"))) {
        const p = leesAlinea(el);
        if (p) doel.set(el, p);
      }
    function structuur(
      el: XmlElement,
      lijst: Map<XmlElement, Alinea>,
    ): unknown {
      const p = lijst.get(el);
      return [
        naamNs(el, el.naam),
        attributen(el),
        p
          ? [
              elementen(el)
                .filter((k) => !isW(k, "r"))
                .map(canon),
              p.tekst,
            ]
          : elementen(el).length
            ? elementen(el).map((k) => structuur(k, lijst))
            : tekstVan(el),
      ];
    }
    if (
      JSON.stringify(structuur(rootA, alineaA)) !==
      JSON.stringify(structuur(rootB, alineaB))
    )
      return null;
    const bezet = new Set<string>();
    function ids(el: XmlElement) {
      const id = attrNs(el, W, "id");
      if (id) bezet.add(id);
      elementen(el).forEach(ids);
    }
    ids(rootA);
    let volgend = 0;
    const id = () => {
      while (bezet.has(String(volgend))) volgend++;
      const uit = String(volgend++);
      bezet.add(uit);
      return uit;
    };
    // De native reviewroute leest deze metadata via de standaard w:-namen.
    const revisie = (soort: "del" | "ins", inhoud: string) =>
      `<w:${soort} xmlns:w="${W}" w:id="${id()}" w:author="${ontsnap(auteur)}" w:date="${ontsnap(datum)}">${inhoud}</w:${soort}>`;
    const wijzigingen: OpmaakWijziging[] = [],
      vervangingen: Vervanging[] = [];
    const budget = { over: MAX_XML };
    const hashA = await sha(
      unzipSync(origineel, { filter: (f) => f.name === padA })[padA],
    );
    const hashB = await sha(
      unzipSync(gewijzigd, { filter: (f) => f.name === padB })[padB],
    );
    const elsA = elementen(bodyA),
      elsB = elementen(bodyB);
    for (let i = 0; i < elsA.length; i++) {
      const pa = alineaA.get(elsA[i]),
        pb = alineaB.get(elsB[i]);
      if (!pa || !pb || !pa.runs.length || !pb.runs.length) continue;
      const grenzen = [
        ...new Set([
          0,
          ...pa.runs.map((r) => r.eind),
          ...pb.runs.map((r) => r.eind),
        ]),
      ].sort((a, b) => a - b);
      const gebieden: { start: number; eind: number; anders: boolean }[] = [];
      let ia = 0,
        ib = 0;
      for (let j = 0; j < grenzen.length - 1; j++) {
        const start = grenzen[j],
          eind = grenzen[j + 1];
        while (pa.runs[ia].eind <= start) ia++;
        while (pb.runs[ib].eind <= start) ib++;
        if (pa.runs[ia].metadata !== pb.runs[ib].metadata) return null;
        const anders = pa.runs[ia].sleutel !== pb.runs[ib].sleutel,
          laatste = gebieden.at(-1);
        if (laatste?.anders === anders) laatste.eind = eind;
        else gebieden.push({ start, eind, anders });
      }
      if (!gebieden.some((g) => g.anders)) continue;
      let inhoud = "";
      for (const g of gebieden) {
        const oud = deelRun(xmlA, pa, g.start, g.eind, g.anders, true, budget);
        if (!g.anders) {
          inhoud += oud;
          continue;
        }
        if (wijzigingen.length >= MAX_WIJZIGINGEN) return null;
        inhoud +=
          revisie("del", oud) +
          revisie(
            "ins",
            deelRun(xmlB, pb, g.start, g.eind, false, false, budget),
          );
        const tekst = pa.tekst.slice(g.start, g.eind);
        wijzigingen.push({
          id: `format-${wijzigingen.length + 1}`,
          kind: "replacement",
          opmaak: true,
          original: {
            part: padA,
            partSha256: hashA,
            path: [elementen(rootA).indexOf(bodyA), i],
            start: g.start,
            end: g.eind,
            text: tekst,
          },
          revised: {
            part: padB,
            partSha256: hashB,
            path: [elementen(rootB).indexOf(bodyB), i],
            start: g.start,
            end: g.eind,
            text: tekst,
          },
        });
      }
      vervangingen.push({
        start: pa.runs[0].el.start,
        eind: pa.runs.at(-1)!.el.eind,
        tekst: inhoud,
      });
    }
    if (!wijzigingen.length) return null;
    const hoofd = vervang(xmlA, vervangingen);
    if (hoofd.length > MAX_XML) return null;
    a.schrijf(padA, hoofd);
    const bytes = a.inpakken();
    if (bytes.length > 32 * 1024 * 1024) return null;
    return { bytes, wijzigingen };
  } catch {
    return null;
  }
}
