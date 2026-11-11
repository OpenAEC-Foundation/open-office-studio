import { parseDocx } from "@betteroffice/docx/docx";
import { resolveColor } from "@betteroffice/docx";
import type { ColorValue, Theme } from "@betteroffice/docx/types/document";
import { Pakket, openDocument, onderdeelVan, WREL, nieuwOnderdeel, vindMarkering, verwijderMarkering } from "../pagina/ooxml";
import { attr, attrTekst, elementen, kind, kinderen, leesXml, namespaceVan, vervang, type XmlElement, type Vervanging } from "../../grafieken/xml";
import { leesStijlen, StijlFout, wijzigStijl } from "./stijlenxml";

export interface NieuweNummering { styleId: string; format: string; start: number;
}
/** A private list definition: editing this style cannot alter unrelated lists. */
export function maakLijstStijl(bytes: Uint8Array, lijst: NieuweNummering): Uint8Array {
  if (!["decimal", "lowerLetter", "upperLetter", "lowerRoman", "upperRoman", "bullet"].includes(lijst.format) || !Number.isInteger(lijst.start) || lijst.start < 1 || lijst.start > 32767) throw new StijlFout("Invalid list format or start");
  const z = new Pakket(bytes), doc = openDocument(z);
  let pad = onderdeelVan(z, doc.pad, R + "numbering");
  if (!pad) pad = nieuwOnderdeel(z, doc.pad, "word/numbering#.xml", NUM_TYPE, R + "numbering", `<w:numbering xmlns:w="${W}"/>`).pad;
  const xml = z.lees(pad), root = leesXml(xml);
  const aid = 1 + Math.max(0, ...kinderen(root, "abstractNum").map(
        (el) => Number(attr(el, "abstractNumId")) || 0));
  const nid = 1 + Math.max(0, ...kinderen(root, "num").map((el) => Number(attr(el, "numId")) || 0));
  const levels = Array.from({ length: 9 }, (_, i) => `<w:lvl w:ilvl="${i}"><w:start w:val="${lijst.start}"/><w:numFmt w:val="${lijst.format}"/><w:lvlText w:val="${lijst.format === "bullet" ? "•" : `%${i + 1}.`}"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="${720 * (i + 1)}"/></w:tabs><w:ind w:left="${720 * (i + 1)}" w:hanging="360"/></w:pPr></w:lvl>`).join("");
  const abstract = `<w:abstractNum xmlns:w="${W}" w:abstractNumId="${aid}"><w:multiLevelType w:val="multilevel"/>${levels}</w:abstractNum>`;
  const num = `<w:num xmlns:w="${W}" w:numId="${nid}"><w:abstractNumId w:val="${aid}"/></w:num>`;
  const eersteNum = kinderen(root, "num")[0];
  const uit = eersteNum ? vervang(xml, [{ start: eersteNum.start, eind: eersteNum.start, tekst: abstract }]) : voegToe(xml, abstract);
  z.schrijf(pad, voegToe(uit, num));
  const sp = stijlPad(z);
  z.schrijf(sp, wijzigStijl(z.lees(sp), lijst.styleId, { eigenschappen: { lijst: { numId: nid, ilvl: 0 } } }));
  return z.inpakken();
}

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";
const NUM_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml";
const verwijzingen = new Set(["basedOn", "next", "link", "pStyle", "rStyle", "tblStyle", "styleLink", "numStyleLink"]);

/** Apply to the nearest table, including nested tables, identified by the live cursor. */
export function pasTabelStijlToe(bytes: Uint8Array, markering: string, id: string) {
  const z = new Pakket(bytes), plek = vindMarkering(z, markering);
  if (!plek) throw new StijlFout("Place the cursor in a table first");
  let tabel: XmlElement | null = plek.alinea.ouder;
  while (tabel && tabel.lokaal !== "tbl") tabel = tabel.ouder;
  if (!tabel) throw new StijlFout("Place the cursor in a table first");
  if (!leesStijlen(z.lees(stijlPad(z))).some(
      (s) => s.styleId === id && s.soort === "table")) throw new StijlFout("The table style no longer exists");
  const p = tabel.voorvoegsel ? tabel.voorvoegsel + ":" : "", pr = kind(tabel, "tblPr"), stijl = kind(pr, "tblStyle");
  const tekst = `<${p}tblStyle ${p}val="${id.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}"/>`;
  z.schrijf(plek.pad, vervang(plek.xml, [stijl ? { start: stijl.start, eind: stijl.eind, tekst }
    : pr && !pr.leeg ? { start: pr.inhoudStart, eind: pr.inhoudStart, tekst }
    : pr ? { start: pr.start, eind: pr.eind, tekst: `<${p}tblPr>${tekst}</${p}tblPr>` }
    : { start: tabel.inhoudStart, eind: tabel.inhoudStart, tekst: `<${p}tblPr>${tekst}</${p}tblPr>` }]));
  verwijderMarkering(z, markering);
  return z.inpakken();
}
function alle(el: XmlElement): XmlElement[] { return [el, ...elementen(el).flatMap(alle)]; }
function openTag(el: XmlElement, attrs: Record<string, string>) { return `<${el.naam}${attrTekst(attrs)}${el.leeg ? "/>" : ">"}`; }
function bewerkAttributen(xml: string, doe: (el: XmlElement, attrs: Record<string, string>) => void, alleNamespaces = false) {
  const wijz: Vervanging[] = [];
  for (const el of alle(leesXml(xml))) {
    if (!alleNamespaces && namespaceVan(el, el.voorvoegsel) !== W) continue;
    const attrs = { ...el.attrs }; doe(el, attrs);
    if (JSON.stringify(attrs) !== JSON.stringify(el.attrs)) wijz.push({ start: el.start, eind: el.leeg ? el.eind : el.inhoudStart, tekst: openTag(el, attrs) });
  }
  return vervang(xml, wijz);
}
function zetAttr(el: XmlElement, attrs: Record<string, string>, naam: string, waarde: string | null) {
  const sleutel = Object.keys(attrs).find(
      (k) => k.split(":").pop() === naam && !k.startsWith("xmlns")) ?? `${el.voorvoegsel ? el.voorvoegsel + ":" : ""}${naam}`;
  if (waarde === null) delete attrs[sleutel]; else attrs[sleutel] = waarde;
}
function fragment(xml: string, el: XmlElement, root: XmlElement) {
  const attrs = { ...Object.fromEntries(Object.entries(root.attrs).filter(([k]) => k === "xmlns" || k.startsWith("xmlns:"))), ...el.attrs };
  return (
    openTag(el, attrs) + (el.leeg ? "" : xml.slice(el.inhoudStart, el.eind)));
}
function voegToe(xml: string, inhoud: string) {
  const root = leesXml(xml);
  return root.leeg ? openTag({ ...root, leeg: false }, root.attrs) + inhoud + `</${root.naam}>`
    : vervang(xml, [{ start: root.inhoudEind, eind: root.inhoudEind, tekst: inhoud }]);
}
function stijlPad(z: Pakket) { const d = openDocument(z); const pad = onderdeelVan(z, d.pad, WREL.styles); if (!pad) throw new StijlFout("No styles part"); return pad; }

/** Delete only custom, non-default styles, repairing Word references in every XML story. */
export function verwijderDocumentStijl(bytes: Uint8Array, id: string, vervanging?: string): Uint8Array {
  const z = new Pakket(bytes), pad = stijlPad(z), xml = z.lees(pad), root = leesXml(xml);
  const stijl = kinderen(root, "style").find((s) => attr(s, "styleId") === id);
  if (!stijl) throw new StijlFout("The style no longer exists");
  if (["1", "true", "on"].includes(attr(stijl, "default") ?? "") || !["1", "true", "on"].includes(attr(stijl, "customStyle") ?? ""))
    throw new StijlFout("Only custom, non-default styles can be deleted");
  const soort = attr(stijl, "type") ?? "paragraph", info = leesStijlen(xml);
  const kandidaat = vervanging ?? attr(kind(stijl, "basedOn"), "val") ?? info.find(
      (s) => s.soort === soort && s.styleId !== id && s.styleId === "Normal")?.styleId;
  if (kandidaat && !info.some(
      (s) => s.styleId === kandidaat && s.styleId !== id && s.soort === soort)) throw new StijlFout("Choose a replacement style of the same type");
  const gezien = new Set<string>();
  for (let huidig = kandidaat; huidig; huidig = info.find((s) => s.styleId === huidig)?.gebaseerdOp) {
    if (huidig === id || gezien.has(huidig)) throw new StijlFout("The replacement must not depend on the deleted style");
    gezien.add(huidig);
  }
  z.schrijf(pad, vervang(xml, [{ start: stijl.start, eind: stijl.eind, tekst: "" }]));
  for (const naam of z.namen()) {
    if (!naam.endsWith(".xml") || naam === "[Content_Types].xml") continue;
    const bron = z.lees(naam); if (!bron.includes(id)) continue;
    const w: Vervanging[] = [];
    for (const el of alle(leesXml(bron))) {
      if (!verwijzingen.has(el.lokaal) || namespaceVan(el, el.voorvoegsel) !== W || attr(el, "val") !== id) continue;
      if (!kandidaat || el.lokaal === "link") w.push({ start: el.start, eind: el.eind, tekst: "" });
      else { const a = { ...el.attrs }; zetAttr(el, a, "val", kandidaat); w.push({ start: el.start, eind: el.leeg ? el.eind : el.inhoudStart, tekst: openTag(el, a) }); }
    }
    if (w.length) z.schrijf(naam, vervang(bron, w));
  }
  return z.inpakken();
}

function explicietThema(xml: string, thema?: Theme) {
  return bewerkAttributen(xml, (el, a) => {
    if (el.lokaal === "rFonts") for (const [themaNaam, fontNaam] of [["asciiTheme", "ascii"], ["hAnsiTheme", "hAnsi"], ["eastAsiaTheme", "eastAsia"], ["cstheme", "cs"]]) {
      const label = attr(el, themaNaam); if (!label) continue;
      const font = label.startsWith("major") ? thema?.fontScheme?.majorFont : thema?.fontScheme?.minorFont;
      const naam = /EastAsia/i.test(label) ? font?.ea || font?.latin : /Bidi/i.test(label) ? font?.cs || font?.latin : font?.latin;
      if (naam) { zetAttr(el, a, themaNaam, null); zetAttr(el, a, fontNaam, naam); }
    }
    for (const [themeKey, tintKey, shadeKey, kleurKey] of [["themeColor", "themeTint", "themeShade", el.lokaal === "color" ? "val" : "color"], ["themeFill", "themeFillTint", "themeFillShade", "fill"]]) {
      const slot = attr(el, themeKey); if (!slot) continue;
      const rgb = resolveColor({ themeColor: slot as ColorValue["themeColor"], themeTint: attr(el, tintKey), themeShade: attr(el, shadeKey) }, thema).replace(/^#/, "");
      if (/^[0-9a-f]{6}$/i.test(rgb)) { zetAttr(el, a, kleurKey, rgb); for (const k of [themeKey, tintKey, shadeKey]) zetAttr(el, a, k, null); }
    }
  });
}

/** Import definitions and their dependencies without changing destination content. */
export async function importeerDocumentStijlen(bytes: Uint8Array, bronBytes: Uint8Array, gekozen?: readonly string[], overschrijven = false): Promise<{ bytes: Uint8Array; ids: string[]; stijlMap: Record<string, string>; nummerMap: Record<string, string>;
}> {
  const doel = new Pakket(bytes), bron = new Pakket(bronBytes), dp = stijlPad(doel), bp = stijlPad(bron);
  const bx = bron.lees(bp), br = leesXml(bx), dx = doel.lees(dp), dr = leesXml(dx);
  const bestaande = leesStijlen(dx), bronLijst = leesStijlen(bx), select = new Set(gekozen ?? bronLijst.map((s) => s.styleId));
  if (!select.size) return { bytes, ids: [], stijlMap: {}, nummerMap: {} };
  if ([...select].some((id) => !bronLijst.some((s) => s.styleId === id))) throw new StijlFout("The selected style no longer exists");
  const bronDoc = openDocument(bron), doelDoc = openDocument(doel), numBron = onderdeelVan(bron, bronDoc.pad, R + "numbering");
  // A numbering definition can refer back to a numbering/paragraph style.
  if (numBron) for (const el of alle(leesXml(bron.lees(numBron)))) {
    if (verwijzingen.has(el.lokaal) && namespaceVan(el, el.voorvoegsel) === W) {
      const id = attr(el, "val"); if (id && bronLijst.some((s) => s.styleId === id)) select.add(id);
    }
  }
  for (let ronde = 0; ronde < bronLijst.length; ronde++) for (const s of bronLijst) if (select.has(s.styleId)) {
    const el = kinderen(br, "style").find(
          (x) => attr(x, "styleId") === s.styleId)!;
    for (const k of alle(el)) if (verwijzingen.has(k.lokaal)) { const id = attr(k, "val"); if (id && bronLijst.some((x) => x.styleId === id)) select.add(id); }
  }
  const namen = new Set(bestaande.map((s) => s.naam.toLowerCase())), ids = new Set(bestaande.map((s) => s.styleId));
  const map = new Map<string, string>(), namenMap = new Map<string, string>();
  for (const s of bronLijst.filter((s) => select.has(s.styleId))) {
    const gelijk = bestaande.find((x) => x.styleId === s.styleId);
    let id = s.styleId, naam = s.naam, n = 1;
    if (!(overschrijven && gelijk?.soort === s.soort)) {
      while (ids.has(id)) id = `${s.styleId}_import${n++}`;
      n = 1; while (namen.has(naam.toLowerCase())) naam = `${s.naam} (${n++})`;
    }
    ids.add(id); namen.add(naam.toLowerCase()); map.set(s.styleId, id); namenMap.set(s.styleId, naam);
  }
  const numMaps = new Map<string, Map<string, string>>();
  if (numBron) {
    let nd = onderdeelVan(doel, doelDoc.pad, R + "numbering");
    if (!nd) nd = nieuwOnderdeel(doel, doelDoc.pad, "word/numbering#.xml", NUM_TYPE, R + "numbering", `<w:numbering xmlns:w="${W}"/>`).pad;
    const nx = bron.lees(numBron), nr = leesXml(nx), oud = leesXml(doel.lees(nd));
    for (const [element, attribuut] of [["num", "numId"], ["abstractNum", "abstractNumId"], ["numPicBullet", "numPicBulletId"]]) {
      let max = kinderen(oud, element).reduce((m, e) => Math.max(m, Number(attr(e, attribuut)) || 0), 0);
      numMaps.set(attribuut, new Map(kinderen(nr, element).map((el) => [attr(el, attribuut)!, String(++max)])));
    }
    const ridMap = kopieerRelaties(bron, doel, numBron, nd);
    const chunks = elementen(nr).map((el) => herschrijf(fragment(nx, el, nr), map, numMaps, ridMap));
    const samengevoegd = voegToe(doel.lees(nd), chunks.join("")), wortel = leesXml(samengevoegd);
    const volgorde = ["numPicBullet", "abstractNum", "num", "numIdMacAtCleanup"];
    const inhoud = elementen(wortel).sort((a, b) => volgorde.indexOf(a.lokaal) - volgorde.indexOf(b.lokaal)).map((el) => samengevoegd.slice(el.start, el.eind)).join("");
    doel.schrijf(nd, vervang(samengevoegd, [{ start: wortel.inhoudStart, eind: wortel.inhoudEind, tekst: inhoud }]));
  }
  const thema = (await parseDocx(bronBytes, { preloadFonts: false })).package.theme;
  const weg = kinderen(dr, "style").filter((s) => [...map.values()].includes(attr(s, "styleId") ?? ""));
  let uit = vervang(dx, weg.map((s) => ({ start: s.start, eind: s.eind, tekst: "" })));
  for (const s of kinderen(br, "style")) {
    const id = attr(s, "styleId")!; if (!map.has(id)) continue;
    const oud = kinderen(dr, "style").find(
      (x) => attr(x, "styleId") === map.get(id),
    );
    let tekst = explicietThema(herschrijf(fragment(bx, s, br), map, numMaps), thema);
    tekst = bewerkAttributen(tekst, (el, a) => {
      if (el.lokaal === "style") {
        zetAttr(el, a, "default", null);
        zetAttr(
          el,
          a,
          "customStyle",
          !oud || ["1", "true", "on"].includes(attr(oud, "customStyle") ?? "")
            ? "1"
            : null,
        );
      }
      if (el.lokaal === "name") zetAttr(el, a, "val", namenMap.get(id)!);
    });
    // Replacing the destination's default style must retain its default flag.
    if (oud && ["1", "true", "on"].includes(attr(oud, "default") ?? "")) tekst = bewerkAttributen(tekst, (el, a) => { if (el.lokaal === "style") zetAttr(el, a, "default", "1"); });
    uit = voegToe(uit, tekst);
  }
  doel.schrijf(dp, uit);
  return { bytes: doel.inpakken(), ids: [...map.values()], stijlMap: Object.fromEntries(map), nummerMap: Object.fromEntries(numMaps.get("numId") ?? []) };
}

function herschrijf(xml: string, stijlen: Map<string, string>, nummering: Map<string, Map<string, string>>, rels = new Map<string, string>()) {
  return bewerkAttributen(xml, (el, a) => {
    for (const [naam, waarde] of Object.entries(a)) {
      const [prefix, lokaal] = naam.split(":");
      if (["id", "embed", "link"].includes(lokaal) && namespaceVan(el, prefix) === R.slice(0, -1) && rels.has(waarde)) a[naam] = rels.get(waarde)!;
    }
    if (namespaceVan(el, el.voorvoegsel) !== W) return;
    if (el.lokaal === "style" && stijlen.has(attr(el, "styleId")!)) zetAttr(el, a, "styleId", stijlen.get(attr(el, "styleId")!)!);
    if (verwijzingen.has(el.lokaal) && stijlen.has(attr(el, "val")!)) zetAttr(el, a, "val", stijlen.get(attr(el, "val")!)!);
    for (const [naam, map] of nummering) {
      const attribuut =
          (el.lokaal === "num" && naam === "numId") ||
          (el.lokaal === "abstractNum" && naam === "abstractNumId") ||
          (el.lokaal === "numPicBullet" && naam === "numPicBulletId")
            ? naam
        : el.lokaal === naam ||
                (naam === "numPicBulletId" && el.lokaal === "lvlPicBulletId")
              ? "val" : null;
      if (attribuut && map.has(attr(el, attribuut)!)) zetAttr(el, a, attribuut, map.get(attr(el, attribuut)!)!);
    }
  }, true);
}

function kopieerRelaties(bron: Pakket, doel: Pakket, van: string, naar: string) {
  const kopieen = new Map<string, string>();
  const types = leesXml(bron.lees("[Content_Types].xml"));
  function kopie(pad: string): string {
    if (kopieen.has(pad)) return kopieen.get(pad)!;
    const data = bron.bytes(pad); if (!data) throw new StijlFout(`Missing style dependency: ${pad}`);
    const nieuw = doel.vrijPad(`word/style-import#/` + pad); kopieen.set(pad, nieuw); doel.schrijf(nieuw, data);
    const ext = pad.split(".").pop()!;
    const type = attr(kinderen(types, "Override").find(
        (e) => attr(e, "PartName") === "/" + pad) ?? kinderen(types, "Default").find((e) => attr(e, "Extension") === ext), "ContentType");
    if (type) doel.voegOverrideToe(nieuw, type);
    const relaties = bron.relaties(pad);
    if (relaties.length) doel.schrijf(Pakket.relsPad(nieuw), `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relaties.map((r) => `<Relationship${attrTekst({ Id: r.id, Type: r.type, Target: r.extern ? r.target : Pakket.relatief(nieuw, kopie(Pakket.doelPad(pad, r.target))), ...(r.extern ? { TargetMode: "External" } : {}) })}/>`).join("")}</Relationships>`);
    return nieuw;
  }
  const map = new Map<string, string>();
  for (const rel of bron.relaties(van)) {
    const id = doel.voegRelatieToe(naar, rel.type, rel.extern ? "placeholder" : kopie(Pakket.doelPad(van, rel.target)));
    if (rel.extern) {
      const rp = Pakket.relsPad(naar), xml = doel.lees(rp), el = kinderen(leesXml(xml), "Relationship").find(
          (e) => attr(e, "Id") === id)!;
      doel.schrijf(rp, vervang(xml, [{ start: el.start, eind: el.eind, tekst: `<Relationship${attrTekst({ Id: id, Type: rel.type, Target: rel.target, TargetMode: "External" })}/>` }]));
    }
    map.set(rel.id, id);
  }
  return map;
}
