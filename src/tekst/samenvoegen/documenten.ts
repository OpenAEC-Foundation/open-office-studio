import { Pakket } from "../../grafieken/pakket";
import { attr, attrTekst, elementen, kind, leesXml, ontsnap, tekstVan, vervang, zoekAlle, type Vervanging, type XmlElement } from "../../grafieken/xml";
import { openDocument, NS_W } from "../pagina/ooxml";
import { voegRecordSamen } from "./pakket";
import { SamenvoegFout, type Gegevens } from "./gegevens";

export interface SamenvoegIndeling { soort: "letters" | "labels" | "envelopes"; kolommen: number; rijen: number; breedte: number; hoogte: number; links: number; boven: number; tussen: number }
export const STANDAARD_INDELING: SamenvoegIndeling = { soort: "letters", kolommen: 3, rijen: 7, breedte: 63.5, hoogte: 38.1, links: 7.25, boven: 15.15, tussen: 2.5 };
const twips = (mm: number) => Math.round(mm * 1440 / 25.4);
const xmlVan = (xml: string, e: XmlElement) => xml.slice(e.start, e.eind);
const key = (e: XmlElement, local: string) => Object.keys(e.attrs).find(k => k === local || k.endsWith(`:${local}`));
function append(xml: string, text: string) { const root = leesXml(xml); return root.leeg ? xml.slice(0, root.start) + `<${root.naam}${attrTekst(root.attrs)}>${text}</${root.naam}>` + xml.slice(root.eind) : xml.slice(0, root.inhoudEind) + text + xml.slice(root.inhoudEind); }
function metSlot(body: string, sect: string) {
  const root = leesXml(`<w:body xmlns:w="${NS_W}">${body}</w:body>`), last = elementen(root).at(-1);
  if (last?.lokaal === "p" && !kind(kind(last, "pPr"), "sectPr")) {
    const pp = kind(last, "pPr");
    const start = root.inhoudStart;
    if (pp && !pp.leeg) return body.slice(0, pp.inhoudEind - start) + sect + body.slice(pp.inhoudEind - start);
    if (pp) return body.slice(0, pp.start - start) + `<w:pPr>${sect}</w:pPr>` + body.slice(pp.eind - start);
    return body.slice(0, last.inhoudStart - start) + `<w:pPr>${sect}</w:pPr>` + body.slice(last.inhoudStart - start);
  }
  return body + `<w:p><w:pPr>${sect}</w:pPr></w:p>`;
}
function volgendePagina(sect: string) {
  const root = leesXml(sect), type = kind(root, "type");
  if (root.leeg) return `<${root.naam}${attrTekst(root.attrs)}><w:type w:val="nextPage"/></${root.naam}>`;
  if (type) return vervang(sect, [{ start: type.start, eind: type.eind, tekst: '<w:type w:val="nextPage"/>' }]);
  return sect.slice(0, root.inhoudStart) + '<w:type w:val="nextPage"/>' + sect.slice(root.inhoudStart);
}
function celInhoud(body: string) {
  const root = leesXml(`<w:body xmlns:w="${NS_W}">${body}</w:body>`);
  return elementen(root).at(-1)?.lokaal === "p" ? body : body + "<w:p/>";
}
function schemaSectie(indeling: SamenvoegIndeling) {
  if (indeling.soort === "envelopes") return `<w:sectPr><w:type w:val="nextPage"/><w:pgSz w:w="${twips(220)}" w:h="${twips(110)}" w:orient="landscape"/><w:pgMar w:top="${twips(40)}" w:left="${twips(100)}" w:right="${twips(10)}" w:bottom="${twips(10)}"/></w:sectPr>`;
  return `<w:sectPr><w:pgSz w:w="${twips(210)}" w:h="${twips(297)}"/><w:pgMar w:top="${twips(indeling.boven)}" w:left="${twips(indeling.links)}" w:right="${twips(indeling.links)}" w:bottom="0"/></w:sectPr>`;
}

/** Combine copies of one template, keeping shared media and record-specific headers/notes. */
export function maakSamenvoegDocument(template: Uint8Array, data: Gegevens, records: number[], indeling: SamenvoegIndeling = STANDAARD_INDELING): Uint8Array {
  if (!records.length || records.length > 1000) throw new SamenvoegFout("records");
  if (indeling.soort === "labels" && (![indeling.kolommen, indeling.rijen].every(n => Number.isInteger(n) && n > 0 && n <= 20) || ![indeling.breedte, indeling.hoogte, indeling.links, indeling.boven, indeling.tussen].every(n => Number.isFinite(n) && n >= 0) || indeling.breedte < 10 || indeling.hoogte < 10 || indeling.kolommen * indeling.breedte + (indeling.kolommen - 1) * indeling.tussen + 2 * indeling.links > 210.1 || indeling.rijen * indeling.hoogte + indeling.boven > 295)) throw new SamenvoegFout("template");
  const master = new Pakket(voegRecordSamen(template, data, records[0])), doc = openDocument(master);
  if (records.length > 1 && master.namen().some(n => /comments(?:Extended|Extensible|Ids)|people\.xml/i.test(n))) throw new SamenvoegFout("template");
  const used = new Set<number>();
  function collect(e: XmlElement) {
    const value = attr(e, "id"); if (value !== undefined && /^\d+$/.test(value)) used.add(Number(value));
    const para = attr(e, "paraId"); if (para && /^[\da-f]{8}$/i.test(para)) used.add(parseInt(para, 16));
    for (const child of elementen(e)) collect(child);
  }
  for (const name of master.namen().filter(n => /^word\/.*\.xml$/.test(n))) collect(leesXml(master.lees(name)));
  const numberingPath = master.relaties(doc.pad).find(r => /\/numbering$/.test(r.type));
  const numbering = numberingPath ? Pakket.doelPad(doc.pad, numberingPath.target) : null;
  const numberingXml = numbering ? master.lees(numbering) : "", numberingRoot = numberingXml ? leesXml(numberingXml) : null;
  const numberingNodes = numberingRoot ? elementen(numberingRoot) : [];
  const styleRel = master.relaties(doc.pad).find(r => /\/styles$/.test(r.type));
  const styles = styleRel ? zoekAlle(leesXml(master.lees(Pakket.doelPad(doc.pad, styleRel.target))), "style") : [];
  const styleNum = (name: string, seen = new Set<string>()): XmlElement | undefined => {
    if (seen.has(name)) return; seen.add(name);
    const st = styles.find(s => attr(s, "styleId") === name); if (!st) return;
    return kind(kind(st, "pPr"), "numPr") ?? styleNum(attr(kind(st, "basedOn")!, "val") ?? "", seen);
  };
  const numIds = numberingNodes.filter(e => e.lokaal === "num").map(e => Number(attr(e, "numId")));
  const abstractIds = numberingNodes.filter(e => e.lokaal === "abstractNum").map(e => Number(attr(e, "abstractNumId")));
  let nextNum = Math.max(0, ...numIds) + 1, nextAbstract = Math.max(0, ...abstractIds) + 1;
  const newNums: string[] = [], newAbstracts: string[] = [];
  let next = 1;
  const bodies: string[] = [], sections: string[] = [];
  for (const [ordinal, record] of records.entries()) {
    const p = ordinal === 0 ? master : new Pakket(voegRecordSamen(template, data, record)), d = openDocument(p);
    const ids = new Map<string, number>(), names = new Map<string, string>(), relations = new Map<string, string>();
    const numbers = new Map<number, number>(), abstracts = new Map<number, number>();
    if (ordinal && numberingRoot) {
      for (const n of abstractIds) abstracts.set(n, nextAbstract++);
      for (const n of numIds) numbers.set(n, nextNum++);
      for (const node of numberingNodes) {
        const changes: Vervanging[] = [];
        for (const e of [node, ...zoekAlle(node, "abstractNumId")]) {
          const attrs = { ...e.attrs };
          if (e.lokaal === "abstractNum") attrs[key(e, "abstractNumId")!] = String(abstracts.get(Number(attr(e, "abstractNumId"))));
          else if (e.lokaal === "abstractNumId") attrs[key(e, "val")!] = String(abstracts.get(Number(attr(e, "val"))));
          else if (e.lokaal === "num") attrs[key(e, "numId")!] = String(numbers.get(Number(attr(e, "numId"))));
          else continue;
          changes.push({ start: e.start - node.start, eind: e.inhoudStart - node.start, tekst: `<${e.naam}${attrTekst(attrs)}${e.leeg ? "/>" : ">"}` });
        }
        if (node.lokaal === "abstractNum") newAbstracts.push(vervang(xmlVan(numberingXml, node), changes));
        else if (node.lokaal === "num") newNums.push(vervang(xmlVan(numberingXml, node), changes));
      }
    }
    const id = (type: string, old: string) => { const k = `${type}:${old}`; if (!ids.has(k)) { while (used.has(next)) next++; if (next > 0x7fffffff) throw new SamenvoegFout("template"); ids.set(k, next); used.add(next++); } return ids.get(k)!; };
    for (const name of p.namen().filter(n => /^word\/.*\.xml$/.test(n))) for (const b of zoekAlle(leesXml(p.lees(name)), "bookmarkStart")) {
      const old = attr(b, "name"); if (old) names.set(old, ordinal ? `_M${ordinal}_${old.replace(/^_/, "").slice(0, 23)}_${id("name", old)}` : old);
    }
    const firstSeq = new Set<string>();
    const instruction = (code: string, resetSequence = false) => {
      const m = /^(\s*(?:REF|PAGEREF|NOTEREF)\s+)("[^"]*"|[^\s]+)([\s\S]*)$/i.exec(code);
      if (m) return m[1] + (names.get(m[2].replace(/^"|"$/g, "")) ?? m[2]) + m[3];
      const seq = /^\s*SEQ\s+("[^"]*"|[^\s]+)/i.exec(code);
      const sequenceName = seq?.[1].replace(/^"|"$/g, "").toLowerCase();
      if (resetSequence && ordinal && sequenceName && !firstSeq.has(sequenceName)) { firstSeq.add(sequenceName); if (!/\\r\s+\d+/.test(code)) return code + " \\r 1"; }
      return code;
    };
    const transform = (xml: string, scope: string, main = false) => {
      const root = leesXml(xml), changes: Vervanging[] = [];
      // Complete split instructions during the same document-order walk as
      // simple fields, so the first SEQ is independent of its OOXML form.
      const stack: { nodes: XmlElement[]; code: boolean }[] = [];
      const finish = () => {
        const frame = stack.at(-1); if (!frame?.code) return;
        frame.code = false;
        const old = frame.nodes.map(tekstVan).join(""), value = instruction(old, main);
        if (value !== old) frame.nodes.forEach((n, i) => changes.push({ start: n.inhoudStart, eind: n.inhoudEind, tekst: i ? "" : ontsnap(value) }));
      };
      const visit = (e: XmlElement) => {
        if (e.lokaal === "fldChar") {
          const type = attr(e, "fldCharType");
          if (type === "begin") stack.push({ nodes: [], code: true });
          else if (type === "separate") finish();
          else if (type === "end") { finish(); stack.pop(); }
        } else if (e.lokaal === "instrText" && stack.at(-1)?.code) stack.at(-1)!.nodes.push(e);
        const attrs = { ...e.attrs };
        const set = (name: string, value: string | number) => { const k = key(e, name); if (k) attrs[k] = String(value); };
        const old = attr(e, "id");
        if (ordinal && old !== undefined && Number(old) >= 0) {
          if (["bookmarkStart", "bookmarkEnd"].includes(e.lokaal)) set("id", id(`bookmark/${scope}`, old));
          else if (/^(?:footnote|endnote)(?:Reference)?$/.test(e.lokaal)) set("id", id(e.lokaal.startsWith("footnote") ? "footnote" : "endnote", old));
          else if (/^comment(?:RangeStart|RangeEnd|Reference)?$/.test(e.lokaal)) set("id", id("comment", old));
          else if (e.lokaal === "docPr") set("id", id(`drawing/${scope}`, old));
        }
        if (e.lokaal === "bookmarkStart") { const name = attr(e, "name"); if (name && names.has(name)) set("name", names.get(name)!); }
        if (e.lokaal === "hyperlink") { const name = attr(e, "anchor"); if (name && names.has(name)) set("anchor", names.get(name)!); }
        if (["headerReference", "footerReference"].includes(e.lokaal) && old && relations.has(old)) set("id", relations.get(old)!);
        if (ordinal && attr(e, "paraId")) set("paraId", id("para", attr(e, "paraId")!).toString(16).padStart(8, "0"));
        if (ordinal && e.lokaal === "numId" && numbers.has(Number(attr(e, "val")))) set("val", numbers.get(Number(attr(e, "val")))!);
        if (ordinal && e.lokaal === "p" && numbers.size) {
          const pp = kind(e, "pPr"), direct = kind(pp, "numPr"), style = attr(kind(pp, "pStyle")!, "val");
          const inherited = !direct && style ? styleNum(style) : undefined;
          const num = inherited ? Number(attr(kind(inherited, "numId")!, "val")) : NaN;
          if (inherited && numbers.has(num)) {
            const inheritedXml = `<w:numPr><w:ilvl w:val="${attr(kind(inherited, "ilvl")!, "val") ?? 0}"/><w:numId w:val="${numbers.get(num)}"/></w:numPr>`;
            if (pp && !pp.leeg) changes.push({ start: pp.inhoudEind, eind: pp.inhoudEind, tekst: inheritedXml });
          }
        }
        if (e.lokaal === "fldSimple") {
          set("instr", instruction(attr(e, "instr") ?? "", main));
        }
        if (Object.entries(attrs).some(([k, v]) => e.attrs[k] !== v)) changes.push({ start: e.start, eind: e.inhoudStart, tekst: `<${e.naam}${attrTekst(attrs)}${e.leeg ? "/>" : ">"}` });
        for (const child of elementen(e)) visit(child);
      };
      visit(root); return vervang(xml, changes);
    };
    if (ordinal) for (const rel of p.relaties(d.pad)) {
      if (rel.extern) continue;
      const source = Pakket.doelPad(d.pad, rel.target);
      if (/\/(?:header|footer)$/.test(rel.type)) {
        const target = master.vrijPad(`${source.slice(0, source.lastIndexOf("/") + 1)}merge-${ordinal}-#.xml`);
        master.schrijf(target, transform(p.lees(source), source));
        const rels = Pakket.relsPad(source); if (p.heeft(rels)) master.schrijf(Pakket.relsPad(target), p.lees(rels));
        master.voegOverrideToe(target, rel.type.endsWith("header") ? "application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml" : "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml");
        relations.set(rel.id, master.voegRelatieToe(d.pad, rel.type, target));
      } else if (/\/(?:footnotes|endnotes|comments)$/.test(rel.type)) {
        const sourceXml = p.lees(source), root = leesXml(sourceXml);
        const items = elementen(root).filter(e => e.lokaal === "comment" || Number(attr(e, "id")) > 0).map(e => xmlVan(sourceXml, e)).join("");
        const wrapped = `<${root.naam}${attrTekst(root.attrs)}>${items}</${root.naam}>`, changed = transform(wrapped, source), tree = leesXml(changed);
        master.schrijf(source, append(master.lees(source), changed.slice(tree.inhoudStart, tree.inhoudEind)));
      }
    }
    const full = transform(d.xml, d.pad, true), tree = leesXml(full), body = kind(tree, "body")!, sect = elementen(body).find(e => e.lokaal === "sectPr");
    let content = full.slice(body.inhoudStart, sect?.start ?? body.inhoudEind);
    if (indeling.soort !== "letters") {
      const wrap = leesXml(`<w:body xmlns:w="${NS_W}">${content}</w:body>`), off = wrap.inhoudStart;
      const remove = zoekAlle(wrap, "sectPr").map(e => ({ start: e.start - off, eind: e.eind - off, tekst: "" }));
      content = vervang(content, remove);
    }
    bodies.push(content); sections.push(indeling.soort === "letters" ? sect ? xmlVan(full, sect) : "<w:sectPr/>" : schemaSectie(indeling));
  }
  let body: string;
  if (indeling.soort === "labels") {
    const perPage = indeling.kolommen * indeling.rijen, pages: string[] = [];
    for (let page = 0; page < bodies.length; page += perPage) {
      const grid = Array.from({ length: indeling.kolommen * 2 - 1 }, (_, c) => `<w:gridCol w:w="${twips(c % 2 ? indeling.tussen : indeling.breedte)}"/>`).join("");
      const rows = Array.from({ length: indeling.rijen }, (_, r) => '<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="' + twips(indeling.hoogte) + '" w:hRule="exact"/></w:trPr>' + Array.from({ length: indeling.kolommen * 2 - 1 }, (_, c) => `<w:tc><w:tcPr><w:tcW w:w="${twips(c % 2 ? indeling.tussen : indeling.breedte)}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${c % 2 ? "<w:p/>" : celInhoud(bodies[page + r * indeling.kolommen + c / 2] ?? "<w:p/>")}</w:tc>`).join("") + '</w:tr>').join("");
      pages.push(`<w:tbl><w:tblPr><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="${twips(1.5)}" w:type="dxa"/><w:left w:w="${twips(1.5)}" w:type="dxa"/><w:bottom w:w="${twips(1.5)}" w:type="dxa"/><w:right w:w="${twips(1.5)}" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rows}</w:tbl>`);
    }
    body = pages.join('<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr><w:r><w:br w:type="page"/></w:r></w:p>') + '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr></w:p>' + sections.at(-1)!;
  } else body = bodies.map((b, i) => i === bodies.length - 1 ? b + sections[i] : metSlot(b, volgendePagina(sections[i]))).join("");
  let xml = doc.xml.slice(0, doc.body.inhoudStart) + body + doc.xml.slice(doc.body.inhoudEind);
  if (!doc.wortel.attrs["xmlns:w"]) xml = xml.replace(`<${doc.wortel.naam}`, `<${doc.wortel.naam} xmlns:w="${NS_W}"`);
  if (numbering && numberingRoot && newNums.length) {
    const beforeNums = numberingNodes.find(e => e.lokaal === "num")?.start ?? numberingRoot.inhoudEind;
    master.schrijf(numbering, vervang(numberingXml, [{ start: beforeNums, eind: beforeNums, tekst: newAbstracts.join("") }, { start: numberingRoot.inhoudEind, eind: numberingRoot.inhoudEind, tekst: newNums.join("") }]));
  }
  master.schrijf(doc.pad, xml); return master.inpakken();
}
