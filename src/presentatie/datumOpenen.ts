/** Alleen ondersteunde automatische footerdatums verversen bij echt openen (#87). */
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { Pakket } from "../grafieken/pakket";
import { voegZipDelenSamen, zipDelen } from "../grafieken/zipdelen";
import {
  attr,
  attrNs,
  elementen,
  kinderen,
  leesXml,
  namespaceVan,
  ontsnap,
  tekstVan,
  vervang,
  type XmlElement,
} from "../grafieken/xml";
import { formatteerVoettekstDatum } from "./voetteksten";

const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const inNs = (el: XmlElement, ns: string) =>
  namespaceVan(el, el.voorvoegsel) === ns;
const lijst = (el: XmlElement | undefined, naam: string, ns: string) =>
  kinderen(el, naam).filter((e) => inNs(e, ns));
const kind = (el: XmlElement | undefined, naam: string, ns: string) =>
  lijst(el, naam, ns)[0];

export function werkVoettekstDatumsBij(
  bytes: Uint8Array,
  nu: Date,
  locale: string,
): Uint8Array {
  try {
    const delen = zipDelen(bytes);
    // Afwijkende ZIP-structuren blijven bij de bestaande engine; geen volledige herpakking.
    if (!delen) return bytes;
    const index = new Map(delen.map((d) => [d.naam, d]));
    const lees = (pad: string) => {
      const deel = index.get(pad);
      return deel ? strFromU8(unzipSync(voegZipDelenSamen([deel]))[pad]) : null;
    };
    const relaties = (pad: string) => {
      const xml = lees(Pakket.relsPad(pad));
      return xml ? kinderen(leesXml(xml), "Relationship") : [];
    };
    const hoofd = relaties("").find(
      (r) =>
        attr(r, "Type") === R + "/officeDocument" &&
        attr(r, "TargetMode") !== "External",
    );
    if (!hoofd) return bytes;
    const presPad = Pakket.doelPad("", attr(hoofd, "Target") ?? "");
    const presXml = lees(presPad);
    if (!presXml) return bytes;
    const pres = leesXml(presXml);
    if (!inNs(pres, P)) return bytes;
    const rels = relaties(presPad),
      wijzigingen = new Map<string, Uint8Array>();
    const datums = new Map<string, string>();
    const datum = (taal: string) => {
      if (!datums.has(taal))
        datums.set(taal, formatteerVoettekstDatum(nu, taal));
      return datums.get(taal)!;
    };
    for (const dia of lijst(kind(pres, "sldIdLst", P), "sldId", P)) {
      const rel = rels.find(
        (r) =>
          attr(r, "Id") === attrNs(dia, R, "id") &&
          attr(r, "Type") === R + "/slide" &&
          attr(r, "TargetMode") !== "External",
      );
      if (!rel) continue;
      const pad = Pakket.doelPad(presPad, attr(rel, "Target") ?? "");
      const xml = lees(pad);
      if (!xml) continue;
      const root = leesXml(xml);
      if (!inNs(root, P)) continue;
      const edits = [];
      for (const vorm of lijst(
        kind(kind(root, "cSld", P), "spTree", P),
        "sp",
        P,
      )) {
        if (
          attr(
            kind(kind(kind(vorm, "nvSpPr", P), "nvPr", P), "ph", P),
            "type",
          ) !== "dt"
        )
          continue;
        for (const alinea of lijst(kind(vorm, "txBody", P), "p", A)) {
          for (const veld of lijst(alinea, "fld", A)) {
            if (attr(veld, "type") !== "datetime1") continue;
            const teksten = lijst(veld, "t", A),
              tekst = teksten[0];
            if (teksten.length !== 1 || elementen(tekst).length) continue;
            const taal =
              attr(kind(veld, "rPr", A), "lang") ??
              attr(kind(kind(alinea, "pPr", A), "defRPr", A), "lang") ??
              locale;
            let waarde: string;
            try {
              waarde = datum(taal);
            } catch {
              continue;
            } // Onbekende taal niet raden.
            if (tekstVan(tekst) === waarde) continue;
            edits.push(
              tekst.leeg
                ? {
                    start: tekst.start,
                    eind: tekst.eind,
                    tekst: `${xml.slice(tekst.start, tekst.eind - 2)}>${ontsnap(waarde)}</${tekst.naam}>`,
                  }
                : {
                    start: tekst.inhoudStart,
                    eind: tekst.inhoudEind,
                    tekst: ontsnap(waarde),
                  },
            );
          }
        }
      }
      if (edits.length) wijzigingen.set(pad, strToU8(vervang(xml, edits)));
    }
    if (!wijzigingen.size) return bytes;
    const nieuw = new Map(
      zipDelen(zipSync(Object.fromEntries(wijzigingen), { level: 6 }))!.map(
        (d) => [d.naam, d],
      ),
    );
    return voegZipDelenSamen(delen.map((d) => nieuw.get(d.naam) ?? d));
  } catch {
    // Een onbekend of onvolledig pakket behoudt zijn normale engine-openroute.
    return bytes;
  }
}

/** Eén klok/taalkeuze per nieuwe bron; rerenders en pakketbewerkingen verversen niet. */
export function maakDatumOpenen(klok: () => Date = () => new Date()) {
  let bron: Uint8Array | undefined;
  let resultaat: { bytes: Uint8Array; gewijzigd: boolean };
  return (bytes: Uint8Array, locale: string) => {
    if (bytes !== bron) {
      const bijgewerkt = werkVoettekstDatumsBij(bytes, klok(), locale);
      bron = bytes;
      resultaat = { bytes: bijgewerkt, gewijzigd: bijgewerkt !== bytes };
    }
    return resultaat!;
  };
}
