/** PPTX-diaovergangen: bewerk alleen de gekozen dia's en behoud onbekende inhoud. */
import { Pakket, REL } from "../grafieken/pakket";
import {
  attr,
  attrTekst,
  attrNs,
  elementen,
  kind,
  kinderen,
  leesXml,
  namespaceVan,
  ontsnap,
  rid,
  vervang,
  type XmlElement,
} from "../grafieken/xml";

const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const P14 = "http://schemas.microsoft.com/office/powerpoint/2010/main";
const MC = "http://schemas.openxmlformats.org/markup-compatibility/2006";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
export interface Geluidsbestand {
  bytes: Uint8Array;
  naam: string;
}
export type OvergangGeluid =
  | { stop: true }
  | { bytes: Uint8Array; mime: string; naam: string; loop: boolean }
  | null;

export function geldigOvergangGeluid(bytes: Uint8Array) {
  const tekst = (i: number, n: number) =>
    String.fromCharCode(...bytes.subarray(i, i + n));
  if (
    bytes.length < 44 ||
    bytes.length > 10 * 1024 * 1024 ||
    tekst(0, 4) !== "RIFF" ||
    tekst(8, 4) !== "WAVE"
  )
    return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    eind = view.getUint32(4, true) + 8;
  if (eind > bytes.length || eind < 44) return false;
  let formaat = false,
    data = false;
  for (let i = 12; i + 8 <= eind; ) {
    const n = view.getUint32(i + 4, true),
      start = i + 8;
    if (start + n > eind) return false;
    if (tekst(i, 4) === "fmt ") {
      if (n < 16) return false;
      const code = view.getUint16(start, true),
        kanalen = view.getUint16(start + 2, true),
        hz = view.getUint32(start + 4, true),
        bits = view.getUint16(start + 14, true);
      formaat =
        ((code === 1 && [8, 16, 24, 32].includes(bits)) ||
          (code === 3 && [32, 64].includes(bits))) &&
        [1, 2].includes(kanalen) &&
        hz >= 8000 &&
        hz <= 192000 &&
        view.getUint16(start + 12, true) === (kanalen * bits) / 8;
    }
    if (tekst(i, 4) === "data" && n > 0) data = true;
    i = start + n + (n % 2);
  }
  return formaat && data;
}
export const EFFECTEN = [
  "none",
  "fade",
  "push",
  "wipe",
  "split",
  "zoom",
] as const;
export type Effect = (typeof EFFECTEN)[number];
export interface Overgang {
  effect: Effect | "unknown";
  duur: number;
  richting: "l" | "r" | "u" | "d";
  orientatie: "horz" | "vert";
  inUit: "in" | "out";
  klik: boolean;
  na: number | null;
  geluid: boolean;
}
export const GEEN_OVERGANG: Overgang = {
  effect: "none",
  duur: 700,
  richting: "l",
  orientatie: "horz",
  inUit: "out",
  klik: true,
  na: null,
  geluid: false,
};
export class OvergangFout extends Error {}

export function diaPaden(pakket: Pakket) {
  const rel = pakket
    .relaties("")
    .find((r) => r.type === REL.officeDocument && !r.extern);
  if (!rel) throw new OvergangFout("invalidPresentation");
  const pad = Pakket.doelPad("", rel.target);
  return kinderen(kind(leesXml(pakket.lees(pad)), "sldIdLst"), "sldId").map(
    (d) => {
      const doel = pakket.doel(pad, rid(d) ?? "");
      if (!doel) throw new OvergangFout("invalidPresentation");
      return doel;
    },
  );
}

/** PowerPoint schrijft vaak Choice/Fallback om een overgang met exacte duur. */
function overgangen(root: XmlElement): XmlElement[] {
  const uit: XmlElement[] = [];
  for (const el of elementen(root)) {
    if (el.lokaal === "transition" && namespaceVan(el, el.voorvoegsel) === P)
      uit.push(el);
    else if (
      el.lokaal === "AlternateContent" &&
      namespaceVan(el, el.voorvoegsel) === MC
    ) {
      for (const tak of elementen(el)) uit.push(...overgangen(tak));
    }
  }
  return uit;
}

function lees(el: XmlElement | undefined): Overgang {
  if (!el) return { ...GEEN_OVERGANG };
  const effectEl = elementen(el).find(
    (e) => !["sndAc", "extLst"].includes(e.lokaal),
  );
  const bekend =
    effectEl &&
    namespaceVan(effectEl, effectEl.voorvoegsel) === P &&
    EFFECTEN.includes(effectEl.lokaal as Effect);
  const dur = Object.keys(el.attrs).find(
    (k) => k.endsWith(":dur") && namespaceVan(el, k.split(":")[0]) === P14,
  );
  const ms = dur
    ? Number(el.attrs[dur])
    : ({ fast: 500, med: 750, slow: 1000 }[attr(el, "spd") ?? "fast"] ?? 500);
  const richting = attr(effectEl, "dir");
  const na = attr(el, "advTm");
  return {
    effect: !effectEl
      ? "none"
      : bekend
        ? (effectEl.lokaal as Effect)
        : "unknown",
    duur: Number.isFinite(ms) && ms >= 0 ? ms : 700,
    richting: ["l", "r", "u", "d"].includes(richting ?? "")
      ? (richting as Overgang["richting"])
      : "l",
    orientatie: attr(effectEl, "orient") === "vert" ? "vert" : "horz",
    inUit: richting === "in" ? "in" : "out",
    klik: !["0", "false"].includes(attr(el, "advClick") ?? "1"),
    na:
      na !== undefined && Number.isFinite(Number(na)) && Number(na) >= 0
        ? Number(na)
        : null,
    geluid: !!kind(el, "sndAc"),
  };
}

export function leesOvergangen(bytes: Uint8Array): Overgang[] {
  const pakket = new Pakket(bytes);
  return diaPaden(pakket).map((pad) =>
    lees(overgangen(leesXml(pakket.lees(pad)))[0]),
  );
}

/** Alleen interne media; gelinkte bestanden worden nooit automatisch opgehaald. */
export function leesOvergangGegevens(bytes: Uint8Array): {
  overgangen: Overgang[];
  geluiden: OvergangGeluid[];
} {
  const pakket = new Pakket(bytes);
  const types = leesXml(pakket.lees("[Content_Types].xml"));
  const lijst: Overgang[] = [];
  const geluiden: OvergangGeluid[] = diaPaden(pakket).map((pad) => {
    const overgang = overgangen(leesXml(pakket.lees(pad)))[0];
    lijst.push(lees(overgang));
    const actie = kind(overgang, "sndAc");
    if (kind(actie, "endSnd")) return { stop: true };
    const start = kind(actie, "stSnd"),
      snd = kind(start, "snd");
    const id = attrNs(snd, R, "embed");
    const rel =
      id && pakket.relaties(pad).find((r) => r.id === id && !r.extern);
    if (!rel) return null;
    const media = Pakket.doelPad(pad, rel.target),
      data = pakket.bytes(media);
    if (!data) return null;
    const ext = media.split(".").pop() ?? "";
    const override = kinderen(types, "Override").find(
      (e) => attr(e, "PartName") === "/" + media,
    );
    const standaard = kinderen(types, "Default").find(
      (e) => attr(e, "Extension")?.toLowerCase() === ext.toLowerCase(),
    );
    const mime = attr(override ?? standaard, "ContentType") ?? "audio/wav";
    return {
      bytes: data,
      mime,
      naam: attr(snd, "name") ?? media.split("/").pop() ?? "",
      loop: ["true", "1"].includes(attr(start, "loop") ?? "0"),
    };
  });
  return { overgangen: lijst, geluiden };
}

export const leesOvergangGeluiden = (bytes: Uint8Array) =>
  leesOvergangGegevens(bytes).geluiden;

function effectXml(o: Overgang) {
  if (o.effect === "none") return "";
  if (o.effect === "unknown") throw new OvergangFout("unknownEffect");
  const attrs =
    o.effect === "push" || o.effect === "wipe"
      ? { dir: o.richting }
      : o.effect === "split"
        ? { dir: o.inUit, orient: o.orientatie }
        : o.effect === "zoom"
          ? { dir: o.inUit }
          : {};
  return `<p:${o.effect}${attrTekst(attrs)}/>`;
}

/** Bewaar onbekende effecten zolang de gebruiker ze niet expliciet vervangt. */
function wijzig(
  xml: string,
  el: XmlElement | undefined,
  o: Overgang,
  geluidBehouden: boolean,
  exact: boolean,
  nieuwGeluid?: string,
) {
  const attrs = { ...(el?.attrs ?? {}) };
  for (const k of Object.keys(attrs)) {
    if (k.endsWith(":dur") && el && namespaceVan(el, k.split(":")[0]) === P14)
      delete attrs[k];
  }
  attrs.spd = o.duur <= 500 ? "fast" : o.duur <= 750 ? "med" : "slow";
  attrs.advClick = o.klik ? "1" : "0";
  if (o.na === null) delete attrs.advTm;
  else attrs.advTm = String(o.na);
  attrs["xmlns:p"] = P;
  if (exact) {
    attrs["xmlns:p14"] = P14;
    attrs["p14:dur"] = String(o.duur);
    attrs["xmlns:mc"] = MC;
    attrs["mc:Ignorable"] = [
      ...new Set(
        (attrs["mc:Ignorable"] ?? "")
          .split(/\s+/)
          .filter(Boolean)
          .concat("p14"),
      ),
    ].join(" ");
  }
  const kinderenXml = el ? elementen(el) : [];
  const bestaandEffect = kinderenXml.filter(
    (e) => !["sndAc", "extLst"].includes(e.lokaal),
  );
  const fragment = (e: XmlElement) => xml.slice(e.start, e.eind);
  // Bij behoud blijven bronprefixen in dezelfde XML-context staan.
  const voor = lees(el);
  const zelfdeEffect =
    o.effect === voor.effect &&
    (!(o.effect === "push" || o.effect === "wipe") ||
      o.richting === voor.richting) &&
    (!(o.effect === "split" || o.effect === "zoom") ||
      o.inUit === voor.inUit) &&
    (o.effect !== "split" || o.orientatie === voor.orientatie);
  const effect =
    o.effect === "unknown" || zelfdeEffect
      ? bestaandEffect.map(fragment).join("")
      : effectXml(o);
  const geluid =
    nieuwGeluid ??
    (geluidBehouden
      ? kinderenXml
          .filter((e) => e.lokaal === "sndAc")
          .map(fragment)
          .join("")
      : "");
  const ext = kinderenXml
    .filter((e) => e.lokaal === "extLst")
    .map(fragment)
    .join("");
  return `<p:transition${attrTekst(attrs)}>${effect}${geluid}${ext}</p:transition>`;
}

export function schrijfOvergangen(
  bytes: Uint8Array,
  selectie: readonly number[],
  o: Overgang,
  geluidBehouden = true,
  nieuwGeluid?: Geluidsbestand,
) {
  const pakket = new Pakket(bytes),
    paden = diaPaden(pakket);
  if (
    !selectie.length ||
    selectie.some((i) => !Number.isInteger(i) || i < 0 || i >= paden.length)
  )
    throw new OvergangFout("invalidSelection");
  if (
    !Number.isInteger(o.duur) ||
    o.duur < 0 ||
    o.duur > 60000 ||
    (o.na !== null &&
      (!Number.isInteger(o.na) || o.na < 0 || o.na > 86400000)) ||
    (!o.klik && o.na === null)
  )
    throw new OvergangFout("invalidTiming");
  if (nieuwGeluid && !geldigOvergangGeluid(nieuwGeluid.bytes))
    throw new OvergangFout("invalidSound");
  let media: string | undefined;
  if (nieuwGeluid) {
    media = pakket.vrijPad("ppt/media/transition#.wav");
    pakket.schrijf(media, nieuwGeluid.bytes);
    pakket.voegOverrideToe(media, "audio/wav");
  }
  for (const i of new Set(selectie)) {
    const pad = paden[i],
      xml = pakket.lees(pad),
      root = leesXml(xml),
      lijst = overgangen(root);
    const geluid =
      media && nieuwGeluid
        ? `<p:sndAc><p:stSnd loop="0"><p:snd xmlns:r="${R}" r:embed="${pakket.voegRelatieToe(pad, `${R}/audio`, media)}" name="${ontsnap(nieuwGeluid.naam)}"/></p:stSnd></p:sndAc>`
        : undefined;
    if (lijst.length) {
      pakket.schrijf(
        pad,
        vervang(
          xml,
          lijst.map((el) => ({
            start: el.start,
            eind: el.eind,
            tekst: wijzig(xml, el, o, geluidBehouden, true, geluid),
          })),
        ),
      );
    } else {
      // MCE houdt een standaardfallback voor lezers van vóór Office 2010.
      const exact = wijzig(xml, undefined, o, geluidBehouden, true, geluid);
      const fallback = wijzig(xml, undefined, o, geluidBehouden, false, geluid);
      const nieuw = `<mc:AlternateContent xmlns:mc="${MC}" xmlns:p14="${P14}"><mc:Choice Requires="p14">${exact}</mc:Choice><mc:Fallback>${fallback}</mc:Fallback></mc:AlternateContent>`;
      const plek =
        kind(root, "timing")?.start ??
        kind(root, "extLst")?.start ??
        root.inhoudEind;
      pakket.schrijf(
        pad,
        vervang(xml, [{ start: plek, eind: plek, tekst: nieuw }]),
      );
    }
  }
  return pakket.inpakken();
}
