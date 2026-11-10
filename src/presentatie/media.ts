/** Ingesloten presentatiemedia; geen transcodering en geen ongevraagde netwerkverzoeken. */
import { Pakket } from "../grafieken/pakket";
import {
  attr,
  attrNs,
  elementen,
  kind,
  leesXml,
  namespaceVan,
  ontsnap,
  vervang,
  zoekAlle,
  type XmlElement,
} from "../grafieken/xml";
import { controleerPakket } from "../pakketcontrole";
import { diaPaden } from "./overgangen";
import { isEenvoudigeMedia, PRESENTATION_NS as P } from "./media-timing";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main",
  R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const P14 = "http://schemas.microsoft.com/office/powerpoint/2010/main";
const FORMATS: Record<string, { mime: string; soort: "audio" | "video" }> = {
  mp4: { mime: "video/mp4", soort: "video" },
  webm: { mime: "video/webm", soort: "video" },
  mp3: { mime: "audio/mpeg", soort: "audio" },
  m4a: { mime: "audio/mp4", soort: "audio" },
  wav: { mime: "audio/wav", soort: "audio" },
};
export class MediaFout extends Error {}
export interface MediaInstellingen {
  automatisch: boolean;
  herhalen: boolean;
  volume: number;
  begin: number;
  eindeAf: number;
}
export interface DiaMedium extends MediaInstellingen {
  id: number;
  naam: string;
  soort: "audio" | "video";
  mime: string;
  bytes: Uint8Array | null;
  poster?: Uint8Array;
  extern: boolean;
  bewerkbaar: boolean;
  opDia: boolean;
  x: number;
  y: number;
  breedte: number;
  hoogte: number;
  rotatie: number;
}
export const STANDAARD_MEDIA: MediaInstellingen = {
  automatisch: false,
  herhalen: false,
  volume: 1,
  begin: 0,
  eindeAf: 0,
};
export function mediaFormaat(naam: string, bytes: Uint8Array) {
  const ext = naam.split(".").pop()?.toLowerCase() ?? "",
    f = FORMATS[ext];
  const s = (i: number, n: number) =>
    String.fromCharCode(...bytes.subarray(i, i + n));
  if (!f || bytes.length < 12 || bytes.length > 50 * 1024 * 1024)
    throw new MediaFout("invalidFile");
  const geldig =
    ext === "wav"
      ? s(0, 4) === "RIFF" && s(8, 4) === "WAVE"
      : ext === "webm"
        ? bytes[0] === 0x1a &&
          bytes[1] === 0x45 &&
          bytes[2] === 0xdf &&
          bytes[3] === 0xa3
        : ext === "mp3"
          ? s(0, 3) === "ID3" ||
            (bytes[0] === 255 && (bytes[1] & 0xe0) === 0xe0)
          : s(4, 4) === "ftyp";
  if (!geldig) throw new MediaFout("invalidFile");
  return { ...f, ext };
}
function deel(p: Pakket, index: number) {
  const pad = diaPaden(p)[index];
  if (!Number.isInteger(index) || !pad) throw new MediaFout("invalidSlide");
  const xml = p.lees(pad);
  return { pad, xml, root: leesXml(xml) };
}
function mediaNode(root: XmlElement, id: number) {
  return [...zoekAlle(root, "video"), ...zoekAlle(root, "audio")]
    .filter((n) => namespaceVan(n, n.voorvoegsel) === P)
    .find(
      (n) =>
        Number(
          attr(kind(kind(kind(n, "cMediaNode"), "tgtEl"), "spTgt"), "spid"),
        ) === id,
    );
}
function lees(p: Pakket, index: number): DiaMedium[] {
  const d = deel(p, index),
    size = kind(leesXml(p.lees("ppt/presentation.xml")), "sldSz"),
    w = Number(attr(size, "cx")),
    h = Number(attr(size, "cy"));
  return zoekAlle(d.root, "pic").flatMap((pic) => {
    const nv = kind(pic, "nvPicPr"),
      pr = kind(nv, "cNvPr"),
      nvpr = kind(nv, "nvPr");
    const media = zoekAlle(nvpr ?? pic, "media").find(
      (n) => namespaceVan(n, n.voorvoegsel) === P14,
    );
    const file =
      zoekAlle(nvpr ?? pic, "videoFile")[0] ??
      zoekAlle(nvpr ?? pic, "audioFile")[0];
    if (!media && !file) return [];
    const rid =
        attrNs(media, R, "embed") ??
        attrNs(media, R, "link") ??
        attrNs(file, R, "link"),
      rel = p.relaties(d.pad).find((r) => r.id === rid);
    const path = rel && !rel.extern ? Pakket.doelPad(d.pad, rel.target) : "",
      ext = path.split(".").pop()?.toLowerCase() ?? "";
    const soort =
      file?.lokaal === "audioFile" ? "audio" : (FORMATS[ext]?.soort ?? "video");
    const id = Number(attr(pr, "id")),
      node = mediaNode(d.root, id),
      m = kind(node, "cMediaNode"),
      time = kind(m, "cTn"),
      trim = kind(media, "trim");
    const xf = kind(kind(pic, "spPr"), "xfrm"),
      off = kind(xf, "off"),
      sz = kind(xf, "ext");
    const cond = kind(kind(time, "stCondLst"), "cond");
    const ownGeometry =
      pic.ouder?.lokaal === "spTree" &&
      Number.isFinite(w) &&
      w > 0 &&
      h > 0 &&
      !!xf &&
      !attr(xf, "flipH") &&
      !attr(xf, "flipV") &&
      [attr(off, "x"), attr(off, "y"), attr(sz, "cx"), attr(sz, "cy")].every(
        (v) => v !== undefined && Number.isFinite(Number(v)),
      ) &&
      Number(attr(sz, "cx")) > 0 &&
      Number(attr(sz, "cy")) > 0;
    const numeric = (v: string | undefined, fallback: number) =>
      v === undefined ? fallback : Number(v);
    const volume =
      attr(m, "mute") === "1" || attr(m, "mute") === "true"
        ? 0
        : numeric(attr(m, "vol"), 100000) / 100000;
    const blip = kind(kind(pic, "blipFill"), "blip"),
      posterPad = p.doel(d.pad, attrNs(blip, R, "embed") ?? "");
    const boven = elementen(pic.ouder!)
      .slice(elementen(pic.ouder!).indexOf(pic) + 1)
      .filter((n) => n.lokaal !== "extLst");
    return [
      {
        id,
        naam: attr(pr, "name") ?? "",
        soort,
        mime: FORMATS[ext]?.mime ?? "application/octet-stream",
        bytes: path ? (p.bytes(path) ?? null) : null,
        extern: !!rel?.extern,
        poster: posterPad ? p.bytes(posterPad) : undefined,
        opDia:
          ownGeometry &&
          (!node || isEenvoudigeMedia(node)) &&
          (soort === "audio" || !boven.length),
        bewerkbaar: ownGeometry && !!media && !!node && isEenvoudigeMedia(node),
        automatisch:
          !!cond && !attr(cond, "evt") && attr(cond, "delay") === "0",
        herhalen: attr(time, "repeatCount") === "indefinite",
        volume,
        begin: numeric(attr(trim, "st"), 0) / 1000,
        eindeAf: numeric(attr(trim, "end"), 0) / 1000,
        x: Number(attr(off, "x")) / w,
        y: Number(attr(off, "y")) / h,
        breedte: Number(attr(sz, "cx")) / w,
        hoogte: Number(attr(sz, "cy")) / h,
        rotatie: numeric(attr(xf, "rot"), 0) / 60000,
      },
    ];
  });
}
export function leesMedia(bytes: Uint8Array, index: number) {
  return lees(new Pakket(bytes), index);
}
export function leesAlleMedia(bytes: Uint8Array) {
  const p = new Pakket(bytes);
  return diaPaden(p).map((_, i) => lees(p, i));
}
function instellingenGoed(s: MediaInstellingen) {
  if (
    typeof s.automatisch !== "boolean" ||
    typeof s.herhalen !== "boolean" ||
    !Number.isFinite(s.volume) ||
    s.volume < 0 ||
    s.volume > 1 ||
    !Number.isFinite(s.begin) ||
    !Number.isFinite(s.eindeAf) ||
    s.begin < 0 ||
    s.eindeAf < 0 ||
    s.begin + s.eindeAf > 86400
  )
    throw new MediaFout("invalidSettings");
}
function timing(
  soort: "audio" | "video",
  shape: number,
  id: number,
  s: MediaInstellingen,
) {
  const target = `<p:tgtEl><p:spTgt spid="${shape}"/></p:tgtEl>`;
  return `<p:${soort} xmlns:p="${P}"><p:cMediaNode vol="${Math.round(s.volume * 100000)}" showWhenStopped="1"><p:cTn id="${id}" dur="indefinite"${s.herhalen ? ' repeatCount="indefinite"' : ""}><p:stCondLst><p:cond delay="0"${s.automatisch ? "/>" : ` evt="onClick">${target}</p:cond>`}</p:stCondLst></p:cTn>${target}</p:cMediaNode></p:${soort}>`;
}
function trimXml(s: MediaInstellingen) {
  return `<p14:trim xmlns:p14="${P14}" st="${s.begin * 1000}" end="${s.eindeAf * 1000}"/>`;
}
function resultaat(p: Pakket) {
  const b = p.inpakken();
  controleerPakket(b, "pptx");
  return b;
}
/** Bijsnijden is niet-destructief: p14:end is de duur die van het einde afgaat. */
export function wijzigMedia(
  bytes: Uint8Array,
  index: number,
  id: number,
  s: MediaInstellingen,
  poster?: Uint8Array,
) {
  instellingenGoed(s);
  const p = new Pakket(bytes),
    d = deel(p, index),
    bestaand = lees(p, index).find((m) => m.id === id);
  if (
    bestaand &&
    !poster &&
    (Object.keys(STANDAARD_MEDIA) as (keyof MediaInstellingen)[]).every(
      (k) => bestaand[k] === s[k],
    )
  )
    return bytes;
  if (!bestaand?.bewerkbaar) throw new MediaFout("unsupportedMedia");
  const pic = zoekAlle(d.root, "pic").find(
      (n) => Number(attr(kind(kind(n, "nvPicPr"), "cNvPr"), "id")) === id,
    )!,
    node = mediaNode(d.root, id)!;
  const media = zoekAlle(pic, "media").find(
      (n) => namespaceVan(n, n.voorvoegsel) === P14,
    )!,
    trim = kind(media, "trim");
  const edits = [
    {
      start: node.start,
      eind: node.eind,
      tekst: timing(
        bestaand.soort,
        id,
        Number(attr(kind(kind(node, "cMediaNode"), "cTn"), "id")),
        s,
      ),
    },
  ];
  if (media.leeg) {
    const start = d.xml
      .slice(media.start, media.inhoudStart)
      .replace(/\/>$/, ">");
    edits.push({
      start: media.start,
      eind: media.eind,
      tekst: `${start}${trimXml(s)}</${media.naam}>`,
    });
  } else
    edits.push({
      start: trim?.start ?? media.inhoudStart,
      eind: trim?.eind ?? media.inhoudStart,
      tekst: trimXml(s),
    });
  if (poster) {
    controleerPoster(poster);
    const blip = kind(kind(pic, "blipFill"), "blip");
    if (!blip) throw new MediaFout("unsupportedMedia");
    const path = p.vrijPad("ppt/media/oos-poster#.png");
    p.schrijf(path, poster);
    p.voegOverrideToe(path, "image/png");
    const rid = p.voegRelatieToe(d.pad, `${R}/image`, path);
    // Alleen de blip vervangen; overige geometrie, uitsnede en vormstijl blijven staan.
    const xml = d.xml.slice(blip.start, blip.eind),
      old = Object.keys(blip.attrs).find((k) => k.split(":").pop() === "embed");
    if (!old) throw new MediaFout("unsupportedMedia");
    edits.push({
      start: blip.start,
      eind: blip.eind,
      tekst: xml.replace(
        new RegExp(
          `${old.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=(?:"[^"]*"|'[^']*')`,
        ),
        `${old}="${rid}"`,
      ),
    });
  }
  p.schrijf(d.pad, vervang(d.xml, edits));
  return resultaat(p);
}
function controleerPoster(bytes: Uint8Array) {
  if (
    bytes.length > 5 * 1024 * 1024 ||
    bytes.length < 24 ||
    ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
  )
    throw new MediaFout("invalidPoster");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    w = v.getUint32(16),
    h = v.getUint32(20);
  if (
    String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR" ||
    w < 1 ||
    h < 1 ||
    w > 8192 ||
    h > 8192 ||
    w * h > 16000000
  )
    throw new MediaFout("invalidPoster");
}
export function voegMediaToe(
  bytes: Uint8Array,
  index: number,
  naam: string,
  inhoud: Uint8Array,
  poster: Uint8Array,
  s: MediaInstellingen,
) {
  instellingenGoed(s);
  controleerPoster(poster);
  const f = mediaFormaat(naam, inhoud),
    p = new Pakket(bytes),
    d = deel(p, index),
    tree = kind(kind(d.root, "cSld"), "spTree");
  if (
    !tree ||
    tree.leeg ||
    zoekAlle(d.root, "timing").some((n) => n.ouder !== d.root)
  )
    throw new MediaFout("unsupportedMedia");
  const id =
    Math.max(
      1,
      ...zoekAlle(d.root, "cNvPr").map((n) => Number(attr(n, "id")) || 0),
    ) + 1;
  const path = p.vrijPad(`ppt/media/oos-media#.${f.ext}`);
  p.schrijf(path, inhoud);
  p.voegOverrideToe(path, f.mime);
  const rFile = p.voegRelatieToe(d.pad, `${R}/${f.soort}`, path),
    rMedia = p.voegRelatieToe(
      d.pad,
      "http://schemas.microsoft.com/office/2007/relationships/media",
      path,
    );
  const image = p.vrijPad("ppt/media/oos-poster#.png");
  p.schrijf(image, poster);
  p.voegOverrideToe(image, "image/png");
  const rImage = p.voegRelatieToe(d.pad, `${R}/image`, image),
    size = kind(leesXml(p.lees("ppt/presentation.xml")), "sldSz");
  const w = Number(attr(size, "cx")),
    h = Number(attr(size, "cy")),
    posterView = new DataView(
      poster.buffer,
      poster.byteOffset,
      poster.byteLength,
    ),
    iw = posterView.getUint32(16),
    ih = posterView.getUint32(20),
    deelMaat = f.soort === "video" ? 0.6 : 0.14,
    schaal = Math.min((w * deelMaat) / iw, (h * deelMaat) / ih),
    pw = Math.round(iw * schaal),
    ph = Math.round(ih * schaal);
  if (!(w > 0 && h > 0)) throw new MediaFout("invalidSlide");
  const pic = `<p:pic xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${R}"><p:nvPicPr><p:cNvPr id="${id}" name="${ontsnap(naam)}"><a:hlinkClick r:id="" action="ppaction://media"/></p:cNvPr><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr><a:${f.soort}File r:link="${rFile}"/><p:extLst><p:ext uri="{DAA4B4D4-6D71-4841-9C94-3DE7FCFB9230}"><p14:media xmlns:p14="${P14}" r:embed="${rMedia}">${trimXml(s)}</p14:media></p:ext></p:extLst></p:nvPr></p:nvPicPr><p:blipFill><a:blip r:embed="${rImage}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${Math.round((w - pw) / 2)}" y="${Math.round((h - ph) / 2)}"/><a:ext cx="${pw}" cy="${ph}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
  const t = kind(d.root, "timing"),
    tn = kind(kind(kind(kind(t, "tnLst"), "par"), "cTn"), "childTnLst"),
    timeId =
      Math.max(
        0,
        ...zoekAlle(d.root, "cTn").map((n) => Number(attr(n, "id")) || 0),
      ) + 1,
    branch = timing(f.soort, id, timeId + 1, s);
  const edits = [{ start: tree.inhoudEind, eind: tree.inhoudEind, tekst: pic }];
  if (tn && !tn.leeg && attr(tn.ouder, "nodeType") === "tmRoot")
    edits.push({ start: tn.inhoudEind, eind: tn.inhoudEind, tekst: branch });
  else if (t) throw new MediaFout("unsupportedMedia");
  else {
    const pos = kind(d.root, "extLst")?.start ?? d.root.inhoudEind;
    edits.push({
      start: pos,
      eind: pos,
      tekst: `<p:timing xmlns:p="${P}"><p:tnLst><p:par><p:cTn id="${timeId}" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>${branch}</p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`,
    });
  }
  p.schrijf(d.pad, vervang(d.xml, edits));
  return resultaat(p);
}
