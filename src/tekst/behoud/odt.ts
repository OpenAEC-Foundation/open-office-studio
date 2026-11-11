/** Writer metadata which the conversion filter cannot express losslessly.
 * Bookmarks bind it to edited content; no document text is kept in the style
 * library. ODF applications continue to read ordinary styles and note bodies.
 */
import { unzipSync, zipSync, strFromU8, strToU8, type Zippable } from "fflate";
import {
  attr,
  attrTekst,
  elementen,
  kind,
  kinderen,
  leesXml,
  namespaceVan,
  ontsnap,
  tekstVan,
  vervang,
  zoekAlle,
  type XmlElement,
  type Vervanging,
} from "../../grafieken/xml";
import { LIMIETEN } from "../../grafieken/fouten";
import {
  Pakket,
  openDocument,
  onderdeelVan,
  secties,
  WREL,
  zetKind,
  PPR_VOLGORDE,
  wijzigSectPrs,
  SECTPR_VOLGORDE,
  NOTEPR_VOLGORDE,
  wijzigInstellingen,
  SETTINGS_VOLGORDE,
} from "../pagina/ooxml";
import {
  leesAlleNootInstellingen,
  type NootInstellingen,
  type NootSoort,
} from "../pagina/noten";
import { leesStijlen } from "../stijlen/stijlenxml";
import { importeerDocumentStijlen } from "../stijlen/beheer";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const O = "urn:oasis:names:tc:opendocument:xmlns:text:1.0";
const META = "OpenOfficeStudio/Writer.json",
  LIB = "OpenOfficeStudio/WriterStyles.docx";
const markerPatroon = /^_OOSW_[a-f0-9]{10}_[slt]\d+$/;
const odfNotatie: Record<string, string> = {
  decimal: "1", lowerRoman: "i", upperRoman: "I",
  lowerLetter: "a", upperLetter: "A", chicago: "*",
};
interface SectieBewaar {
  marker: string | null;
  voetnoot: NootInstellingen;
  eindnoot: NootInstellingen;
}
interface TabelBewaar {
  marker: string;
  stijl: string;
  pr: string | null;
  rijen: { pr: string | null; cellen: (string | null)[] }[];
  vorm?: string;
}
interface NummerBewaar {
  marker: string;
  numId: number;
  ilvl: number;
}
interface NootBewaar {
  soort: NootSoort;
  label: string | null;
  odfId?: string;
}
interface Bewaar {
  versie: 1;
  secties: SectieBewaar[];
  tabellen: TabelBewaar[];
  lijsten: NummerBewaar[];
  noten: NootBewaar[];
  stijlen?: string;
  nootStijlen?: string;
}
export interface WriterConversie {
  bytes: Uint8Array;
  van: string;
  naar: string;
  bewaar?: Bewaar;
  bibliotheek?: Uint8Array;
  odf?: Record<string, Uint8Array>;
}

function zipOpen(bytes: Uint8Array): Record<string, Uint8Array> {
  if (bytes.length > LIMIETEN.pakketBytes)
    throw new Error("Document package is too large");
  let totaal = 0,
    aantal = 0;
  return unzipSync(bytes, {
    filter: (f) => {
      totaal += f.originalSize;
      if (++aantal > LIMIETEN.onderdelen || totaal > LIMIETEN.uitgepaktBytes)
        throw new Error("Document package exceeds the unpacked limit");
      return true;
    },
  });
}
function zipBewaar(z: Record<string, Uint8Array>) {
  const uit: Zippable = {};
  if (z.mimetype) uit.mimetype = [z.mimetype, { level: 0 }];
  for (const [pad, bytes] of Object.entries(z))
    if (pad !== "mimetype") uit[pad] = bytes;
  return zipSync(uit);
}
function voor(el: XmlElement) {
  return el.voorvoegsel ? el.voorvoegsel + ":" : "";
}
function fragment(xml: string, el: XmlElement | null, root: XmlElement) {
  if (!el) return null;
  const ns = Object.fromEntries(
    Object.entries(root.attrs).filter(([k]) => k.startsWith("xmlns")),
  );
  return (
    `<${el.naam}${attrTekst({ ...ns, ...el.attrs })}${el.leeg ? "/>" : ">"}` +
    (el.leeg ? "" : xml.slice(el.inhoudStart, el.eind))
  );
}
function ouder(
  el: XmlElement | null | undefined,
  naam: string,
): XmlElement | null {
  while (el && el.lokaal !== naam) el = el.ouder;
  return el ?? null;
}
function canon(el: XmlElement): unknown {
  return [
    namespaceVan(el, el.voorvoegsel),
    el.lokaal,
    Object.entries(el.attrs)
      .filter(([k]) => !k.startsWith("xmlns"))
      .map(([k, v]) => [
        k.includes(":")
          ? namespaceVan(el, k.split(":")[0]) + ":" + k.split(":")[1]
          : k,
        v,
      ])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    el.kinderen.flatMap((k) =>
      k.soort === "element" ? [canon(k)] : k.tekst.trim() ? [k.tekst] : [],
    ),
  ];
}
function stijlsom(z: Record<string, Uint8Array>, alleenNoten = false) {
  const delen: string[] = [];
  for (const pad of ["styles.xml", "content.xml"])
    if (z[pad]) {
      const root = leesXml(strFromU8(z[pad]));
      for (const groep of zoekAlle(
        root,
        alleenNoten ? "notes-configuration" : "styles",
      ).concat(alleenNoten ? [] : zoekAlle(root, "automatic-styles"))) {
        if (alleenNoten) delen.push(JSON.stringify(canon(groep)));
        else
          for (const el of elementen(groep))
            if (
              [
                "style",
                "default-style",
                "list-style",
                "table-template",
              ].includes(el.lokaal)
            )
              delen.push(JSON.stringify(canon(el)));
      }
    }
  return JSON.stringify(delen.sort());
}

/** Keep only inert style/numbering/theme dependencies, never original text or macros. */
function stijlBibliotheek(bytes: Uint8Array) {
  const z = new Pakket(bytes),
    doc = openDocument(z),
    houd = new Set([
      "[Content_Types].xml",
      "_rels/.rels",
      doc.pad,
      Pakket.relsPad(doc.pad),
    ]);
  const relaties = z
    .relaties(doc.pad)
    .filter(
      (r) =>
        !r.extern &&
        [
          WREL.styles,
          "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme",
          "http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering",
        ].includes(r.type),
    );
  function neem(pad: string) {
    if (houd.has(pad)) return;
    houd.add(pad);
    const rels = z
      .relaties(pad)
      .filter(
        (r) =>
          r.type ===
          "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
      );
    if (rels.length) {
      houd.add(Pakket.relsPad(pad));
      z.schrijf(
        Pakket.relsPad(pad),
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.map((r) => `<Relationship${attrTekst({ Id: r.id, Type: r.type, Target: r.target, ...(r.extern ? { TargetMode: "External" } : {}) })}/>`).join("")}</Relationships>`,
      );
    }
    for (const r of rels) if (!r.extern) neem(Pakket.doelPad(pad, r.target));
  }
  for (const r of relaties) neem(Pakket.doelPad(doc.pad, r.target));
  for (const pad of z.namen()) if (!houd.has(pad)) z.verwijder(pad);
  z.schrijf(
    doc.pad,
    `<w:document xmlns:w="${W}"><w:body><w:p/><w:sectPr/></w:body></w:document>`,
  );
  z.schrijf(
    "_rels/.rels",
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdDocument" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${ontsnap(doc.pad)}"/></Relationships>`,
  );
  z.schrijf(
    Pakket.relsPad(doc.pad),
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relaties.map((r) => `<Relationship${attrTekst({ Id: r.id, Type: r.type, Target: r.target })}/>`).join("")}</Relationships>`,
  );
  const ct = z.lees("[Content_Types].xml"),
    cr = leesXml(ct);
  z.schrijf(
    "[Content_Types].xml",
    vervang(
      ct,
      kinderen(cr, "Override")
        .filter(
          (e) => !houd.has((attr(e, "PartName") ?? "").replace(/^\//, "")),
        )
        .map((e) => ({ start: e.start, eind: e.eind, tekst: "" })),
    ),
  );
  return z.inpakken();
}
function label(n: number, notatie: string) {
  if (notatie === "lowerLetter" || notatie === "upperLetter") {
    let r = "";
    for (let i = n; i > 0; i = Math.floor((i - 1) / 26))
      r = String.fromCharCode(65 + ((i - 1) % 26)) + r;
    return notatie === "lowerLetter" ? r.toLowerCase() : r;
  }
  if (notatie === "lowerRoman" || notatie === "upperRoman") {
    let r = "",
      i = n;
    for (const [v, s] of [
      [1000, "M"],
      [900, "CM"],
      [500, "D"],
      [400, "CD"],
      [100, "C"],
      [90, "XC"],
      [50, "L"],
      [40, "XL"],
      [10, "X"],
      [9, "IX"],
      [5, "V"],
      [4, "IV"],
      [1, "I"],
    ] as const)
      while (i >= v) {
        r += s;
        i -= v;
      }
    return notatie === "lowerRoman" ? r.toLowerCase() : r;
  }
  if (notatie === "chicago")
    return ["*", "†", "‡", "§"][(((n - 1) % 4) + 4) % 4].repeat(
      Math.floor((n - 1) / 4) + 1,
    );
  return String(n);
}

export async function voorWriterConversie(
  bytes: Uint8Array,
  van: string,
  naar: string,
): Promise<WriterConversie> {
  const uit: WriterConversie = { bytes, van, naar };
  if (["odt", "ott"].includes(van) && naar === "docx") {
    const z = zipOpen(bytes);
    if (!z[META] || !z[LIB]) return uit;
    if (z[META].length > 8 * 1024 * 1024 || z[LIB].length > 32 * 1024 * 1024)
      throw new Error("Writer preservation data exceeds its limit");
    const b = JSON.parse(strFromU8(z[META])) as Bewaar;
    if (
      b.versie !== 1 ||
      !Array.isArray(b.secties) ||
      !Array.isArray(b.tabellen) ||
      !Array.isArray(b.lijsten) ||
      !Array.isArray(b.noten) ||
      b.secties.length > 10000 ||
      b.tabellen.length + b.lijsten.length > 100000
    )
      throw new Error("Invalid Writer preservation data");
    for (const s of b.secties)
      for (const soort of ["voetnoot", "eindnoot"] as const) {
        const cfg = s[soort];
        if (
          !cfg ||
          typeof cfg.notatie !== "string" ||
          !/^[a-zA-Z][a-zA-Z0-9]{0,63}$/.test(cfg.notatie) ||
          !Number.isInteger(cfg.beginBij) ||
          cfg.beginBij < 1 ||
          cfg.beginBij > 32767 ||
          !["continuous", "eachSect", "eachPage"].includes(cfg.herstart) ||
          !(
            soort === "voetnoot"
              ? ["pageBottom", "beneathText"]
              : ["sectEnd", "docEnd"]
          ).includes(cfg.positie)
        )
          throw new Error("Invalid preserved note settings");
      }
    for (const l of b.lijsten)
      if (
        !Number.isInteger(l.numId) ||
        l.numId < 1 ||
        !Number.isInteger(l.ilvl) ||
        l.ilvl < 0 ||
        l.ilvl > 8
      )
        throw new Error("Invalid preserved list definition");
    for (const m of [
      ...b.secties.map((s) => s.marker),
      ...b.tabellen.map((t) => t.marker),
      ...b.lijsten.map((l) => l.marker),
    ])
      if (m && !markerPatroon.test(m))
        throw new Error("Invalid Writer preservation anchor");
    return { ...uit, bewaar: b, bibliotheek: z[LIB], odf: z };
  }
  if (van !== "docx" || !["odt", "ott"].includes(naar)) return uit;
  const z = new Pakket(bytes),
    doc = openDocument(z),
    ss = secties(doc),
    bewaar: Bewaar = {
      versie: 1,
      secties: [],
      tabellen: [],
      lijsten: [],
      noten: [],
    };
  const stijlpad = onderdeelVan(z, doc.pad, WREL.styles),
    stijlen = stijlpad ? leesStijlen(z.lees(stijlpad)) : [];
  const token = crypto.randomUUID().replaceAll("-", "").slice(0, 10),
    p = voor(doc.wortel),
    wijzigingen: Vervanging[] = [],
    lege = new Map<XmlElement, string>();
  let id =
    Math.max(
      0,
      ...zoekAlle(doc.wortel, "bookmarkStart").map(
        (e) => Number(attr(e, "id")) || 0,
      ),
    ) + 1;
  function markeer(alinea: XmlElement, type: string, n: number) {
    const naam = `_OOSW_${token}_${type}${n}`,
      plek = kind(alinea, "pPr")?.eind ?? alinea.inhoudStart;
    const tekst = `<${p}bookmarkStart ${p}id="${id}" ${p}name="${naam}"/><${p}bookmarkEnd ${p}id="${id++}"/>`;
    if (alinea.leeg) lege.set(alinea, (lege.get(alinea) ?? "") + tekst);
    else wijzigingen.push({ start: plek, eind: plek, tekst });
    return naam;
  }
  const nootSettings = leesAlleNootInstellingen(z);
  for (const s of ss)
    bewaar.secties.push({
      marker: s.alinea ? markeer(s.alinea, "s", s.index) : null,
      ...nootSettings[s.index],
    });
  for (const tbl of zoekAlle(doc.body, "tbl")) {
    const stijl = attr(kind(kind(tbl, "tblPr"), "tblStyle"), "val");
    const alinea = zoekAlle(tbl, "p").find(
      (e) => ouder(e.ouder, "tbl") === tbl,
    );
    if (!stijl || !alinea) continue;
    bewaar.tabellen.push({
      marker: markeer(alinea, "t", bewaar.tabellen.length),
      stijl,
      pr: fragment(doc.xml, kind(tbl, "tblPr"), doc.wortel),
      rijen: kinderen(tbl, "tr").map((tr) => ({
        pr: fragment(doc.xml, kind(tr, "trPr"), doc.wortel),
        cellen: kinderen(tr, "tc").map((tc) =>
          fragment(doc.xml, kind(tc, "tcPr"), doc.wortel),
        ),
      })),
    });
  }
  function nummer(alinea: XmlElement) {
    const pr = kind(alinea, "pPr"),
      direct = kind(pr, "numPr");
    if (direct)
      return {
        numId: Number(attr(kind(direct, "numId"), "val") ?? 0),
        ilvl: Number(attr(kind(direct, "ilvl"), "val") ?? 0),
      };
    let stijl = attr(kind(pr, "pStyle"), "val");
    const gezien = new Set<string>();
    while (stijl && !gezien.has(stijl)) {
      gezien.add(stijl);
      const s = stijlen.find((s) => s.styleId === stijl);
      if (s?.eigenschappen.lijst) return s.eigenschappen.lijst;
      stijl = s?.gebaseerdOp;
    }
    return null;
  }
  for (const alinea of zoekAlle(doc.body, "p")) {
    const n = nummer(alinea);
    if (n?.numId)
      bewaar.lijsten.push({
        marker: markeer(alinea, "l", bewaar.lijsten.length),
        ...n,
      });
  }
  const tellers = { voetnoot: 0, eindnoot: 0 },
    vorige = { voetnoot: -1, eindnoot: -1 };
  for (const ref of zoekAlle(doc.body, "footnoteReference")
    .concat(zoekAlle(doc.body, "endnoteReference"))
    .sort((a, b) => a.start - b.start)) {
    const soort: NootSoort =
        ref.lokaal === "footnoteReference" ? "voetnoot" : "eindnoot",
      si = ss.findIndex((s) => !s.alinea || s.alinea.eind > ref.start),
      cfg = bewaar.secties[si][soort];
    if (["1", "true", "on"].includes(attr(ref, "customMarkFollows") ?? "")) {
      bewaar.noten.push({ soort, label: null });
      continue; // Authored symbols do not consume an automatic note number.
    }
    if (
      !tellers[soort] ||
      (cfg.herstart === "eachSect" && vorige[soort] !== si)
    )
      tellers[soort] = cfg.beginBij;
    else tellers[soort]++;
    vorige[soort] = si;
    bewaar.noten.push({
      soort,
      label:
        cfg.herstart === "eachPage" ||
        !Object.hasOwn(odfNotatie, cfg.notatie)
          ? null
          : label(tellers[soort], cfg.notatie),
    });
  }
  for (const [el, tekst] of lege)
    wijzigingen.push({
      start: el.start,
      eind: el.eind,
      tekst: `<${el.naam}${attrTekst(el.attrs)}>${tekst}</${el.naam}>`,
    });
  z.schrijf(doc.pad, vervang(doc.xml, wijzigingen));
  return {
    ...uit,
    bytes: z.inpakken(),
    bewaar,
    bibliotheek: stijlBibliotheek(bytes),
  };
}

const odfAnkers = new WeakMap<
  object,
  {
    bytes: Uint8Array;
    xml: string;
    root: XmlElement;
    markers: Map<string, XmlElement>;
  }
>();
function odfMarker(z: Record<string, Uint8Array>, marker: string) {
  let staat = odfAnkers.get(z);
  if (!staat || staat.bytes !== z["content.xml"]) {
    const xml = strFromU8(z["content.xml"]),
      root = leesXml(xml);
    staat = {
      bytes: z["content.xml"],
      xml,
      root,
      markers: new Map(
        zoekAlle(root, "bookmark")
          .concat(zoekAlle(root, "bookmark-start"))
          .filter((e) => namespaceVan(e, e.voorvoegsel) === O)
          .map((e) => [attr(e, "name") ?? "", e]),
      ),
    };
    odfAnkers.set(z, staat);
  }
  return { ...staat, el: staat.markers.get(marker) };
}

/** Recover note scopes even when a converter flattened a continuous section. */
function herstelNootSecties(z: Pakket, b: Bewaar) {
  let doc = openDocument(z),
    ss = secties(doc);
  let markers = new Map(
    zoekAlle(doc.wortel, "bookmarkStart").map((e) => [
      attr(e, "name") ?? "",
      e,
    ]),
  );
  const w: Vervanging[] = [];
  for (const [ci, cfg] of b.secties.entries()) {
    if (!cfg.marker) continue;
    const p = ouder(markers.get(cfg.marker), "p");
    if (!p || kind(kind(p, "pPr"), "sectPr")) continue;
    const volgende = b.secties[ci + 1];
    if (!volgende) continue;
    const np = volgende.marker
      ? ouder(markers.get(volgende.marker), "p")
      : null;
    if (volgende.marker && !np) continue;
    const i = ss.findIndex((s) => !s.alinea || s.alinea.eind > p.start),
      ni = np
        ? ss.findIndex((s) => !s.alinea || s.alinea.eind > np.start)
        : ss.length - 1;
    if (i !== ni) continue;
    const bestaand = ss.find((s) => !s.alinea || s.alinea.eind > p.start),
      pr = kind(p, "pPr"),
      pfx = voor(p);
    let sectPr =
      fragment(doc.xml, bestaand?.el ?? null, doc.wortel) ?? `<${pfx}sectPr/>`;
    sectPr = zetKind(
      sectPr,
      "type",
      `<${pfx}type ${pfx}val="continuous"/>`,
      SECTPR_VOLGORDE,
    );
    const tekst = zetKind(
      pr ? doc.xml.slice(pr.start, pr.eind) : `<${pfx}pPr/>`,
      "sectPr",
      sectPr,
      PPR_VOLGORDE,
    );
    w.push(
      pr
        ? { start: pr.start, eind: pr.eind, tekst }
        : { start: p.inhoudStart, eind: p.inhoudStart, tekst },
    );
  }
  if (w.length) {
    z.schrijf(doc.pad, vervang(doc.xml, w));
    doc = openDocument(z);
    ss = secties(doc);
    markers = new Map(
      zoekAlle(doc.wortel, "bookmarkStart").map((e) => [
        attr(e, "name") ?? "",
        e,
      ]),
    );
  }
  const instellingen = leesAlleNootInstellingen(z);
  for (const cfg of b.secties) {
    const p = cfg.marker ? ouder(markers.get(cfg.marker), "p") : null;
    const i = cfg.marker
      ? p
        ? ss.findIndex((s) => !s.alinea || s.alinea.eind > p.start)
        : -1
      : ss.length - 1;
    if (i >= 0)
      instellingen[i] = { voetnoot: cfg.voetnoot, eindnoot: cfg.eindnoot };
  }
  wijzigSectPrs(
    doc,
    ss.map((s) => s.index),
    (xml, s) => {
      const pfx = voor(leesXml(xml));
      for (const [soort, naam] of [
        ["voetnoot", "footnotePr"],
        ["eindnoot", "endnotePr"],
      ] as const) {
        const cfg = instellingen[s.index][soort],
          oud = kind(leesXml(xml), naam);
        let pr = oud ? xml.slice(oud.start, oud.eind) : `<${pfx}${naam}/>`;
        for (const [naam, val] of Object.entries({
          pos: cfg.positie,
          numFmt: cfg.notatie,
          numStart: String(cfg.beginBij),
          numRestart: cfg.herstart,
        }))
          pr = zetKind(
            pr,
            naam,
            `<${pfx}${naam} ${pfx}val="${ontsnap(val)}"/>`,
            NOTEPR_VOLGORDE,
          );
        xml = zetKind(xml, naam, pr, SECTPR_VOLGORDE);
      }
      return xml;
    },
  );
  // Materialize inherited numbering before dropping the document-wide values:
  // the pinned headless layout accepts numbering authored on the section.
  wijzigInstellingen(z, doc.pad, (xml) => {
    for (const naam of ["footnotePr", "endnotePr"]) {
      const el = kind(leesXml(xml), naam);
      if (!el) continue;
      let pr = xml.slice(el.start, el.eind);
      for (const prop of ["pos", "numFmt", "numStart", "numRestart"])
        pr = zetKind(pr, prop, null, NOTEPR_VOLGORDE);
      xml = zetKind(xml, naam, pr, SETTINGS_VOLGORDE);
    }
    return xml;
  });
}
function tabelVorm(tbl: XmlElement) {
  return JSON.stringify(
    zoekAlle(tbl, "table-cell").map((c) => [
      attr(c, "style-name"),
      attr(c, "number-columns-spanned"),
      attr(c, "number-rows-spanned"),
    ]),
  );
}

export async function naWriterConversie(
  vooraf: WriterConversie,
  bytes: Uint8Array,
): Promise<Uint8Array> {
  const b = vooraf.bewaar;
  if (!b || !vooraf.bibliotheek) return bytes;
  if (vooraf.van === "docx") {
    const z = zipOpen(bytes),
      xml = strFromU8(z["content.xml"]),
      root = leesXml(xml),
      wijzigingen: Vervanging[] = [];
    const noten = zoekAlle(root, "note").filter(
      (e) => namespaceVan(e, e.voorvoegsel) === O,
    );
    for (const soort of ["voetnoot", "eindnoot"] as const) {
      const bron = b.noten.filter((n) => n.soort === soort),
        doel = noten.filter(
          (n) =>
            attr(n, "note-class") ===
            (soort === "voetnoot" ? "footnote" : "endnote"),
        );
      if (bron.length !== doel.length)
        throw new Error(
          "The ODT conversion changed the number of note references",
        );
      doel.forEach((n, i) => {
        bron[i].odfId = attr(n, "id");
        const cite = kind(n, "note-citation"),
          tekst = bron[i].label;
        if (!cite || tekst === null) return;
        const p = voor(cite);
        wijzigingen.push({
          start: cite.start,
          eind: cite.eind,
          tekst: `<${cite.naam}${attrTekst({ ...cite.attrs, [p + "label"]: tekst })}>${ontsnap(tekst)}</${cite.naam}>`,
        });
      });
    }
    z["content.xml"] = strToU8(vervang(xml, wijzigingen));
    // Standard ODF settings cover document/page restart. Per-section variants
    // also retain their visible citations and their native automatic settings.
    if (z["styles.xml"] && b.secties[0]) {
      const sx = strFromU8(z["styles.xml"]),
        sr = leesXml(sx),
        sw: Vervanging[] = [];
      for (const el of zoekAlle(sr, "notes-configuration")) {
        if (
          namespaceVan(el, el.voorvoegsel) !== O ||
          el.ouder?.lokaal !== "styles"
        )
          continue;
        const soort =
            attr(el, "note-class") === "endnote" ? "eindnoot" : "voetnoot",
          cfg = b.secties[0][soort];
        // Preserve the converter's representation for imported formats outside
        // the six formats offered by our note dialog.
        if (!Object.hasOwn(odfNotatie, cfg.notatie)) continue;
        const attrs = Object.fromEntries(
          Object.entries(el.attrs).filter(
            ([k]) =>
              ![
                "num-format",
                "start-value",
                "start-numbering-at",
                "footnotes-position",
              ].includes(k.split(":").at(-1)!),
          ),
        );
        Object.assign(attrs, {
          "xmlns:style": "urn:oasis:names:tc:opendocument:xmlns:style:1.0",
          "xmlns:text": O,
          "style:num-format": odfNotatie[cfg.notatie],
          "text:start-value": String(cfg.beginBij - 1),
          "text:start-numbering-at":
            cfg.herstart === "eachPage"
              ? "page"
              : cfg.herstart === "eachSect"
                ? "chapter"
                : "document",
          "text:footnotes-position": {
            pageBottom: "page",
            beneathText: "text",
            sectEnd: "section",
            docEnd: "document",
          }[cfg.positie],
        });
        sw.push({
          start: el.start,
          eind: el.leeg ? el.eind : el.inhoudStart,
          tekst: `<${el.naam}${attrTekst(attrs)}${el.leeg ? "/>" : ">"}`,
        });
      }
      z["styles.xml"] = strToU8(vervang(sx, sw));
    }
    for (const tabel of b.tabellen) {
      const m = odfMarker(z, tabel.marker),
        tbl = ouder(m.el, "table");
      if (tbl) tabel.vorm = tabelVorm(tbl);
    }
    b.stijlen = stijlsom(z);
    b.nootStijlen = stijlsom(z, true);
    z[META] = strToU8(JSON.stringify(b));
    z[LIB] = vooraf.bibliotheek;
    const manifest = strFromU8(z["META-INF/manifest.xml"]),
      mr = leesXml(manifest),
      mp = voor(mr);
    z["META-INF/manifest.xml"] = strToU8(
      vervang(manifest, [
        {
          start: mr.inhoudEind,
          eind: mr.inhoudEind,
          tekst: `<${mp}file-entry ${mp}full-path="${META}" ${mp}media-type="application/json"/><${mp}file-entry ${mp}full-path="${LIB}" ${mp}media-type="application/vnd.openxmlformats-officedocument.wordprocessingml.document"/>`,
        },
      ]),
    );
    return zipBewaar(z);
  }
  const odf = vooraf.odf!,
    stijlenGelijk = b.stijlen === stijlsom(odf),
    notenGelijk = b.nootStijlen === stijlsom(odf, true);
  let z = new Pakket(bytes);
  if (stijlenGelijk) {
    const oudPad = onderdeelVan(z, openDocument(z).pad, WREL.styles),
      oud = oudPad ? leesStijlen(z.lees(oudPad)) : [];
    const lib = new Pakket(vooraf.bibliotheek),
      lp = onderdeelVan(lib, openDocument(lib).pad, WREL.styles)!,
      bron = leesStijlen(lib.lees(lp));
    const geimporteerd = await importeerDocumentStijlen(
      z.inpakken(),
      vooraf.bibliotheek,
      undefined,
      true,
    );
    z = new Pakket(geimporteerd.bytes);
    const map = new Map(
      oud.flatMap((s) => {
        const n = bron.find((b) => b.naam === s.naam && b.soort === s.soort);
        return n
          ? [[s.styleId, geimporteerd.stijlMap[n.styleId]] as const]
          : [];
      }),
    );
    for (const pad of z.namen().filter((n) => /^word\/.*\.xml$/.test(n))) {
      const xml = z.lees(pad),
        r = leesXml(xml),
        w: Vervanging[] = [];
      for (const el of zoekAlle(r, "pStyle").concat(
        zoekAlle(r, "rStyle"),
        zoekAlle(r, "tblStyle"),
      )) {
        const id = attr(el, "val");
        if (namespaceVan(el, el.voorvoegsel) === W && id && map.has(id))
          w.push({
            start: el.start,
            eind: el.eind,
            tekst: `<${el.naam} ${voor(el)}val="${ontsnap(map.get(id)!)}"/>`,
          });
      }
      if (w.length) z.schrijf(pad, vervang(xml, w));
    }
    const inhoud = openDocument(z),
      woordMarkers = new Map(
        zoekAlle(inhoud.wortel, "bookmarkStart").map((e) => [
          attr(e, "name") ?? "",
          e,
        ]),
      ),
      wijzigingen: Vervanging[] = [];
    for (const l of b.lijsten) {
      const doc = inhoud,
        m = woordMarkers.get(l.marker),
        p = ouder(m, "p");
      if (!p) continue;
      const pr = kind(p, "pPr"),
        num = geimporteerd.nummerMap[String(l.numId)];
      if (!num) continue;
      const pfx = voor(p),
        tekst = `<${pfx}numPr><${pfx}ilvl ${pfx}val="${l.ilvl}"/><${pfx}numId ${pfx}val="${num}"/></${pfx}numPr>`;
      const nieuw = zetKind(
        pr ? doc.xml.slice(pr.start, pr.eind) : `<${pfx}pPr/>`,
        "numPr",
        tekst,
        PPR_VOLGORDE,
      );
      wijzigingen.push(
        pr
          ? { start: pr.start, eind: pr.eind, tekst: nieuw }
          : { start: p.inhoudStart, eind: p.inhoudStart, tekst: nieuw },
      );
    }
    for (const t of b.tabellen) {
      const od = odfMarker(odf, t.marker),
        ot = ouder(od.el, "table"),
        doc = inhoud,
        m = woordMarkers.get(t.marker),
        tbl = ouder(m, "tbl");
      if (!tbl || !ot || t.vorm !== tabelVorm(ot)) continue;
      const w = wijzigingen;
      const zet = (el: XmlElement, naam: string, tekst: string | null) => {
        const k = kind(el, naam);
        if (k) w.push({ start: k.start, eind: k.eind, tekst: tekst ?? "" });
        else if (tekst)
          w.push({ start: el.inhoudStart, eind: el.inhoudStart, tekst });
      };
      let pr = t.pr;
      if (pr) {
        const rr = leesXml(pr),
          stijl = kind(rr, "tblStyle");
        if (stijl)
          pr = vervang(pr, [
            {
              start: stijl.start,
              eind: stijl.eind,
              tekst: `<${stijl.naam} ${voor(stijl)}val="${ontsnap(geimporteerd.stijlMap[t.stijl] ?? t.stijl)}"/>`,
            },
          ]);
      }
      zet(tbl, "tblPr", pr);
      const rows = kinderen(tbl, "tr");
      if (rows.length === t.rijen.length)
        rows.forEach((row, i) => {
          zet(row, "trPr", t.rijen[i].pr);
          const cells = kinderen(row, "tc");
          if (cells.length === t.rijen[i].cellen.length)
            cells.forEach((cell, j) => zet(cell, "tcPr", t.rijen[i].cellen[j]));
        });
    }
    if (wijzigingen.length)
      z.schrijf(inhoud.pad, vervang(inhoud.xml, wijzigingen));
  }
  if (notenGelijk) {
    herstelNootSecties(z, b);
    const or = leesXml(strFromU8(odf["content.xml"])),
      onoten = zoekAlle(or, "note").filter(
        (e) => namespaceVan(e, e.voorvoegsel) === O,
      );
    for (const soort of ["voetnoot", "eindnoot"] as const) {
      const doc = openDocument(z),
        refs = zoekAlle(
          doc.body,
          soort === "voetnoot" ? "footnoteReference" : "endnoteReference",
        ),
        odrefs = onoten.filter(
          (n) =>
            attr(n, "note-class") ===
            (soort === "voetnoot" ? "footnote" : "endnote"),
        ),
        w: Vervanging[] = [];
      for (const nb of b.noten.filter(
        (n) => n.soort === soort && n.label !== null,
      )) {
        const i = odrefs.findIndex((n) => attr(n, "id") === nb.odfId);
        const ref = refs[i],
          cite = kind(odrefs[i], "note-citation");
        if (!ref || attr(cite, "label") !== nb.label) continue;
        const run = ref.ouder;
        if (!run) continue;
        const t = kind(run, "t"),
          f = voor(ref);
        w.push({
          start: ref.start,
          eind: ref.eind,
          tekst: `<${ref.naam}${attrTekst(Object.fromEntries(Object.entries(ref.attrs).filter(([k]) => !k.endsWith("customMarkFollows"))))}/>`,
        });
        if (t && tekstVan(t) === nb.label)
          w.push({ start: t.start, eind: t.eind, tekst: "" });
        const part = onderdeelVan(
          z,
          doc.pad,
          soort === "voetnoot" ? WREL.footnotes : WREL.endnotes,
        );
        if (part) {
          const nx = z.lees(part),
            nr = leesXml(nx),
            note = kinderen(
              nr,
              soort === "voetnoot" ? "footnote" : "endnote",
            ).find((n) => attr(n, "id") === attr(ref, "id"));
          const eerste = note ? zoekAlle(note, "r")[0] : null;
          if (eerste) {
            const nt = kind(eerste, "t");
            if (nt && tekstVan(nt) === nb.label)
              z.schrijf(
                part,
                vervang(nx, [
                  {
                    start: nt.start,
                    eind: nt.eind,
                    tekst: `<${f}${soort === "voetnoot" ? "footnoteRef" : "endnoteRef"}/>`,
                  },
                ]),
              );
          }
        }
      }
      if (w.length) z.schrijf(doc.pad, vervang(doc.xml, w));
    }
  }
  const markers = new Set(
    [
      ...b.secties.map((s) => s.marker),
      ...b.tabellen.map((t) => t.marker),
      ...b.lijsten.map((l) => l.marker),
    ].filter(Boolean),
  );
  for (const pad of z.namen().filter((n) => /^word\/.*\.xml$/.test(n))) {
    const xml = z.lees(pad),
      r = leesXml(xml),
      starts = zoekAlle(r, "bookmarkStart").filter((e) =>
        markers.has(attr(e, "name") ?? ""),
      ),
      ids = new Set(starts.map((e) => attr(e, "id")));
    const weg = starts.concat(
      zoekAlle(r, "bookmarkEnd").filter((e) => ids.has(attr(e, "id"))),
    );
    if (weg.length)
      z.schrijf(
        pad,
        vervang(
          xml,
          weg.map((e) => ({ start: e.start, eind: e.eind, tekst: "" })),
        ),
      );
  }
  return z.inpakken();
}
