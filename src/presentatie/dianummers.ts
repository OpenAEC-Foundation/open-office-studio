/** Ververs alleen opgeslagen slidenum-veldwaarden, zonder editor- of notitiemutatie. */
import { strFromU8, strToU8, unzipSync, zipSync, type Unzipped } from "fflate";
import { Pakket } from "../grafieken/pakket";
import { voegZipDelenSamen, zipDelen } from "../grafieken/zipdelen";
import {
  attr,
  attrNs,
  elementen,
  kind,
  kinderen,
  leesXml,
  namespaceVan,
  tekstVan,
  vervang,
  zoekAlle,
  type XmlElement,
} from "../grafieken/xml";

const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const MC = "http://schemas.openxmlformats.org/markup-compatibility/2006";
function inDiaVorm(f: XmlElement) {
  const p = f.ouder,
    body = p?.ouder,
    shape = body?.ouder;
  if (
    p?.lokaal !== "p" ||
    namespaceVan(p, p.voorvoegsel) !== A ||
    body?.lokaal !== "txBody" ||
    namespaceVan(body, body.voorvoegsel) !== P ||
    shape?.lokaal !== "sp" ||
    namespaceVan(shape, shape.voorvoegsel) !== P
  )
    return false;
  let n = shape.ouder;
  while (
    n &&
    ((n.lokaal === "grpSp" && namespaceVan(n, n.voorvoegsel) === P) ||
      (["Choice", "Fallback", "AlternateContent"].includes(n.lokaal) &&
        namespaceVan(n, n.voorvoegsel) === MC))
  )
    n = n.ouder;
  return (
    n?.lokaal === "spTree" &&
    namespaceVan(n, n.voorvoegsel) === P &&
    n.ouder?.lokaal === "cSld"
  );
}
/**
 * De SDK bewaart tekstvelden met hun laatst berekende tekst. Werk de echte
 * slidenum-velden bij volgens sldIdLst; vaste tekst, datum, master en notities
 * blijven ongewijzigd. Ongewijzigde ZIP-onderdelen blijven gecomprimeerd.
 */
export function werkDianummersBij(bytes: Uint8Array): Uint8Array {
  const delen = zipDelen(bytes),
    index = delen && new Map(delen.map((d) => [d.naam, d]));
  let fallback: Unzipped | undefined;
  const teksten = new Map<string, string | null>();
  function lees(pad: string): string | null {
    if (teksten.has(pad)) return teksten.get(pad)!;
    let b: Uint8Array | undefined;
    if (index) {
      const deel = index.get(pad);
      if (deel) b = unzipSync(voegZipDelenSamen([deel]))[pad];
    } else {
      fallback ??= unzipSync(bytes, {
        filter: (f) => f.name.endsWith(".xml") || f.name.endsWith(".rels"),
      });
      b = fallback[pad];
    }
    const xml = b ? strFromU8(b) : null;
    teksten.set(pad, xml);
    return xml;
  }
  function relaties(pad: string) {
    const xml = lees(Pakket.relsPad(pad));
    return xml ? kinderen(leesXml(xml), "Relationship") : [];
  }
  const hoofd = relaties("").find(
    (r) =>
      attr(r, "Type") === `${R}/officeDocument` &&
      attr(r, "TargetMode") !== "External",
  );
  if (!hoofd) return bytes;
  const presPad = Pakket.doelPad("", attr(hoofd, "Target") ?? ""),
    presXml = lees(presPad);
  if (!presXml) return bytes;
  const pres = leesXml(presXml);
  if (namespaceVan(pres, pres.voorvoegsel) !== P) return bytes;
  const begin = Number(attr(pres, "firstSlideNum") ?? 1),
    eerste = Number.isSafeInteger(begin) && begin >= 0 ? begin : 1;
  const rels = relaties(presPad),
    wijzigingen = new Map<string, Uint8Array>();
  kinderen(kind(pres, "sldIdLst"), "sldId").forEach((dia, i) => {
    const rid = attrNs(dia, R, "id"),
      rel = rels.find(
        (r) =>
          attr(r, "Id") === rid &&
          attr(r, "Type") === `${R}/slide` &&
          attr(r, "TargetMode") !== "External",
      );
    if (!rel) return;
    const pad = Pakket.doelPad(presPad, attr(rel, "Target") ?? ""),
      xml = lees(pad);
    if (!xml) return;
    const root = leesXml(xml),
      nummer = String(eerste + i);
    const edits = zoekAlle(root, "fld")
      .filter(
        (f) =>
          namespaceVan(f, f.voorvoegsel) === A &&
          attr(f, "type") === "slidenum" &&
          inDiaVorm(f),
      )
      .flatMap((f) => {
        const t = kind(f, "t");
        // Een onbekende veldconstructie niet vereenvoudigen tot gewone tekst.
        if (
          !t ||
          namespaceVan(t, t.voorvoegsel) !== A ||
          elementen(t).length ||
          tekstVan(t) === nummer
        )
          return [];
        return t.leeg
          ? [
              {
                start: t.start,
                eind: t.eind,
                tekst: `${xml.slice(t.start, t.eind - 2)}>${nummer}</${t.naam}>`,
              },
            ]
          : [{ start: t.inhoudStart, eind: t.inhoudEind, tekst: nummer }];
      });
    if (edits.length) wijzigingen.set(pad, strToU8(vervang(xml, edits)));
  });
  if (!wijzigingen.size) return bytes;
  if (delen) {
    const nieuw = zipDelen(
        zipSync(Object.fromEntries(wijzigingen), { level: 6 }),
      )!,
      map = new Map(nieuw.map((d) => [d.naam, d]));
    return voegZipDelenSamen(delen.map((d) => map.get(d.naam) ?? d));
  }
  // ZIP64/afwijkende varianten gebruiken de bestaande fflate-mogelijkheden.
  return zipSync({ ...unzipSync(bytes), ...Object.fromEntries(wijzigingen) });
}
