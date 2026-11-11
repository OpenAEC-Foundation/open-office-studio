/** Standaard ODF-overgangsgegevens aanvullen die de native filters verliezen. */
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { Pakket } from "../grafieken/pakket";
import { voegZipDelenSamen, zipDelen } from "../grafieken/zipdelen";
import {
  attrNs,
  attrTekst,
  elementen,
  kind,
  leesXml,
  namespaceVan,
  vervang,
  zoekAlle,
  type Vervanging,
  type XmlElement,
} from "../grafieken/xml";
import { diaPaden, leesOvergangGegevens } from "./overgangen";

const NS = {
  office: "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
  draw: "urn:oasis:names:tc:opendocument:xmlns:drawing:1.0",
  style: "urn:oasis:names:tc:opendocument:xmlns:style:1.0",
  presentation: "urn:oasis:names:tc:opendocument:xmlns:presentation:1.0",
  anim: "urn:oasis:names:tc:opendocument:xmlns:animation:1.0",
  smil: "urn:oasis:names:tc:opendocument:xmlns:smil-compatible:1.0",
  xlink: "http://www.w3.org/1999/xlink",
  meta: "urn:oasis:names:tc:opendocument:xmlns:meta:1.0",
};
const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const MC = "http://schemas.openxmlformats.org/markup-compatibility/2006";
const ODF = new Set(["odp", "otp", "fodp"]);
const is = (e: XmlElement, ns: string, local: string) =>
  e.lokaal === local && namespaceVan(e, e.voorvoegsel) === ns;
const children = (e: XmlElement, ns: string, local: string) =>
  elementen(e).filter((x) => is(x, ns, local));
const child = (e: XmlElement, ns: string, local: string) =>
  children(e, ns, local)[0];

/** Alleen de benodigde XML uitpakken; mimetype en media gecomprimeerd kopiëren. */
function odf(bytes: Uint8Array, flat: boolean) {
  const delen = flat ? null : zipDelen(bytes);
  if (
    !flat &&
    (!delen || new Set(delen.map((d) => d.naam)).size !== delen.length)
  )
    return null;
  const index = new Map(delen?.map((d) => [d.naam, d]));
  const leesBytes = (path: string) => {
    const d = index.get(path);
    return flat
      ? path === "content.xml"
        ? bytes
        : null
      : d
        ? unzipSync(voegZipDelenSamen([d]))[path]
        : null;
  };
  const lees = (path: string) => {
    const b = leesBytes(path);
    return b ? strFromU8(b) : null;
  };
  const xml = lees("content.xml");
  if (!xml) return null;
  const root = leesXml(xml);
  if (namespaceVan(root, root.voorvoegsel) !== NS.office) return null;
  const body = child(root, NS.office, "body"),
    presentation = body && child(body, NS.office, "presentation");
  if (!presentation) return null;
  return {
    xml,
    root,
    presentation,
    lees,
    bytes: leesBytes,
    pages: children(presentation, NS.draw, "page"),
    heeft: (path: string) => index.has(path),
    schrijf: (next: string, andere: Record<string, Uint8Array> = {}) => {
      if (next === xml && !Object.keys(andere).length) return bytes;
      if (flat) return strToU8(next);
      const vervangen = new Map(
        zipDelen(
          zipSync({
            ...andere,
            ...(next === xml ? {} : { "content.xml": strToU8(next) }),
          }),
        )!.map((d) => [d.naam, d]),
      );
      return voegZipDelenSamen(delen!.map((d) => vervangen.get(d.naam) ?? d));
    },
  };
}

export {
  odf as leesOdfConversie,
  attrs as odfAttribuutWijziging,
  NS as ODF_NS,
  intern as internOdfPad,
};
type Odf = NonNullable<ReturnType<typeof odf>>;

/** Een begintag vervangen; onbekende kinderen en overige documenttekst bewaren. */
function attrs(
  el: XmlElement,
  changes: Record<string, string | null>,
): Vervanging | null {
  const a = { ...el.attrs };
  let changed = false;
  for (const [name, value] of Object.entries(changes)) {
    const [prefix, local] = name.split(":"),
      ns = NS[prefix as keyof typeof NS];
    const keys = Object.keys(el.attrs).filter((k) =>
      ns
        ? k.includes(":") &&
          k.split(":")[1] === local &&
          namespaceVan(el, k.split(":")[0]) === ns
        : k === name,
    );
    if ((keys.length ? el.attrs[keys[0]] : undefined) === (value ?? undefined))
      continue;
    changed = true;
    for (const k of keys) delete a[k];
    if (value !== null) {
      a[name] = value;
      if (ns) a[`xmlns:${prefix}`] = ns;
    }
  }
  return changed
    ? {
        start: el.start,
        eind: el.inhoudStart,
        tekst: `<${el.naam}${attrTekst(a)}${el.leeg ? "/" : ""}>`,
      }
    : null;
}
function styles(doc: Odf) {
  const result = new Map<string, XmlElement>();
  const extra = doc.lees("styles.xml");
  for (const root of [...(extra ? [leesXml(extra)] : []), doc.root])
    for (const el of zoekAlle(root, "style").filter(
      (e) =>
        is(e, NS.style, "style") &&
        attrNs(e, NS.style, "family") === "drawing-page",
    )) {
      const name = attrNs(el, NS.style, "name");
      if (name) result.set(name, el);
    }
  return result;
}
function properties(
  style: XmlElement | undefined,
  all: Map<string, XmlElement>,
) {
  const list: XmlElement[] = [],
    seen = new Set<XmlElement>();
  while (style && !seen.has(style) && seen.size < 32) {
    seen.add(style);
    const p = child(style, NS.style, "drawing-page-properties");
    if (p) list.push(p);
    style = all.get(attrNs(style, NS.style, "parent-style-name") ?? "");
  }
  return (ns: string, key: string) =>
    list.map((p) => attrNs(p, ns, key)).find((v) => v !== undefined);
}
function transitionGroups(page: XmlElement) {
  return children(page, NS.anim, "par")
    .filter((p) => attrNs(p, NS.presentation, "node-type") === "timing-root")
    .flatMap((p) => children(p, NS.anim, "par"))
    .filter((p) => children(p, NS.anim, "transitionFilter").length === 1);
}
function intern(path: string | undefined) {
  if (!path) return null;
  path = path.replace(/^vnd\.sun\.star\.Package:/, "");
  try {
    path = decodeURIComponent(path);
  } catch {
    return null;
  }
  path = path.replace(/^\.\//, "");
  return !path ||
    /[:\\\u0000?#]/.test(path) ||
    path.startsWith("/") ||
    path.split("/").includes("..")
    ? null
    : path;
}

function naarOdf(bron: Uint8Array, result: Uint8Array, flat: boolean) {
  const doc = odf(result, flat);
  if (!doc) return result;
  const { overgangen, geluiden } = leesOvergangGegevens(bron);
  if (overgangen.length !== doc.pages.length) return result;
  const automatic = child(doc.root, NS.office, "automatic-styles");
  if (!automatic || automatic.leeg) return result;
  const all = styles(doc),
    edits: Vervanging[] = [],
    clones: string[] = [];
  const names = new Set(all.keys());
  doc.pages.forEach((page, i) => {
    const o = overgangen[i],
      style = all.get(attrNs(page, NS.draw, "style-name") ?? "");
    // De native uitvoer heeft lokale automatische paginastijlen. Geen externe
    // of geërfde stijlbibliotheek kopiëren met een onvolledige namespacecontext.
    if (!style || style.ouder !== automatic) return;
    const prop = child(style, NS.style, "drawing-page-properties");
    if (!prop) return;
    const changes: Record<string, string> = {};
    if (
      o.na !== null &&
      Number.isInteger(o.na) &&
      o.na >= 0 &&
      o.na <= 0xffffffff
    )
      changes["presentation:duration"] = `PT${o.na / 1000}S`;
    const subtype =
      o.effect === "push"
        ? { r: "fromLeft", l: "fromRight", d: "fromTop", u: "fromBottom" }[
            o.richting
          ]
        : undefined;
    if (subtype && attrNs(prop, NS.smil, "type") === "pushWipe")
      changes["smil:subtype"] = subtype;
    const propertyEdit = attrs(prop, changes);
    if (propertyEdit) {
      let n = i + 1,
        name = `OOSTransition${n}`;
      while (names.has(name)) name = `OOSTransition${++n}`;
      names.add(name);
      const nameEdit = attrs(style, { "style:name": name })!;
      clones.push(
        vervang(
          doc.xml.slice(style.start, style.eind),
          [nameEdit, propertyEdit].map((e) => ({
            ...e,
            start: e.start - style.start,
            eind: e.eind - style.start,
          })),
        ),
      );
      edits.push(attrs(page, { "draw:style-name": name })!);
    }
    for (const group of transitionGroups(page)) {
      const filter = child(group, NS.anim, "transitionFilter")!;
      if (subtype && attrNs(filter, NS.smil, "type") === "pushWipe") {
        const e = attrs(filter, { "smil:subtype": subtype });
        if (e) edits.push(e);
      }
      const sound = child(prop, NS.presentation, "sound"),
        path = intern(sound && attrNs(sound, NS.xlink, "href"));
      const audio = child(group, NS.anim, "audio"),
        sourceSound = geluiden[i];
      if (
        audio &&
        attrNs(audio, NS.xlink, "href") === "" &&
        path &&
        doc.heeft(path) &&
        sourceSound &&
        !("stop" in sourceSound)
      ) {
        const e = attrs(audio, { "xlink:href": path });
        if (e) edits.push(e);
      }
    }
  });
  if (clones.length)
    edits.push({
      start: automatic.inhoudEind,
      eind: automatic.inhoudEind,
      tekst: clones.join(""),
    });
  // ODF heeft één klikbeleid voor de gehele presentatie. Een gemengd PPTX-
  // klikbeleid niet ten onrechte als een globale instelling voorstellen.
  if (
    overgangen.length &&
    overgangen.every((o) => o.klik === overgangen[0].klik)
  ) {
    const value = overgangen[0].klik ? "enabled" : "disabled",
      settings = child(doc.presentation, NS.presentation, "settings");
    if (settings) {
      const e = attrs(settings, { "presentation:transition-on-click": value });
      if (e) edits.push(e);
    } else if (value === "disabled")
      edits.push({
        start: doc.presentation.inhoudEind,
        eind: doc.presentation.inhoudEind,
        tekst: `<presentation:settings xmlns:presentation="${NS.presentation}" presentation:transition-on-click="disabled"/>`,
      });
  }
  return edits.length ? doc.schrijf(vervang(doc.xml, edits)) : result;
}

/** Calendarjaren/-maanden hebben geen vaste milliseconden; laat ze ongemoeid. */
export function odfDuurMs(text: string | undefined): number | null {
  if (!text) return null;
  const m =
    /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(
      text,
    );
  if (!m || !m.slice(1).some(Boolean) || text.endsWith("T")) return null;
  const ms = Math.round(
    ((Number(m[1] ?? 0) * 24 + Number(m[2] ?? 0)) * 3600 +
      Number(m[3] ?? 0) * 60 +
      Number(m[4] ?? 0)) *
      1000,
  );
  return Number.isSafeInteger(ms) && ms >= 0 && ms <= 0xffffffff ? ms : null;
}
function pptxTransitions(root: XmlElement): XmlElement[] {
  return elementen(root).flatMap((e) =>
    is(e, P, "transition")
      ? [e]
      : is(e, MC, "AlternateContent")
        ? elementen(e).flatMap(pptxTransitions)
        : [],
  );
}
function naarPptx(bron: Uint8Array, result: Uint8Array, flat: boolean) {
  const doc = odf(bron, flat);
  if (!doc) return result;
  const p = new Pakket(result),
    paden = diaPaden(p);
  if (paden.length !== doc.pages.length) return result;
  const all = styles(doc),
    settings = child(doc.presentation, NS.presentation, "settings");
  const click =
    !settings ||
    attrNs(settings, NS.presentation, "transition-on-click") !== "disabled";
  const manual = settings && attrNs(settings, NS.presentation, "force-manual");
  let changed = false;
  doc.pages.forEach((page, i) => {
    const get = properties(
      all.get(attrNs(page, NS.draw, "style-name") ?? ""),
      all,
    );
    const type = get(NS.presentation, "transition-type"),
      duration = odfDuurMs(get(NS.presentation, "duration"));
    const time =
      ["true", "1"].includes(manual ?? "") || type === "manual"
        ? null
        : ["automatic", "semi-automatic"].includes(type ?? "") &&
            duration !== null
          ? String(duration)
          : undefined;
    const xml = p.lees(paden[i]),
      root = leesXml(xml),
      trans = pptxTransitions(root);
    const changes: Record<string, string | null> = {
      advClick: click ? "1" : "0",
    };
    if (time !== undefined) changes.advTm = time;
    const edits = trans
      .map((t) => attrs(t, changes))
      .filter((e): e is Vervanging => !!e);
    if (!trans.length && (!click || typeof time === "string")) {
      const at =
        kind(root, "timing")?.start ??
        kind(root, "extLst")?.start ??
        root.inhoudEind;
      edits.push({
        start: at,
        eind: at,
        tekst: `<p:transition xmlns:p="${P}"${attrTekst(Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== null)) as Record<string, string>)}/>`,
      });
    }
    if (edits.length) {
      p.schrijf(paden[i], vervang(xml, edits));
      changed = true;
    }
  });
  return changed ? p.inpakken() : result;
}

export function naPresentatieConversie(
  bron: Uint8Array,
  van: string,
  naar: string,
  result: Uint8Array,
): Uint8Array {
  if (van === "pptx" && ODF.has(naar))
    return naarOdf(bron, result, naar === "fodp");
  if (ODF.has(van) && naar === "pptx")
    return naarPptx(bron, result, van === "fodp");
  return result;
}
