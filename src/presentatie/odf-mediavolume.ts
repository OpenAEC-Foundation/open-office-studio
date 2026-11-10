/** Media-volume in normale ODF-pluginparameters, met gebonden precisiegegevens. */
import { strToU8 } from "fflate";
import { Pakket } from "../grafieken/pakket";
import {
  attr,
  attrNs,
  attrTekst,
  elementen,
  kind,
  leesXml,
  namespaceVan,
  ontsnap,
  tekstVan,
  vervang,
  zoekAlle,
  type XmlElement,
  type Vervanging,
} from "../grafieken/xml";
import { leesAlleMedia } from "./media";
import { diaPaden } from "./overgangen";
import {
  leesOdfConversie,
  odfAttribuutWijziging as attrs,
  ODF_NS as N,
  internOdfPad,
} from "./odf-overgangen";
const P = "http://schemas.openxmlformats.org/presentationml/2006/main",
  SVG = "urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0";
const META = "OpenOfficeStudio.Presentation.MediaVolume.v1";
type Doc = NonNullable<ReturnType<typeof leesOdfConversie>>;
type Geo = [number, number, number, number];
interface Binding {
  page: number;
  hash: string;
  geo: Geo;
  volume: number;
  muted: boolean;
}
interface Precision {
  version: 1;
  content: string;
  styles: string | null;
  media: Binding[];
}
const is = (e: XmlElement, ns: string, name: string) =>
  e.lokaal === name && namespaceVan(e, e.voorvoegsel) === ns;
const child = (e: XmlElement, ns: string, name: string) =>
  elementen(e).find((n) => is(n, ns, name));
async function sha(bytes: Uint8Array) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        bytes.slice().buffer as ArrayBuffer,
      ),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
function length(text: string | undefined) {
  const m = /^(-?(?:\d+(?:\.\d*)?|\.\d+))(cm|mm|in|pt|pc|px)$/.exec(text ?? "");
  return m
    ? Number(m[1]) *
        ({ cm: 360000, mm: 36000, in: 914400, pt: 12700, pc: 152400, px: 9525 }[
          m[2]
        ] ?? NaN)
    : NaN;
}
function geometry(e: XmlElement): Geo | null {
  if (attr(e, "transform")) return null;
  const g = ["x", "y", "width", "height"].map((k) =>
    length(attrNs(e, SVG, k)),
  ) as Geo;
  return g.every(Number.isFinite) && g[2] > 0 && g[3] > 0 ? g : null;
}
const same = (a: Geo, b: Geo) => a.every((v, i) => Math.abs(v - b[i]) <= 3600);
function pluginPage(plugin: XmlElement, page: XmlElement) {
  let n = plugin.ouder?.ouder;
  while (n && is(n, N.draw, "g")) n = n.ouder;
  return n === page;
}
function parameter(plugin: XmlElement, name: string) {
  return elementen(plugin).filter(
    (n) => is(n, N.draw, "param") && attrNs(n, N.draw, "name") === name,
  );
}
function level(plugin: XmlElement) {
  const mute = parameter(plugin, "Mute"),
    db = parameter(plugin, "VolumeDB");
  if (mute.length > 1 || db.length !== 1) return null;
  const text = attrNs(db[0], N.draw, "value") ?? "",
    n = Number(text);
  return text.trim() !== "" && Number.isInteger(n) && n >= -32768 && n <= 0
    ? {
        volume: 10 ** (n / 20),
        muted: attrNs(mute[0], N.draw, "value") === "true",
      }
    : null;
}
async function frames(doc: Doc) {
  const cache = new Map<string, Promise<string>>(),
    out: {
      page: number;
      hash: string;
      geo: Geo;
      plugin: XmlElement;
      volume: number | null;
      muted: boolean;
    }[] = [];
  for (let page = 0; page < doc.pages.length; page++)
    for (const plugin of zoekAlle(doc.pages[page], "plugin").filter(
      (n) => is(n, N.draw, "plugin") && pluginPage(n, doc.pages[page]),
    )) {
      const frame = plugin.ouder;
      if (!frame || !is(frame, N.draw, "frame")) continue;
      const path = internOdfPad(attrNs(plugin, N.xlink, "href")),
        geo = geometry(frame);
      if (!path || !geo || !doc.heeft(path)) continue;
      if (!cache.has(path)) {
        const data = doc.bytes(path);
        if (!data) continue;
        cache.set(path, sha(data));
      }
      out.push({
        page,
        hash: await cache.get(path)!,
        geo,
        plugin,
        ...(level(plugin) ?? { volume: null, muted: false }),
      });
    }
  return out;
}
async function pptxMedia(bytes: Uint8Array) {
  const p = new Pakket(bytes),
    size = kind(leesXml(p.lees("ppt/presentation.xml")), "sldSz"),
    w = Number(attr(size, "cx")),
    h = Number(attr(size, "cy")),
    cache = new Map<Uint8Array, Promise<string>>();
  if (!(w > 0 && h > 0)) return [];
  const out: {
      page: number;
      id: number;
      hash: string;
      geo: Geo;
      volume: number;
      muted: boolean;
      editable: boolean;
      kind: "audio" | "video";
    }[] = [],
    paths = diaPaden(p),
    all = leesAlleMedia(bytes);
  for (let page = 0; page < all.length; page++) {
    const root = leesXml(p.lees(paths[page]));
    for (const m of all[page]) {
      if (!m.bytes || m.extern) continue;
      const geo: Geo = [m.x * w, m.y * h, m.breedte * w, m.hoogte * h];
      if (!geo.every(Number.isFinite) || geo[2] <= 0 || geo[3] <= 0) continue;
      const nodes = zoekAlle(root, "cMediaNode").filter(
          (e) =>
            is(e, P, "cMediaNode") &&
            Number(attr(kind(kind(e, "tgtEl"), "spTgt"), "spid")) === m.id,
        ),
        node = nodes[0];
      const volume = Number(attr(node, "vol") ?? 100000) / 100000,
        muted = ["1", "true"].includes(attr(node, "mute") ?? "0");
      const consistent = nodes.every(
        (n) =>
          Number(attr(n, "vol") ?? 100000) / 100000 === volume &&
          ["1", "true"].includes(attr(n, "mute") ?? "0") === muted,
      );
      if (!cache.has(m.bytes)) cache.set(m.bytes, sha(m.bytes));
      out.push({
        page,
        id: m.id,
        hash: await cache.get(m.bytes)!,
        geo,
        volume,
        muted,
        editable: m.bewerkbaar && consistent,
        kind: m.soort,
      });
    }
  }
  return out;
}
function unique<T extends { page: number; hash: string; geo: Geo }>(
  item: T,
  other: T[],
) {
  return other.filter(
    (x) =>
      x.page === item.page && x.hash === item.hash && same(x.geo, item.geo),
  );
}
function metadata(doc: Doc) {
  const xml = doc.lees("meta.xml");
  if (!xml) return null;
  const root = leesXml(xml),
    meta = child(root, N.office, "meta");
  return meta ? { xml, root, meta } : null;
}
async function readPrecision(doc: Doc): Promise<Precision | null> {
  const md = metadata(doc);
  if (!md) return null;
  const fields = elementen(md.meta).filter(
    (e) => is(e, N.meta, "user-defined") && attrNs(e, N.meta, "name") === META,
  );
  if (fields.length !== 1) return null;
  const text = tekstVan(fields[0]);
  if (text.length > 65536) return null;
  try {
    const p = JSON.parse(text) as Precision;
    if (
      p.version !== 1 ||
      !Array.isArray(p.media) ||
      p.media.length > 200 ||
      p.content !== (await sha(strToU8(doc.xml)))
    )
      return null;
    const styles = doc.bytes("styles.xml");
    if (p.styles !== (styles ? await sha(styles) : null)) return null;
    if (
      !p.media.every(
        (m) =>
          m &&
          Number.isInteger(m.page) &&
          m.page >= 0 &&
          m.page < doc.pages.length &&
          typeof m.hash === "string" &&
          /^[a-f0-9]{64}$/.test(m.hash) &&
          Array.isArray(m.geo) &&
          m.geo.length === 4 &&
          m.geo.every(Number.isFinite) &&
          m.geo[2] > 0 &&
          m.geo[3] > 0 &&
          Number.isFinite(m.volume) &&
          m.volume >= 0 &&
          m.volume <= 1 &&
          typeof m.muted === "boolean",
      )
    )
      return null;
    return p;
  } catch {
    return null;
  }
}
async function exportVolume(bron: Uint8Array, result: Uint8Array) {
  const doc = leesOdfConversie(result, false);
  if (!doc) return result;
  if (diaPaden(new Pakket(bron)).length !== doc.pages.length) return result;
  const md = metadata(doc);
  if (!md) return result;
  const media = await pptxMedia(bron),
    native = await frames(doc);
  if (!media.length) return result;
  const edits: Vervanging[] = [],
    bindings: Binding[] = [];
  for (const m of media) {
    if (bindings.length >= 200) break;
    if (
      !m.editable ||
      !Number.isFinite(m.volume) ||
      m.volume < 0 ||
      m.volume > 1 ||
      unique(m, media).length !== 1
    )
      continue;
    const matches = native.filter(
      (f) => f.page === m.page && f.hash === m.hash && same(f.geo, m.geo),
    );
    if (matches.length !== 1) continue;
    const f = matches[0];
    const values = {
      Mute: m.volume === 0 || m.muted ? "true" : "false",
      VolumeDB: String(
        m.volume === 0
          ? 0
          : Math.max(-100, Math.round(20 * Math.log10(m.volume))),
      ),
    };
    let safe = true;
    for (const name of Object.keys(values))
      if (parameter(f.plugin, name).length !== 1) safe = false;
    if (!safe) continue;
    for (const [name, value] of Object.entries(values)) {
      const e = attrs(parameter(f.plugin, name)[0], { "draw:value": value });
      if (e) edits.push(e);
    }
    bindings.push({
      page: f.page,
      hash: f.hash,
      geo: f.geo,
      volume: m.volume,
      muted: m.muted,
    });
  }
  if (!bindings.length) return result;
  const xml = vervang(doc.xml, edits),
    styles = doc.bytes("styles.xml");
  const precision: Precision = {
    version: 1,
    content: await sha(strToU8(xml)),
    styles: styles ? await sha(styles) : null,
    media: bindings,
  };
  const node = `<meta:user-defined xmlns:meta="${N.meta}" meta:name="${META}" meta:value-type="string">${ontsnap(JSON.stringify(precision))}</meta:user-defined>`;
  const old = elementen(md.meta).filter(
      (e) =>
        is(e, N.meta, "user-defined") && attrNs(e, N.meta, "name") === META,
    ),
    metaEdits = old.map((e) => ({ start: e.start, eind: e.eind, tekst: "" }));
  if (md.meta.leeg)
    metaEdits.push({
      start: md.meta.start,
      eind: md.meta.eind,
      tekst: `${md.xml.slice(md.meta.start, md.meta.eind - 2)}>${node}</${md.meta.naam}>`,
    });
  else
    metaEdits.push({
      start: md.meta.inhoudEind,
      eind: md.meta.inhoudEind,
      tekst: node,
    });
  const nextMeta = vervang(md.xml, metaEdits);
  return doc.schrijf(xml, { "meta.xml": strToU8(nextMeta) });
}
function setPptxVolume(
  p: Pakket,
  pad: string,
  id: number,
  kindName: "audio" | "video",
  volume: number,
  muted: boolean,
) {
  const xml = p.lees(pad),
    root = leesXml(xml),
    nodes = zoekAlle(root, "cMediaNode").filter(
      (e) =>
        is(e, P, "cMediaNode") &&
        Number(attr(kind(kind(e, "tgtEl"), "spTgt"), "spid")) === id,
    );
  const changes = {
    vol: String(Math.round(volume * 100000)),
    mute: muted ? "1" : "0",
  };
  if (nodes.length) {
    const edits = nodes
      .map((e) => attrs(e, changes))
      .filter((e): e is Vervanging => !!e);
    if (edits.length) p.schrijf(pad, vervang(xml, edits));
    return edits.length > 0;
  }
  if (
    (volume === 1 && !muted) ||
    zoekAlle(root, "spTgt").some(
      (e) => is(e, P, "spTgt") && Number(attr(e, "spid")) === id,
    )
  )
    return false;
  const allTiming = zoekAlle(root, "timing");
  if (allTiming.some((t) => t.ouder !== root)) return false;
  const timing = kind(root, "timing"),
    ct = kind(kind(kind(timing, "tnLst"), "par"), "cTn"),
    list = kind(ct, "childTnLst");
  if (timing && (!ct || attr(ct, "nodeType") !== "tmRoot" || !list))
    return false;
  const next =
    Math.max(
      0,
      ...zoekAlle(root, "cTn").map((e) => Number(attr(e, "id")) || 0),
    ) + 1;
  const target = `<p:tgtEl><p:spTgt spid="${id}"/></p:tgtEl>`,
    branch = `<p:${kindName} xmlns:p="${P}"><p:cMediaNode${attrTekst(changes)} showWhenStopped="1"><p:cTn id="${next + 1}" dur="indefinite"><p:stCondLst><p:cond delay="0" evt="onClick">${target}</p:cond></p:stCondLst></p:cTn>${target}</p:cMediaNode></p:${kindName}>`;
  let edit: Vervanging;
  if (list)
    edit = list.leeg
      ? {
          start: list.start,
          eind: list.eind,
          tekst: `${xml.slice(list.start, list.eind - 2)}>${branch}</${list.naam}>`,
        }
      : { start: list.inhoudEind, eind: list.inhoudEind, tekst: branch };
  else {
    const at = kind(root, "extLst")?.start ?? root.inhoudEind;
    edit = {
      start: at,
      eind: at,
      tekst: `<p:timing xmlns:p="${P}"><p:tnLst><p:par><p:cTn id="${next}" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>${branch}</p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`,
    };
  }
  p.schrijf(pad, vervang(xml, [edit]));
  return true;
}
async function importVolume(bron: Uint8Array, result: Uint8Array) {
  const doc = leesOdfConversie(bron, false);
  if (!doc) return result;
  const source = await frames(doc),
    media = await pptxMedia(result),
    precision = await readPrecision(doc),
    p = new Pakket(result),
    paths = diaPaden(p);
  if (paths.length !== doc.pages.length) return result;
  let changed = false;
  for (const m of media) {
    if (unique(m, media).length !== 1) continue;
    const matches = source.filter(
      (f) => f.page === m.page && f.hash === m.hash && same(f.geo, m.geo),
    );
    if (matches.length !== 1) continue;
    const f = matches[0];
    const exact = precision?.media.filter(
        (b) => b.page === f.page && b.hash === f.hash && same(b.geo, f.geo),
      ),
      volume = exact?.length === 1 ? exact[0].volume : f.volume,
      muted = exact?.length === 1 ? exact[0].muted : f.muted;
    if (volume === null || volume === undefined || !Number.isFinite(volume))
      continue;
    changed =
      setPptxVolume(p, paths[m.page], m.id, m.kind, volume, muted) || changed;
  }
  return changed ? p.inpakken() : result;
}
export async function behoudOdfMediavolume(
  bron: Uint8Array,
  van: string,
  naar: string,
  result: Uint8Array,
) {
  if (van === "pptx" && ["odp", "otp"].includes(naar))
    return exportVolume(bron, result);
  if (["odp", "otp"].includes(van) && naar === "pptx")
    return importVolume(bron, result);
  return result;
}
