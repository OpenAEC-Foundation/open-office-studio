/** Celnotities in de standaard XLSX-comments- en VML-onderdelen (#71). */
import { Pakket } from "../grafieken/pakket";
import {
  attr,
  attrTekst,
  elementen,
  kind,
  kinderen,
  leesXml,
  ontsnap,
  rid,
  tekstVan,
  vervang,
  zoekAlle,
  type XmlElement,
} from "../grafieken/xml";
import { adres, ontleedAdres } from "../lint/rekenblad-logica";

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";
export interface Celnotitie {
  cel: string;
  tekst: string;
  auteur: string;
  zichtbaar: boolean;
}
export class Notitiefout extends Error {
  constructor(
    public code:
      | "invalidCell"
      | "missingSheet"
      | "protectedSheet"
      | "threadedComment"
      | "damagedNotes",
  ) {
    super(code);
  }
}
const tag = (el: XmlElement, lokaal: string) =>
  (el.voorvoegsel ? `${el.voorvoegsel}:` : "") + lokaal;
function bladen(p: Pakket) {
  const hoofd = p
    .relaties("")
    .find((r) => !r.extern && r.type.endsWith("/officeDocument"));
  const wb = hoofd ? Pakket.doelPad("", hoofd.target) : "xl/workbook.xml";
  return kinderen(kind(leesXml(p.lees(wb)), "sheets"), "sheet").map(
    (s) => p.doel(wb, rid(s) ?? "") ?? "",
  );
}
function onderdeel(p: Pakket, blad: string, soort: string) {
  const relaties = p
    .relaties(blad)
    .filter((r) => !r.extern && r.type.endsWith(`/${soort}`));
  if (relaties.length > 1) throw new Notitiefout("damagedNotes");
  const r = relaties[0];
  return r ? Pakket.doelPad(blad, r.target) : null;
}
function celadres(cel: string) {
  const loc = ontleedAdres(cel);
  if (
    !loc ||
    loc.row < 0 ||
    loc.row >= 1048576 ||
    loc.col < 0 ||
    loc.col >= 16384
  )
    throw new Notitiefout("invalidCell");
  return adres(loc);
}
function inhoud(xml: string, el: XmlElement, tekst: string) {
  return vervang(xml, [
    {
      start: el.start,
      eind: el.eind,
      tekst: `<${el.naam}${attrTekst(el.attrs)}>${tekst}</${el.naam}>`,
    },
  ]);
}
function voegKindToe(xml: string, el: XmlElement, tekst: string) {
  return el.leeg
    ? inhoud(xml, el, tekst)
    : vervang(xml, [{ start: el.inhoudEind, eind: el.inhoudEind, tekst }]);
}
function noteVormen(xml: string) {
  return zoekAlle(leesXml(xml), "shape").filter(
    (s) => attr(kind(s, "ClientData"), "ObjectType") === "Note",
  );
}
function vormCel(s: XmlElement) {
  const data = kind(s, "ClientData");
  const rij = Number(tekstVan(kind(data, "Row"))),
    kolom = Number(tekstVan(kind(data, "Column")));
  if (
    !kind(data, "Row") ||
    !kind(data, "Column") ||
    !Number.isInteger(rij) ||
    !Number.isInteger(kolom) ||
    rij < 0 ||
    kolom < 0 ||
    rij >= 1048576 ||
    kolom >= 16384
  )
    return null;
  return adres({ row: rij, col: kolom });
}
function isZichtbaar(s: XmlElement) {
  const v = kind(kind(s, "ClientData"), "Visible");
  return v
    ? !/^(?:false|0)$/i.test(tekstVan(v).trim())
    : /(?:^|;)\s*visibility\s*:\s*visible\b/i.test(attr(s, "style") ?? "");
}
function leesBlad(p: Pakket, blad: string): Celnotitie[] {
  const comments = onderdeel(p, blad, "comments");
  if (!comments) return [];
  const modern = onderdeel(p, blad, "threadedComment");
  const discussieCellen = new Set(
    modern
      ? zoekAlle(leesXml(p.lees(modern)), "threadedComment").map((c) =>
          attr(c, "ref")?.toUpperCase(),
        )
      : [],
  );
  const root = leesXml(p.lees(comments));
  const auteurs = kinderen(kind(root, "authors"), "author").map(tekstVan);
  const discussieIds = new Set(
    modern
      ? zoekAlle(leesXml(p.lees(modern)), "threadedComment").map((c) =>
          attr(c, "id"),
        )
      : [],
  );
  const legacy = kind(leesXml(p.lees(blad)), "legacyDrawing");
  const vml = legacy ? p.doel(blad, rid(legacy) ?? "") : null;
  const zichtbaar = new Map(
    vml ? noteVormen(p.lees(vml)).map((s) => [vormCel(s), isZichtbaar(s)]) : [],
  );
  return kinderen(kind(root, "commentList"), "comment")
    .filter(
      (c) =>
        !discussieCellen.has(attr(c, "ref")?.toUpperCase()) &&
        !discussieIds.has(
          auteurs[Number(attr(c, "authorId"))]?.replace(/^tc=/, ""),
        ),
    )
    .map((c) => ({
      cel: celadres(attr(c, "ref") ?? ""),
      // Fonetische hulptekst (rPh) hoort niet bij de zichtbare notitie.
      tekst: zoekAlle(kind(c, "text") ?? c, "t")
        .filter((t) => t.ouder?.lokaal !== "rPh")
        .map(tekstVan)
        .join(""),
      auteur: auteurs[Number(attr(c, "authorId"))] ?? "",
      zichtbaar: zichtbaar.get(attr(c, "ref")?.toUpperCase() ?? "") ?? false,
    }))
    .sort((a, b) => {
      const x = ontleedAdres(a.cel)!,
        y = ontleedAdres(b.cel)!;
      return x.row - y.row || x.col - y.col;
    });
}
export function leesCelnotities(bytes: Uint8Array | Pakket): Celnotitie[][] {
  const p = bytes instanceof Pakket ? bytes : new Pakket(bytes);
  return bladen(p).map((blad) => (blad ? leesBlad(p, blad) : []));
}
export function notitieBladBeschermd(bytes: Uint8Array, blad: number) {
  const p = new Pakket(bytes),
    pad = bladen(p)[blad];
  if (!pad) throw new Notitiefout("missingSheet");
  const bescherming = kind(leesXml(p.lees(pad)), "sheetProtection");
  return (
    !!bescherming && /^(?:1|true)$/i.test(attr(bescherming, "sheet") ?? "0")
  );
}
function vormXml(cel: string, id: number, zichtbaar: boolean) {
  const { row, col } = ontleedAdres(cel)!;
  const links = Math.min(col + 1, 16380),
    boven = Math.min(row, 1048570);
  return `<v:shape xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" id="_x0000_s${id}" type="#_x0000_t202" style="position:absolute;width:144pt;height:79pt;visibility:${zichtbaar ? "visible" : "hidden"}" fillcolor="#ffffe1" o:insetmode="auto"><v:fill color2="#ffffe1"/><v:shadow on="t" color="black" obscured="t"/><v:path o:connecttype="none"/><v:textbox style="mso-direction-alt:auto"><div style="text-align:left"/></v:textbox><x:ClientData ObjectType="Note"><x:MoveWithCells/><x:SizeWithCells/><x:Anchor>${links}, 15, ${boven}, 2, ${links + 3}, 15, ${boven + 4}, 2</x:Anchor><x:AutoFill>False</x:AutoFill><x:Row>${row}</x:Row><x:Column>${col}</x:Column>${zichtbaar ? "<x:Visible/>" : ""}</x:ClientData></v:shape>`;
}
function schrijfVorm(
  p: Pakket,
  blad: string,
  cel: string,
  zichtbaar: boolean | null,
) {
  let wsXml = p.lees(blad),
    ws = leesXml(wsXml);
  const legacy = kind(ws, "legacyDrawing");
  let vml = legacy ? p.doel(blad, rid(legacy) ?? "") : null;
  if (legacy && !vml) throw new Notitiefout("damagedNotes");
  if (!vml && zichtbaar === null) return;
  if (!vml) {
    vml = p.vrijPad("xl/drawings/vmlDrawing#.vml");
    p.schrijf(vml, "<xml/>");
    const id = p.voegRelatieToe(blad, REL + "vmlDrawing", vml);
    const volgend = elementen(ws).find((e) =>
      [
        "legacyDrawingHF",
        "picture",
        "oleObjects",
        "controls",
        "webPublishItems",
        "tableParts",
        "extLst",
      ].includes(e.lokaal),
    );
    const punt = volgend?.start ?? ws.inhoudEind;
    const element = `<${tag(ws, "legacyDrawing")} xmlns:r="${REL.slice(0, -1)}" r:id="${id}"/>`;
    if (ws.leeg) wsXml = inhoud(wsXml, ws, element);
    else wsXml = vervang(wsXml, [{ start: punt, eind: punt, tekst: element }]);
    p.schrijf(blad, wsXml);
  }
  if (p.verwijzingenNaar(vml).length > 1) throw new Notitiefout("damagedNotes");
  let xml = p.lees(vml);
  const vormen = noteVormen(xml).filter((s) => vormCel(s) === cel);
  if (vormen.length > 1) throw new Notitiefout("damagedNotes");
  const vorm = vormen[0];
  if (vorm && zichtbaar === null)
    xml = vervang(xml, [{ start: vorm.start, eind: vorm.eind, tekst: "" }]);
  else if (vorm) {
    const data = kind(vorm, "ClientData")!;
    const v = kind(data, "Visible");
    let nieuw = xml.slice(vorm.start, vorm.eind);
    if (v)
      nieuw = vervang(nieuw, [
        {
          start: v.start - vorm.start,
          eind: v.eind - vorm.start,
          tekst: zichtbaar ? `<${v.naam}/>` : "",
        },
      ]);
    else if (zichtbaar)
      nieuw = vervang(nieuw, [
        {
          start: data.inhoudEind - vorm.start,
          eind: data.inhoudEind - vorm.start,
          tekst:
            '<x:Visible xmlns:x="urn:schemas-microsoft-com:office:excel"/>',
        },
      ]);
    const root = leesXml(nieuw);
    const stijl =
      (attr(root, "style") ?? "").replace(
        /(?:^|;)\s*visibility\s*:[^;]*/gi,
        "",
      ) + `;visibility:${zichtbaar ? "visible" : "hidden"}`;
    const binnen = nieuw.slice(root.inhoudStart, root.inhoudEind);
    nieuw = `<${root.naam}${attrTekst({ ...root.attrs, style: stijl })}>${binnen}</${root.naam}>`;
    xml = vervang(xml, [{ start: vorm.start, eind: vorm.eind, tekst: nieuw }]);
  } else if (zichtbaar !== null) {
    const root = leesXml(xml);
    const max = zoekAlle(root, "shape").reduce(
      (n, s) =>
        Math.max(n, Number(/_s(\d+)$/.exec(attr(s, "id") ?? "")?.[1]) || 1024),
      1024,
    );
    const type = zoekAlle(root, "shapetype").some(
      (t) => attr(t, "id") === "_x0000_t202",
    )
      ? ""
      : '<v:shapetype xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe"><v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype>';
    xml = voegKindToe(xml, root, type + vormXml(cel, max + 1, zichtbaar));
  }
  p.schrijf(vml, xml);
  p.voegDefaultToe(
    "vml",
    "application/vnd.openxmlformats-officedocument.vmlDrawing",
  );
}
/** Alleen de gekozen notitie wijzigt; onbekende XML, VML en andere ZIP-delen blijven behouden. */
export function schrijfCelnotitie(
  bytes: Uint8Array,
  blad: number,
  cel: string,
  notitie: Omit<Celnotitie, "cel"> | null,
): Uint8Array {
  return schrijfNotitie(bytes, blad, cel, notitie);
}
/** Excel requires a legacy placeholder linked by its author to each thread. */
export function schrijfDiscussiePlaceholder(
  bytes: Uint8Array,
  blad: number,
  cel: string,
  id: string,
  tekst: string | null,
): Uint8Array {
  return schrijfNotitie(
    bytes,
    blad,
    cel,
    tekst === null
      ? null
      : {
          auteur: `tc=${id}`,
          tekst,
          zichtbaar: false,
        },
    id,
  );
}
function schrijfNotitie(
  bytes: Uint8Array,
  blad: number,
  cel: string,
  notitie: Omit<Celnotitie, "cel"> | null,
  discussieId?: string,
): Uint8Array {
  cel = celadres(cel);
  const p = new Pakket(bytes),
    pad = bladen(p)[blad];
  if (!pad) throw new Notitiefout("missingSheet");
  if (notitieBladBeschermd(bytes, blad))
    throw new Notitiefout("protectedSheet");
  const modern = onderdeel(p, pad, "threadedComment");
  if (
    !discussieId &&
    modern &&
    zoekAlle(leesXml(p.lees(modern)), "threadedComment").some(
      (c) => attr(c, "ref")?.toUpperCase() === cel,
    )
  )
    throw new Notitiefout("threadedComment");
  let comments = onderdeel(p, pad, "comments");
  if (comments && p.verwijzingenNaar(comments).length > 1)
    throw new Notitiefout("damagedNotes");
  if (!comments && !notitie) return bytes;
  if (!comments) {
    comments = p.vrijPad("xl/comments#.xml");
    p.schrijf(
      comments,
      `<?xml version="1.0" encoding="UTF-8"?><comments xmlns="${NS}"><authors/><commentList/></comments>`,
    );
    p.voegRelatieToe(pad, REL + "comments", comments);
    p.voegOverrideToe(
      comments,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml",
    );
  }
  let xml = p.lees(comments),
    root = leesXml(xml);
  const auteurs = kind(root, "authors");
  if (!auteurs || !kind(root, "commentList"))
    throw new Notitiefout("damagedNotes");
  let auteurId = kinderen(auteurs, "author").findIndex(
    (a) => tekstVan(a) === notitie?.auteur,
  );
  if (notitie && auteurId < 0) {
    auteurId = kinderen(auteurs, "author").length;
    xml = voegKindToe(
      xml,
      auteurs,
      `<${tag(root, "author")}>${ontsnap(notitie.auteur)}</${tag(root, "author")}>`,
    );
    root = leesXml(xml);
  }
  const lijst = kind(root, "commentList")!;
  const bestaande = kinderen(lijst, "comment").filter(
    (c) => attr(c, "ref")?.toUpperCase() === cel,
  );
  if (bestaande.length > 1) throw new Notitiefout("damagedNotes");
  const bestaand = bestaande[0];
  if (discussieId) {
    const threads = modern
      ? zoekAlle(leesXml(p.lees(modern)), "threadedComment")
      : [];
    if (
      !threads.some(
        (c) =>
          attr(c, "id") === discussieId &&
          attr(c, "ref")?.toUpperCase() === cel &&
          !attr(c, "parentId"),
      )
    )
      throw new Notitiefout("damagedNotes");
    if (
      bestaand &&
      tekstVan(
        kinderen(kind(root, "authors"), "author")[
          Number(attr(bestaand, "authorId"))
        ],
      ) !== `tc=${discussieId}`
    )
      throw new Notitiefout("threadedComment");
  }
  if (bestaand) {
    let nieuw = "";
    if (notitie) {
      const tekst = kind(bestaand, "text");
      if (!tekst) throw new Notitiefout("damagedNotes");
      const huidig = zoekAlle(tekst, "t")
        .filter((t) => t.ouder?.lokaal !== "rPh")
        .map(tekstVan)
        .join("");
      const tekstXml =
        notitie.tekst === huidig
          ? xml.slice(tekst.start, tekst.eind)
          : `<${tekst.naam}><${tag(root, "t")} xml:space="preserve">${ontsnap(notitie.tekst)}</${tag(root, "t")}></${tekst.naam}>`;
      const binnen = vervang(
        xml.slice(bestaand.inhoudStart, bestaand.inhoudEind),
        [
          {
            start: tekst.start - bestaand.inhoudStart,
            eind: tekst.eind - bestaand.inhoudStart,
            tekst: tekstXml,
          },
        ],
      );
      nieuw = `<${bestaand.naam}${attrTekst({ ...bestaand.attrs, authorId: auteurId })}>${binnen}</${bestaand.naam}>`;
    }
    xml = vervang(xml, [
      { start: bestaand.start, eind: bestaand.eind, tekst: nieuw },
    ]);
  } else if (notitie)
    xml = voegKindToe(
      xml,
      lijst,
      `<${tag(root, "comment")} ref="${cel}" authorId="${auteurId}"><${tag(root, "text")}><${tag(root, "t")} xml:space="preserve">${ontsnap(notitie.tekst)}</${tag(root, "t")}></${tag(root, "text")}></${tag(root, "comment")}>`,
    );
  p.schrijf(comments, xml);
  schrijfVorm(p, pad, cel, notitie?.zichtbaar ?? null);
  return p.inpakken();
}

/** Wijzigt alle celadressen tegelijk, zodat schuiven of wisselen geen notitie overschrijft. */
export function verplaatsCelnotities(
  bytes: Uint8Array,
  wijzigingen: Map<number, Map<string, string | null>>,
) {
  if (!wijzigingen.size) return bytes;
  const p = new Pakket(bytes),
    lijst = bladen(p);
  let gewijzigd = false;
  for (const [index, cellen] of wijzigingen) {
    const blad = lijst[index];
    if (!blad) continue;
    const comments = onderdeel(p, blad, "comments");
    if (!comments) continue;
    if (p.verwijzingenNaar(comments).length > 1)
      throw new Notitiefout("damagedNotes");
    const xml = p.lees(comments),
      root = leesXml(xml);
    const edits = kinderen(kind(root, "commentList"), "comment").flatMap(
      (c) => {
        const oud = attr(c, "ref")?.toUpperCase() ?? "";
        if (!cellen.has(oud)) return [];
        const nieuw = cellen.get(oud)!;
        return [
          {
            start: c.start,
            eind: c.eind,
            tekst:
              nieuw === null
                ? ""
                : `<${c.naam}${attrTekst({ ...c.attrs, ref: celadres(nieuw) })}>${xml.slice(c.inhoudStart, c.inhoudEind)}</${c.naam}>`,
          },
        ];
      },
    );
    if (!edits.length) continue;
    gewijzigd = true;
    p.schrijf(comments, vervang(xml, edits));
    const legacy = kind(leesXml(p.lees(blad)), "legacyDrawing");
    const vml = legacy ? p.doel(blad, rid(legacy) ?? "") : null;
    if (!vml) continue;
    if (p.verwijzingenNaar(vml).length > 1)
      throw new Notitiefout("damagedNotes");
    const vmlXml = p.lees(vml);
    const vormEdits = noteVormen(vmlXml).flatMap((vorm) => {
      const oud = vormCel(vorm);
      if (!oud || !cellen.has(oud)) return [];
      const nieuw = cellen.get(oud)!;
      if (nieuw === null)
        return [{ start: vorm.start, eind: vorm.eind, tekst: "" }];
      const van = ontleedAdres(oud)!,
        tot = ontleedAdres(celadres(nieuw))!;
      const data = kind(vorm, "ClientData")!;
      const binnenEdits = [];
      for (const [naam, waarde] of [
        ["Row", tot.row],
        ["Column", tot.col],
      ] as const) {
        const el = kind(data, naam)!;
        binnenEdits.push({
          start: el.start - vorm.start,
          eind: el.eind - vorm.start,
          tekst: `<${el.naam}>${waarde}</${el.naam}>`,
        });
      }
      const anker = kind(data, "Anchor");
      if (anker) {
        const cijfers = tekstVan(anker)
          .split(",")
          .map((v) => Number(v.trim()));
        if (cijfers.length === 8 && cijfers.every(Number.isFinite)) {
          for (const k of [0, 4])
            cijfers[k] = Math.max(
              0,
              Math.min(16383, cijfers[k] + tot.col - van.col),
            );
          for (const k of [2, 6])
            cijfers[k] = Math.max(
              0,
              Math.min(1048575, cijfers[k] + tot.row - van.row),
            );
          binnenEdits.push({
            start: anker.start - vorm.start,
            eind: anker.eind - vorm.start,
            tekst: `<${anker.naam}>${cijfers.join(", ")}</${anker.naam}>`,
          });
        }
      }
      return [
        {
          start: vorm.start,
          eind: vorm.eind,
          tekst: vervang(vmlXml.slice(vorm.start, vorm.eind), binnenEdits),
        },
      ];
    });
    p.schrijf(vml, vervang(vmlXml, vormEdits));
  }
  return gewijzigd ? p.inpakken() : bytes;
}
