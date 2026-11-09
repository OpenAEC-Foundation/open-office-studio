import { Pakket } from "../grafieken/pakket";
import {
  attr,
  attrTekst,
  attrNs,
  elementen,
  kind,
  kinderen,
  leesXml,
  namespaceVan,
  vervang,
  voorvoegselVoor,
  zoekAlle,
  type XmlElement,
  type Vervanging,
} from "../grafieken/xml";
import { leesOntwerpPakket } from "./ontwerp";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main",
  R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
export interface Bijsnijden {
  links: number;
  boven: number;
  rechts: number;
  onder: number;
}
export interface DiaAfbeelding {
  id: string;
  naam: string;
  bijsnijden: Bijsnijden;
  transparantie: number;
  bytes?: Uint8Array;
  mime: string;
  verhouding: number;
}
export class AfbeeldingFout extends Error {
  constructor(public code: "invalid" | "missing" | "tooLarge") {
    super(code);
  }
}
const pct = (s: string | undefined) =>
  s?.endsWith("%") ? Number(s.slice(0, -1)) : Number(s ?? 0) / 1000;
export function controleerBijsnijden(c: Bijsnijden) {
  if (
    Object.values(c).some(
      (n) => !Number.isFinite(n) || n < -1000 || n >= 100,
    ) ||
    Math.round(c.links * 1000) + Math.round(c.rechts * 1000) >= 100000 ||
    Math.round(c.boven * 1000) + Math.round(c.onder * 1000) >= 100000
  )
    throw new AfbeeldingFout("invalid");
}
export function controleerBeeld(bytes: Uint8Array) {
  if (bytes.length > 20 * 1024 * 1024) throw new AfbeeldingFout("tooLarge");
  let mime: string,
    ext: string,
    w = 0,
    h = 0;
  if (
    bytes.length > 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v) &&
    String.fromCharCode(...bytes.subarray(12, 16)) === "IHDR"
  ) {
    mime = "image/png";
    ext = "png";
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    w = view.getUint32(16);
    h = view.getUint32(20);
  } else if (bytes.length > 4 && bytes[0] === 255 && bytes[1] === 216) {
    mime = "image/jpeg";
    ext = "jpg";
    let pos = 2;
    while (pos + 3 < bytes.length) {
      if (bytes[pos++] !== 255) throw new AfbeeldingFout("invalid");
      while (bytes[pos] === 255) pos++;
      const marker = bytes[pos++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      const len = bytes[pos] * 256 + bytes[pos + 1];
      if (len < 2 || pos + len > bytes.length)
        throw new AfbeeldingFout("invalid");
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker)
      ) {
        if (len < 8) throw new AfbeeldingFout("invalid");
        h = bytes[pos + 3] * 256 + bytes[pos + 4];
        w = bytes[pos + 5] * 256 + bytes[pos + 6];
        break;
      }
      pos += len;
    }
  } else throw new AfbeeldingFout("invalid");
  if (!w || !h) throw new AfbeeldingFout("invalid");
  if (w * h > 50_000_000) throw new AfbeeldingFout("tooLarge");
  return { mime, ext, width: w, height: h };
}
function document(p: Pakket, dia: number) {
  const pad = leesOntwerpPakket(p).dias[dia]?.pad;
  if (!pad) throw new AfbeeldingFout("missing");
  const xml = p.lees(pad);
  return { pad, xml, root: leesXml(xml) };
}
export function leesAfbeeldingen(
  bytes: Uint8Array,
  dia: number,
): DiaAfbeelding[] {
  const p = new Pakket(bytes),
    { pad, root } = document(p, dia),
    types = leesXml(p.lees("[Content_Types].xml"));
  return zoekAlle(root, "pic").map((pic) => {
    const nv = kind(kind(pic, "nvPicPr"), "cNvPr"),
      fill = kind(pic, "blipFill"),
      blip = kind(fill, "blip"),
      crop = kind(fill, "srcRect"),
      id = attrNs(blip, R, "embed"),
      part = id ? p.doel(pad, id) : null;
    const size = kind(kind(kind(pic, "spPr"), "xfrm"), "ext"),
      w = Number(attr(size, "cx")),
      h = Number(attr(size, "cy"));
    const mime = part
      ? (attr(
          kinderen(types, "Override").find(
            (t) => attr(t, "PartName") === "/" + part,
          ),
          "ContentType",
        ) ??
        attr(
          kinderen(types, "Default").find(
            (t) =>
              attr(t, "Extension")?.toLowerCase() ===
              part.split(".").pop()?.toLowerCase(),
          ),
          "ContentType",
        ) ??
        "image/png")
      : "image/png";
    const alpha = kinderen(blip, "alphaModFix").reduce(
      (n, e) => (n * pct(attr(e, "amt") ?? "100000")) / 100,
      1,
    );
    return {
      id: attr(nv, "id") ?? "",
      naam: attr(nv, "name") ?? "",
      bijsnijden: {
        links: pct(attr(crop, "l")),
        boven: pct(attr(crop, "t")),
        rechts: pct(attr(crop, "r")),
        onder: pct(attr(crop, "b")),
      },
      transparantie: Math.round((1 - alpha) * 10000) / 100,
      bytes: part ? p.bytes(part) : undefined,
      mime,
      verhouding: w > 0 && h > 0 ? w / h : 1,
    };
  });
}
function kindVervangen(
  xml: string,
  ouder: XmlElement,
  naam: string,
  nieuw: string,
  voor?: XmlElement | null,
) {
  const old = kind(ouder, naam);
  if (old)
    return vervang(xml, [{ start: old.start, eind: old.eind, tekst: nieuw }]);
  if (ouder.leeg)
    return vervang(xml, [
      {
        start: ouder.start,
        eind: ouder.eind,
        tekst: `<${ouder.naam}${attrTekst(ouder.attrs)}>${nieuw}</${ouder.naam}>`,
      },
    ]);
  const pos = voor?.start ?? ouder.inhoudEind;
  return vervang(xml, [{ start: pos, eind: pos, tekst: nieuw }]);
}
function attrs(
  xml: string,
  el: XmlElement,
  nieuw: Record<string, string | undefined>,
) {
  return vervang(xml, [
    {
      start: el.start,
      eind: el.inhoudStart,
      tekst: `<${el.naam}${attrTekst({ ...el.attrs, ...nieuw })}${el.leeg ? "/>" : ">"}`,
    },
  ]);
}
export function schrijfAfbeelding(
  bytes: Uint8Array,
  dia: number,
  id: string,
  edit: {
    bijsnijden?: Bijsnijden;
    transparantie?: number;
    vervanging?: Uint8Array;
  },
) {
  if (edit.bijsnijden) controleerBijsnijden(edit.bijsnijden);
  if (
    edit.transparantie !== undefined &&
    (!Number.isFinite(edit.transparantie) ||
      edit.transparantie < 0 ||
      edit.transparantie > 100)
  )
    throw new AfbeeldingFout("invalid");
  const bestand = edit.vervanging ? controleerBeeld(edit.vervanging) : null;
  const p = new Pakket(bytes),
    d = document(p, dia),
    matches = zoekAlle(d.root, "pic").filter(
      (pic) => attr(kind(kind(pic, "nvPicPr"), "cNvPr"), "id") === id,
    );
  if (matches.length !== 1) throw new AfbeeldingFout("missing");
  const pic = matches[0],
    fill = kind(pic, "blipFill");
  if (!fill) throw new AfbeeldingFout("missing");
  let fragment = d.xml.slice(pic.start, pic.eind);
  const zoek = () => {
    const root = leesXml(fragment);
    // Het fragment blijft op dezelfde plaats in de dia. Behoud de oorspronkelijke
    // namespacecontext zonder verklaringen of offsets in de tekst te veranderen.
    root.ouder = pic.ouder;
    const fill = kind(root, "blipFill");
    if (!fill) throw new AfbeeldingFout("missing");
    return { root, fill, blip: kind(fill, "blip") };
  };
  if (edit.bijsnijden) {
    const { fill } = zoek(),
      old = kind(fill, "srcRect"),
      c = edit.bijsnijden;
    const xml = `<${old?.naam ?? "a:srcRect"}${attrTekst({ ...old?.attrs, ...(!old ? { "xmlns:a": A } : {}), l: Math.round(c.links * 1000), t: Math.round(c.boven * 1000), r: Math.round(c.rechts * 1000), b: Math.round(c.onder * 1000) })}/>`;
    fragment = kindVervangen(
      fragment,
      fill,
      "srcRect",
      xml,
      kind(fill, "tile") ?? kind(fill, "stretch"),
    );
  }
  if (edit.transparantie !== undefined) {
    const { blip } = zoek();
    if (!blip) throw new AfbeeldingFout("missing");
    const old = kinderen(blip, "alphaModFix"),
      nieuw = `<a:alphaModFix xmlns:a="${A}" amt="${Math.round((100 - edit.transparantie) * 1000)}"/>`;
    if (blip.leeg)
      fragment = kindVervangen(
        fragment,
        zoek().fill,
        "blip",
        `<${blip.naam}${attrTekst(blip.attrs)}>${nieuw}</${blip.naam}>`,
      );
    else {
      const edits: Vervanging[] = old.map((e) => ({
          start: e.start,
          eind: e.eind,
          tekst: "",
        })),
        pos = kind(blip, "extLst")?.start ?? blip.inhoudEind;
      edits.push({ start: pos, eind: pos, tekst: nieuw });
      fragment = vervang(fragment, edits);
    }
  }
  const oudeRelaties = p.relaties(d.pad).filter((r) => r.type === `${R}/image`);
  if (bestand && edit.vervanging) {
    const { blip } = zoek();
    if (!blip) throw new AfbeeldingFout("missing");
    const media = p.vrijPad(`ppt/media/oosPicture#.${bestand.ext}`);
    p.schrijf(media, edit.vervanging);
    p.voegOverrideToe(media, bestand.mime);
    const rid = p.voegRelatieToe(d.pad, `${R}/image`, media);
    let prefix = voorvoegselVoor(blip, R);
    if (!prefix) {
      prefix = "oosRel";
      let n = 1;
      while (namespaceVan(blip, prefix) && namespaceVan(blip, prefix) !== R)
        prefix = `oosRel${n++}`;
    }
    const wijzig: Record<string, string | undefined> = {
      [`xmlns:${prefix}`]: R,
      [`${prefix}:embed`]: rid,
    };
    for (const key of Object.keys(blip.attrs))
      if (
        key.includes(":") &&
        namespaceVan(blip, key.split(":")[0]) === R &&
        ["link", "embed"].includes(key.split(":")[1])
      )
        wijzig[key] = undefined;
    wijzig[`${prefix}:embed`] = rid;
    fragment = attrs(fragment, blip, wijzig);
    const ext = kind(zoek().blip, "extLst");
    if (ext) {
      const svg = kinderen(ext, "ext").filter(
        (e) => zoekAlle(e, "svgBlip").length,
      );
      fragment = vervang(
        fragment,
        svg.map((e) => ({ start: e.start, eind: e.eind, tekst: "" })),
      );
    }
  }
  const nieuw = vervang(d.xml, [
    { start: pic.start, eind: pic.eind, tekst: fragment },
  ]);
  p.schrijf(d.pad, nieuw);
  if (bestand) {
    const root = leesXml(nieuw),
      refs = new Set<string>();
    const loop = (e: XmlElement) => {
      for (const [key, value] of Object.entries(e.attrs))
        if (key.includes(":") && namespaceVan(e, key.split(":")[0]) === R)
          refs.add(value);
      elementen(e).forEach(loop);
    };
    loop(root);
    for (const r of oudeRelaties)
      if (!refs.has(r.id)) {
        p.verwijderRelatie(d.pad, r.id);
        if (r.extern) continue;
        const part = Pakket.doelPad(d.pad, r.target);
        if (!p.verwijzingenNaar(part).length) {
          p.verwijder(part);
          p.verwijder(Pakket.relsPad(part));
          p.verwijderOverride(part);
        }
      }
  }
  const result = p.inpakken();
  if (result.length > 100 * 1024 * 1024) throw new AfbeeldingFout("tooLarge");
  return result;
}
