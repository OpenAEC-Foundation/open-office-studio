import { Pakket, metPakket, openDocument, WREL } from "../pagina/ooxml";
import { attrNs, attrTekst, kind, leesXml, namespaceVan, ontsnap, tekstVan, vervang, zoekAlle, type XmlElement, type Vervanging } from "../../grafieken/xml";
import { SamenvoegFout, waardeVan, type Gegevens } from "./gegevens";

interface Veld { naam: string; start: number; eind: number; voor: string; na: string; opmaak: string }
const NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const zoekW = (root: XmlElement, naam: string) => zoekAlle(root, naam).filter(e => namespaceVan(e, e.voorvoegsel) === NS_W);
function veldNaam(instructie: string): string | null {
  if (!/^\s*MERGEFIELD\b/i.test(instructie)) return null;
  const m = /^\s*MERGEFIELD\s+(?:"([^"\r\n]+)"|([^\s\\"]+))\s*(?:\\\*\s+MERGEFORMAT\s*)?$/i.exec(instructie);
  if (!m) throw new SamenvoegFout("template");
  return m[1] ?? m[2];
}
const xmlVan = (xml: string, e: XmlElement) => xml.slice(e.start, e.eind);
function run(el: XmlElement): XmlElement {
  let p: XmlElement | null = el;
  while (p && p.lokaal !== "r") p = p.ouder;
  if (!p || p.voorvoegsel !== "w") throw new SamenvoegFout("template");
  return p;
}
function rPr(xml: string, r: XmlElement) { const p = kind(r, "rPr"); return p ? xmlVan(xml, p) : ""; }

/** Ondersteunt normale eenvoudige en gesplitste complexe MERGEFIELD-velden. */
function velden(xml: string): Veld[] {
  const root = leesXml(xml), uit: Veld[] = [];
  for (const el of zoekW(root, "fldSimple")) {
    const naam = veldNaam(attrNs(el, NS_W, "instr") ?? "");
    if (!naam) continue;
    const eerste = zoekW(el, "r")[0];
    uit.push({ naam, start: el.start, eind: el.eind, voor: "", na: "", opmaak: eerste ? rPr(xml, eerste) : "" });
  }
  const stack: { begin: XmlElement; scheiding?: XmlElement; genest: boolean }[] = [];
  for (const el of zoekW(root, "fldChar")) {
    switch (attrNs(el, NS_W, "fldCharType")) {
      case "begin": {
        if (stack.length) stack[stack.length - 1].genest = true;
        stack.push({ begin: el, genest: false }); break;
      }
      case "separate": if (stack.length) stack[stack.length - 1].scheiding = el; break;
      case "end": {
        const veld = stack.pop();
        if (!veld) continue;
        const codeEind = veld.scheiding?.start ?? el.start;
        const code = zoekW(root, "instrText").filter(n => n.start > veld.begin.start && n.eind <= codeEind).map(tekstVan).join("");
        const naam = veldNaam(code);
        if (!naam) continue;
        if (stack.length || veld.genest) throw new SamenvoegFout("template");
        const a = run(veld.begin), b = run(el);
        if (a.ouder !== b.ouder) throw new SamenvoegFout("template");
        const resultaat = zoekW(root, "r").find(r => r.start >= (veld.scheiding?.eind ?? el.start) && r.eind <= b.start);
        uit.push({ naam, start: a.start, eind: b.eind,
          voor: xml.slice(a.start, veld.begin.start) + "</w:r>",
          na: `<w:r${attrTekst(b.attrs)}>${rPr(xml, b)}` + xml.slice(el.eind, b.eind),
          opmaak: resultaat ? rPr(xml, resultaat) : rPr(xml, a) });
        break;
      }
    }
  }
  for (const open of stack) {
    const code = zoekW(root, "instrText").filter(n => n.start > open.begin.start).map(tekstVan).join("");
    if (/^\s*MERGEFIELD\b/i.test(code)) throw new SamenvoegFout("template");
  }
  uit.sort((a, b) => a.start - b.start);
  if (uit.some((v, i) => i > 0 && v.start < uit[i - 1].eind)) throw new SamenvoegFout("template");
  for (const naam of ["bookmarkStart", "bookmarkEnd", "commentRangeStart", "commentRangeEnd"]) {
    if (zoekW(root, naam).some(n => uit.some(v => n.start >= v.start && n.eind <= v.eind))) throw new SamenvoegFout("template");
  }
  return uit;
}
function onderdelen(p: Pakket) {
  const doc = openDocument(p), namen = new Set([doc.pad]);
  for (const rel of p.relaties(doc.pad)) {
    if (!rel.extern && [WREL.header, WREL.footer, WREL.footnotes, WREL.endnotes].includes(rel.type)) namen.add(Pakket.doelPad(doc.pad, rel.target));
  }
  return [...namen];
}
export function samenvoegVelden(bytes: Uint8Array): string[] {
  return metPakket(bytes, p => [...new Set(onderdelen(p).flatMap(pad => velden(p.lees(pad)).map(v => v.naam)))]);
}
function tekstRuns(tekst: string, opmaak: string): string {
  return `<w:r>${opmaak}` + tekst.split(/(\r\n|\r|\n|\t)/).map(s => s === "\t" ? "<w:tab/>" : /^(?:\r\n|\r|\n)$/.test(s) ? "<w:br/>" : `<w:t xml:space="preserve">${ontsnap(s)}</w:t>`).join("") + "</w:r>";
}

/** Nieuwe, bevroren recordkopie; de bronsjabloon en de gegevensbron blijven onaangeraakt. */
export function voegRecordSamen(bytes: Uint8Array, gegevens: Gegevens, record: number): Uint8Array {
  return metPakket(bytes, p => {
    const plannen = onderdelen(p).map(pad => {
      const xml = p.lees(pad), mutaties: Vervanging[] = velden(xml).map(v => ({
        start: v.start, eind: v.eind,
        tekst: v.voor + tekstRuns(waardeVan(gegevens, record, v.naam), v.opmaak) + v.na,
      }));
      return { pad, xml, mutaties };
    });
    if (!plannen.some(plan => plan.mutaties.length)) throw new SamenvoegFout("template");
    // Eerst alle velden/kolommen valideren, daarna pas in de kopie schrijven.
    for (const plan of plannen) if (plan.mutaties.length) p.schrijf(plan.pad, vervang(plan.xml, plan.mutaties));
    return p.inpakken();
  });
}
