/** Werkbladtekeningen: alleen het gekozen anker wijzigen, alle overige XML/media bewaren. */
import { Pakket, REL, TYPE } from "../grafieken/pakket";
import {
  attr,
  attrNs,
  attrTekst,
  elementen,
  kind,
  kinderen,
  leesXml,
  leesWerkbladXml,
  ontsnap,
  rid,
  tekstVan,
  vervang,
  zoekAlle,
  type XmlElement,
} from "../grafieken/xml";
import i18next from "../i18n/config";
import { strFromU8, unzipSync } from "fflate";

const XDR =
  "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const EMU = 9525;
const IMAGE = `${R}/image`;
export const BASISVORMEN: readonly string[] = ["rect", "roundRect", "ellipse", "triangle", "diamond", "line"];
export interface ObjectPlek {
  row: number;
  col: number;
  x: number;
  y: number;
  breedte: number;
  hoogte: number;
}
export interface ObjectTekst {
  uitlijning: "left" | "center" | "right" | "justify";
  stukken: {
    tekst: string;
    grootte: number;
    vet: boolean;
    cursief: boolean;
    kleur: string;
    lettertype?: string;
    onderstreept: boolean;
  }[];
}
export interface Tekenobject {
  blad: number;
  tekening: string;
  id: string;
  naam: string;
  soort: "afbeelding" | "vorm" | "onbekend";
  plek: ObjectPlek;
  einde?: { row: number; col: number; x: number; y: number };
  absoluut?: boolean;
  vorm: string;
  tekst: string;
  vulling: string;
  lijn: string;
  rotatie: number;
  media?: Uint8Array;
  mime?: string;
  beveiligd: boolean;
  uitsnede?: { links: number; rechts: number; boven: number; onder: number };
  spiegelX: boolean;
  spiegelY: boolean;
  tekstOpmaak: ObjectTekst[];
  verticaal: "flex-start" | "center" | "flex-end";
  lijndikte: number;
}
export interface NieuwObject {
  naam: string;
  plek: ObjectPlek;
  vorm?: string;
  tekst?: string;
  vulling?: string;
  lijn?: string;
  afbeelding?: Uint8Array;
}
export type ObjectWijziging = Partial<
  Pick<NieuwObject, "naam" | "tekst" | "vulling" | "lijn">
>;
const fout = (sleutel: string) =>
  new Error(i18next.t(`spreadsheet:objects.${sleutel}`));
const getal = (
  el: XmlElement | null | undefined,
  naam: string,
  standaard = 0,
) => Number(tekstVan(kind(el, naam))) || standaard;
type Thema = Record<string, string>;
const kleur = (
  el: XmlElement | null | undefined,
  standaard: string,
  thema: Thema = {},
) => {
  if (kind(el, "noFill")) return "none";
  const fill = kind(el, "solidFill"),
    scheme = attr(kind(fill, "schemeClr"), "val"),
    aliases: Record<string, string> = {
      bg1: "lt1",
      bg2: "lt2",
      tx1: "dk1",
      tx2: "dk2",
    };
  const rgb =
    attr(kind(fill, "srgbClr"), "val") ??
    attr(kind(fill, "sysClr"), "lastClr") ??
    (scheme ? thema[aliases[scheme] ?? scheme] : undefined);
  return rgb && /^[a-f\d]{6}$/i.test(rgb) ? `#${rgb}` : standaard;
};
function leesThema(p: Pakket): Thema {
  const pad = p.namen().find((n) => /(?:^|\/)theme\d*\.xml$/i.test(n));
  if (!pad) return {};
  const scheme = zoekAlle(leesXml(p.lees(pad)), "clrScheme")[0];
  if (!scheme) return {};
  return Object.fromEntries(
    elementen(scheme).flatMap((e) => {
      const waarde =
        attr(kind(e, "srgbClr"), "val") ?? attr(kind(e, "sysClr"), "lastClr");
      return waarde ? [[e.lokaal, waarde]] : [];
    }),
  );
}
function bladen(p: Pakket) {
  const root = p
    .relaties("")
    .find((r) => r.type.endsWith("/officeDocument") && !r.extern);
  if (!root) throw fout("invalidWorkbook");
  const werkboek = Pakket.doelPad("", root.target);
  return kinderen(kind(leesXml(p.lees(werkboek)), "sheets"), "sheet").map(
    (s) => ({
      naam: attr(s, "name") ?? "",
      pad: p.doel(werkboek, rid(s) ?? "") ?? "",
    }),
  );
}
function voegIn(xml: string, el: XmlElement, inhoud: string) {
  return el.leeg
    ? vervang(xml, [
        {
          start: el.start,
          eind: el.eind,
          tekst: xml
            .slice(el.start, el.eind)
            .replace(/\/\s*>$/, `>${inhoud}</${el.naam}>`),
        },
      ])
    : vervang(xml, [
        { start: el.inhoudEind, eind: el.inhoudEind, tekst: inhoud },
      ]);
}
function tekening(p: Pakket, blad: number, maak = false, bewerk = false) {
  const b = bladen(p)[blad];
  if (!b?.pad) throw fout("invalidWorkbook");
  let xml = p.lees(b.pad),
    root = leesWerkbladXml(xml);
  const beveiligd = !!kind(root, "sheetProtection");
  const bestaand = kind(root, "drawing"),
    huidig = bestaand ? p.doel(b.pad, rid(bestaand) ?? "") : null;
  if (bestaand && (!huidig || !p.heeft(huidig))) throw fout("invalidWorkbook");
  if (huidig) {
    // Gekopieerde bladen kunnen één tekening delen. Bewerk uitsluitend dit blad.
    if (
      bewerk &&
      bladen(p).filter((s) =>
        p
          .relaties(s.pad)
          .some((r) => !r.extern && Pakket.doelPad(s.pad, r.target) === huidig),
      ).length > 1
    ) {
      const pad = p.vrijPad("xl/drawings/drawing#.xml");
      p.schrijf(pad, p.bytes(huidig)!);
      p.voegOverrideToe(pad, TYPE.drawing);
      const rels = Pakket.relsPad(huidig);
      if (p.heeft(rels)) p.schrijf(Pakket.relsPad(pad), p.bytes(rels)!);
      const relPad = Pakket.relsPad(b.pad),
        relXml = p.lees(relPad),
        relatie = kinderen(leesXml(relXml), "Relationship").find(
          (r) => attr(r, "Id") === rid(bestaand!),
        )!;
      p.schrijf(
        relPad,
        vervang(relXml, [
          {
            start: relatie.start,
            eind: relatie.eind,
            tekst: `<${relatie.naam}${attrTekst({ ...relatie.attrs, Target: Pakket.relatief(b.pad, pad) })}/>`,
          },
        ]),
      );
      return { pad, beveiligd };
    }
    return { pad: huidig, beveiligd };
  }
  if (!maak) return { pad: huidig, beveiligd };
  if (beveiligd) throw fout("protected");
  const pad = p.vrijPad("xl/drawings/drawing#.xml");
  p.schrijf(
    pad,
    `<xdr:wsDr xmlns:xdr="${XDR}" xmlns:a="${A}" xmlns:r="${R}"></xdr:wsDr>`,
  );
  p.voegOverrideToe(pad, TYPE.drawing);
  const relatie = p.voegRelatieToe(b.pad, REL.drawing, pad);
  const pre = root.voorvoegsel ? `${root.voorvoegsel}:` : "";
  const volgende = elementen(root).find((e) =>
    [
      "legacyDrawing",
      "legacyDrawingHF",
      "drawingHF",
      "picture",
      "oleObjects",
      "controls",
      "webPublishItems",
      "tableParts",
      "extLst",
    ].includes(e.lokaal),
  );
  const n = volgende?.start ?? root.inhoudEind;
  const inhoud = `<${pre}drawing xmlns:r="${R}" r:id="${relatie}"/>`;
  p.schrijf(
    b.pad,
    root.leeg
      ? voegIn(xml, root, inhoud)
      : vervang(xml, [{ start: n, eind: n, tekst: inhoud }]),
  );
  return { pad, beveiligd };
}
function mime(bytes: Uint8Array): { extensie: string; type: string } | null {
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return { extensie: "png", type: "image/png" };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return { extensie: "jpg", type: "image/jpeg" };
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46)
    return { extensie: "gif", type: "image/gif" };
  if (bytes[0] === 0x42 && bytes[1] === 0x4d)
    return { extensie: "bmp", type: "image/bmp" };
  return null;
}
const punt = (e: XmlElement | null | undefined) => ({
  row: getal(e, "row"),
  col: getal(e, "col"),
  x: getal(e, "colOff") / EMU,
  y: getal(e, "rowOff") / EMU,
});
function tekstOpmaak(tx: XmlElement | null, thema: Thema): ObjectTekst[] {
  return kinderen(tx, "p").map((p) => {
    const pr = kind(p, "pPr"),
      standaard = kind(pr, "defRPr");
    return {
      uitlijning:
        (
          {
            ctr: "center",
            r: "right",
            just: "justify",
            dist: "justify",
          } as const
        )[attr(pr, "algn") as "ctr"] ?? "left",
      stukken: elementen(p)
        .filter((r) => ["r", "fld", "br"].includes(r.lokaal))
        .map((r) => {
          const opmaak = kind(r, "rPr"),
            eigenschap = (naam: string) =>
              attr(opmaak, naam) ?? attr(standaard, naam);
          return {
            tekst: r.lokaal === "br" ? "\n" : tekstVan(kind(r, "t")),
            grootte: ((Number(eigenschap("sz") ?? 1100) / 100) * 4) / 3,
            vet: ["1", "true"].includes(eigenschap("b") ?? ""),
            cursief: ["1", "true"].includes(eigenschap("i") ?? ""),
            kleur: kleur(opmaak, kleur(standaard, "#24242B", thema), thema),
            lettertype:
              attr(kind(opmaak, "latin"), "typeface") ??
              attr(kind(standaard, "latin"), "typeface"),
            onderstreept: ![undefined, "none"].includes(eigenschap("u")),
          };
        }),
    };
  });
}

export function leesTekenobjecten(bytes: Uint8Array): Tekenobject[] {
  const typen = unzipSync(bytes, {
    filter: (f) => f.name === "[Content_Types].xml",
  });
  if (
    !typen["[Content_Types].xml"] ||
    !strFromU8(typen["[Content_Types].xml"]).includes(TYPE.drawing)
  )
    return [];
  const p = new Pakket(bytes),
    uit: Tekenobject[] = [],
    thema = leesThema(p);
  for (const [blad] of bladen(p).entries()) {
    const t = tekening(p, blad);
    if (!t.pad) continue;
    const root = leesXml(p.lees(t.pad));
    for (const anker of elementen(root)) {
      if (
        !["oneCellAnchor", "twoCellAnchor", "absoluteAnchor"].includes(
          anker.lokaal,
        )
      )
        continue;
      const obj = elementen(anker).find((e) =>
        ["pic", "sp", "grpSp", "cxnSp"].includes(e.lokaal),
      );
      if (!obj) continue; // Grafieken blijven bij de bestaande engine-tekenlaag.
      const nv = zoekAlle(obj, "cNvPr")[0],
        pr = kind(obj, "spPr"),
        xfrm = kind(pr, "xfrm");
      const ext = kind(anker, "ext") ?? kind(xfrm, "ext"),
        from = kind(anker, "from");
      const pos = kind(anker, "pos"),
        start = from
          ? punt(from)
          : {
              row: 0,
              col: 0,
              x: Number(attr(pos, "x") ?? 0) / EMU,
              y: Number(attr(pos, "y") ?? 0) / EMU,
            };
      const blip = obj.lokaal === "pic" ? zoekAlle(obj, "blip")[0] : undefined,
        imageRid = attrNs(blip, R, "embed");
      const mediaPad = imageRid ? p.doel(t.pad, imageRid) : null,
        media = mediaPad ? p.bytes(mediaPad) : undefined;
      const tx = kind(obj, "txBody");
      const vorm = attr(kind(pr, "prstGeom"), "prst") ?? (kind(pr, "custGeom") ? "custom" : "rect");
      const crop = kind(kind(obj, "blipFill"), "srcRect"),
        body = kind(tx, "bodyPr");
      uit.push({
        blad,
        tekening: t.pad,
        id: attr(nv, "id") ?? "",
        naam: attr(nv, "name") ?? "",
        beveiligd: t.beveiligd,
        soort:
          obj.lokaal === "pic"
            ? "afbeelding"
            : obj.lokaal === "sp" && BASISVORMEN.includes(vorm)
              ? "vorm"
              : "onbekend",
        plek: {
          ...start,
          breedte: Math.max(1, Number(attr(ext, "cx") ?? 914400) / EMU),
          hoogte: Math.max(1, Number(attr(ext, "cy") ?? 914400) / EMU),
        },
        einde: kind(anker, "to") ? punt(kind(anker, "to")) : undefined,
        absoluut: anker.lokaal === "absoluteAnchor",
        vorm,
        tekst: kinderen(tx, "p").map(tekstVan).join("\n"),
        vulling: kleur(pr, "#E9F0E8", thema),
        lijn: kleur(kind(pr, "ln"), "#36363E", thema),
        rotatie: Number(attr(xfrm, "rot") ?? 0) / 60000,
        media,
        mime: media ? mime(media)?.type : undefined,
        spiegelX: ["1", "true"].includes(attr(xfrm, "flipH") ?? ""),
        spiegelY: ["1", "true"].includes(attr(xfrm, "flipV") ?? ""),
        uitsnede: crop
          ? {
              links: Number(attr(crop, "l") ?? 0) / 100000,
              rechts: Number(attr(crop, "r") ?? 0) / 100000,
              boven: Number(attr(crop, "t") ?? 0) / 100000,
              onder: Number(attr(crop, "b") ?? 0) / 100000,
            }
          : undefined,
        tekstOpmaak: tekstOpmaak(tx, thema),
        verticaal:
          attr(body, "anchor") === "ctr"
            ? "center"
            : attr(body, "anchor") === "b"
              ? "flex-end"
              : "flex-start",
        lijndikte: Number(attr(kind(pr, "ln"), "w") ?? 9525) / EMU,
      });
    }
  }
  return uit;
}

function controleerPlek(p: ObjectPlek) {
  if (
    !Number.isInteger(p.row) ||
    p.row < 0 ||
    p.row > 1048575 ||
    !Number.isInteger(p.col) ||
    p.col < 0 ||
    p.col > 16383 ||
    ![p.x, p.y, p.breedte, p.hoogte].every(Number.isFinite) ||
    p.x < 0 ||
    p.y < 0 ||
    p.breedte < 1 ||
    p.hoogte < 1 ||
    p.breedte > 16384 ||
    p.hoogte > 16384
  )
    throw fout("invalidSize");
}
const from = (p: ObjectPlek) =>
  `<xdr:from><xdr:col>${p.col}</xdr:col><xdr:colOff>${Math.round(p.x * EMU)}</xdr:colOff><xdr:row>${p.row}</xdr:row><xdr:rowOff>${Math.round(p.y * EMU)}</xdr:rowOff></xdr:from>`;
const anker = (p: ObjectPlek, inhoud: string) =>
  `<xdr:oneCellAnchor xmlns:xdr="${XDR}" xmlns:a="${A}" xmlns:r="${R}">${from(p)}<xdr:ext cx="${Math.round(p.breedte * EMU)}" cy="${Math.round(p.hoogte * EMU)}"/>${inhoud}<xdr:clientData/></xdr:oneCellAnchor>`;
const solid = (kleur: string) =>
  kleur === "none"
    ? "<a:noFill/>"
    : `<a:solidFill><a:srgbClr val="${/^#[a-f\d]{6}$/i.test(kleur) ? kleur.slice(1) : "36363E"}"/></a:solidFill>`;

export function voegTekenobjectToe(
  bytes: Uint8Array,
  blad: number,
  nieuw: NieuwObject,
): Uint8Array {
  controleerPlek(nieuw.plek);
  const p = new Pakket(bytes),
    t = tekening(p, blad, true, true);
  if (!t.pad || t.beveiligd) throw fout("protected");
  const xml = p.lees(t.pad),
    root = leesXml(xml);
  const id =
    zoekAlle(root, "cNvPr").reduce(
      (max, e) => Math.max(max, Number(attr(e, "id")) || 0),
      0,
    ) + 1;
  const nv = `<xdr:cNvPr id="${id}" name="${ontsnap(nieuw.naam)}"/>`;
  let obj: string;
  if (nieuw.afbeelding) {
    const type = mime(nieuw.afbeelding);
    if (!type || nieuw.afbeelding.length > 20 * 1024 * 1024)
      throw fout("invalidImage");
    const media = p.vrijPad(`xl/media/image#.${type.extensie}`);
    p.schrijf(media, nieuw.afbeelding);
    p.voegDefaultToe(type.extensie, type.type);
    const rid = p.voegRelatieToe(t.pad, IMAGE, media);
    obj = `<xdr:pic><xdr:nvPicPr>${nv}<xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>`;
  } else {
    const vorm = nieuw.vorm ?? "rect";
    if (!BASISVORMEN.includes(vorm))
      throw fout("invalidSize");
    obj = `<xdr:sp><xdr:nvSpPr>${nv}<xdr:cNvSpPr txBox="${nieuw.tekst ? 1 : 0}"/></xdr:nvSpPr><xdr:spPr><a:prstGeom prst="${vorm}"><a:avLst/></a:prstGeom>${solid(nieuw.vulling ?? "#E9F0E8")}<a:ln>${solid(nieuw.lijn ?? "#36363E")}</a:ln></xdr:spPr><xdr:txBody><a:bodyPr wrap="square"/><a:lstStyle/>${(
      nieuw.tekst ?? ""
    )
      .split("\n")
      .map((tekst) => `<a:p><a:r><a:t>${ontsnap(tekst)}</a:t></a:r></a:p>`)
      .join("")}</xdr:txBody></xdr:sp>`;
  }
  p.schrijf(t.pad, voegIn(xml, root, anker(nieuw.plek, obj)));
  return p.inpakken();
}

/** Verplaatsen/afmetingen wijzigen laat media, vormopmaak en onbekende velden intact. */
export function wijzigTekenobject(
  bytes: Uint8Array,
  doel: Pick<Tekenobject, "blad" | "tekening" | "id">,
  plek: ObjectPlek | null,
  wijziging: ObjectWijziging = {},
): Uint8Array {
  if (plek) controleerPlek(plek);
  const p = new Pakket(bytes),
    huidig = tekening(p, doel.blad);
  if (huidig.pad !== doel.tekening) throw fout("stale");
  const t = tekening(p, doel.blad, false, true);
  if (t.beveiligd) throw fout("protected");
  if (!t.pad) throw fout("stale");
  const xml = p.lees(t.pad),
    root = leesXml(xml);
  const oud = elementen(root).find((e) =>
    zoekAlle(e, "cNvPr").some((n) => attr(n, "id") === doel.id),
  );
  if (!oud) throw fout("stale");
  const object = elementen(oud).find((e) =>
    ["pic", "sp", "grpSp", "cxnSp"].includes(e.lokaal),
  );
  if (!object) throw fout("stale");
  let inhoud = xml.slice(object.start, object.eind);
  // Expliciet gewijzigde eigenschappen vervangen; onbekende velden blijven behouden.
  if (plek) {
    const root = leesXml(inhoud),
      edits: { start: number; eind: number; tekst: string }[] = [];
    const nv = zoekAlle(root, "cNvPr")[0];
    if (wijziging.naam !== undefined && nv)
      edits.push({
        start: nv.start,
        eind: nv.eind,
        tekst: inhoud
          .slice(nv.start, nv.eind)
          .replace(
            /\bname\s*=\s*(["']).*?\1/,
            `name="${ontsnap(wijziging.naam)}"`,
          ),
      });
    const tx = kind(root, "txBody");
    if (wijziging.tekst !== undefined && tx) {
      const oudP = kinderen(tx, "p"),
        begin = [kind(tx, "bodyPr"), kind(tx, "lstStyle")]
          .map((n) => (n ? inhoud.slice(n.start, n.eind) : ""))
          .join("");
      edits.push({
        start: tx.start,
        eind: tx.eind,
        tekst: `<xdr:txBody>${begin}${wijziging.tekst
          .split("\n")
          .map((s, i) => {
            const p = oudP[i] ?? oudP[0],
              pr = kind(p, "pPr"),
              rPr = kind(kind(p, "r"), "rPr");
            return `<a:p>${pr ? inhoud.slice(pr.start, pr.eind) : ""}<a:r>${rPr ? inhoud.slice(rPr.start, rPr.eind) : ""}<a:t>${ontsnap(s)}</a:t></a:r></a:p>`;
          })
          .join("")}</xdr:txBody>`,
      });
    }
    const pr = kind(root, "spPr");
    if (pr && wijziging.vulling !== undefined) {
      const fill = elementen(pr).find((e) =>
        [
          "noFill",
          "solidFill",
          "gradFill",
          "blipFill",
          "pattFill",
          "grpFill",
        ].includes(e.lokaal),
      );
      const n = fill?.start ?? kind(pr, "ln")?.start ?? pr.inhoudEind;
      edits.push({
        start: n,
        eind: fill?.eind ?? n,
        tekst: solid(wijziging.vulling),
      });
    }
    const ln = kind(pr, "ln");
    if (ln && wijziging.lijn !== undefined)
      edits.push({
        start: ln.start,
        eind: ln.eind,
        tekst: `<a:ln>${solid(wijziging.lijn)}</a:ln>`,
      });
    const ext = kind(kind(pr, "xfrm"), "ext");
    if (ext)
      edits.push({
        start: ext.start,
        eind: ext.eind,
        tekst: `<${ext.naam}${attrTekst({ ...ext.attrs, cx: String(Math.round(plek.breedte * EMU)), cy: String(Math.round(plek.hoogte * EMU)) })}/>`,
      });
    inhoud = vervang(inhoud, edits);
  }
  p.schrijf(
    t.pad,
    vervang(xml, [
      {
        start: oud.start,
        eind: oud.eind,
        tekst: plek ? anker(plek, inhoud) : "",
      },
    ]),
  );
  // Media en relaties blijven staan: andere objecten kunnen hetzelfde onderdeel gebruiken.
  return p.inpakken();
}
