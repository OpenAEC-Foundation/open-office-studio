/**
 * Tabel splitsen via de pakketroute: de engine kent geen splitsbewerking, dus
 * we bewerken word/document.xml (zoals src/grafieken/**) en laden het document
 * opnieuw. Alleen het gesplitste stuk XML verandert; de rest blijft
 * byte-gelijk. Herladen wist de ongedaan-maakgeschiedenis.
 */
import i18next from "../../i18n/config";
import { Pakket, REL } from "../../grafieken/pakket.ts";
import { elementen, leesXml, vervang, type XmlElement } from "../../grafieken/xml.ts";

/** Tabellen van de hoofdtekst in documentvolgorde, zonder geneste tabellen. */
export function hoofdtabellen(body: XmlElement): XmlElement[] {
  const uit: XmlElement[] = [];
  const loop = (el: XmlElement) => {
    for (const kind of elementen(el)) {
      if (kind.lokaal === "tbl") uit.push(kind);
      else if (kind.lokaal === "sdt" || kind.lokaal === "sdtContent" || kind.lokaal === "customXml") loop(kind);
    }
  };
  loop(body);
  return uit;
}

/**
 * Splitst tabel `tabelIndex` (volgorde in de hoofdtekst) vóór rij `rij`
 * (0-gebaseerd, minstens 1). Een lege alinea scheidt de twee tabellen; de
 * tweede tabel krijgt dezelfde tblPr en tblGrid. Kopregels (w:tblHeader)
 * blijven alleen in de eerste tabel, zoals in Word.
 */
export function splitsTabelXml(xml: string, tabelIndex: number, rij: number): string {
  const wortel = leesXml(xml);
  const body = elementen(wortel).find((e) => e.lokaal === "body");
  if (!body) throw new Error(i18next.t("writer:table.errors.noBody"));
  const tabel = hoofdtabellen(body)[tabelIndex];
  if (!tabel) throw new Error(i18next.t("writer:table.errors.tableNotFound"));
  const rijen = elementen(tabel).filter((e) => e.lokaal === "tr");
  if (rij < 1 || rij >= rijen.length) throw new Error(i18next.t("writer:table.errors.splitRow"));
  const vervolg = (xml.slice(rijen[rij].start, rijen[rij].eind).match(/<[\w]*:?vMerge\b[^>]*>/g) ?? []).some(
    (tag) => !/val="restart"/.test(tag),
  );
  if (vervolg) throw new Error(i18next.t("writer:table.errors.splitMerged"));
  const v = tabel.voorvoegsel ? `${tabel.voorvoegsel}:` : "";
  const kop = elementen(tabel)
    .filter((e) => e.lokaal === "tblPr" || e.lokaal === "tblGrid")
    .map((e) => xml.slice(e.start, e.eind))
    .join("");
  // In de tweede tabel herhalen de eerste rijen niet als kop.
  const tweedeRijen = xml
    .slice(rijen[rij].start, rijen[rijen.length - 1].eind)
    .replace(new RegExp(`<${v}tblHeader(?:\\s[^>]*)?/>`, "g"), "");
  const scheiding = `</${tabel.naam}><${v}p/><${tabel.naam}>${kop}`;
  return vervang(xml, [
    { start: rijen[rij - 1].eind, eind: rijen[rij].start, tekst: "" },
    { start: rijen[rij].start, eind: rijen[rijen.length - 1].eind, tekst: scheiding + tweedeRijen },
  ]);
}

/** Pad van het hoofddocument volgens _rels/.rels. */
export function hoofddocument(pakket: Pakket) {
  const rel = pakket.relaties("").find((r) => r.type === REL.officeDocument);
  return rel ? Pakket.doelPad("", rel.target) : "word/document.xml";
}

export function splitsTabel(bytes: Uint8Array, tabelIndex: number, rij: number) {
  const pakket = new Pakket(bytes);
  const pad = hoofddocument(pakket);
  pakket.schrijf(pad, splitsTabelXml(pakket.lees(pad), tabelIndex, rij));
  return pakket.inpakken();
}

/** Voor tests: aantal rijen per hoofdtabel. */
export function rijenPerTabel(xml: string) {
  const body = elementen(leesXml(xml)).find((e) => e.lokaal === "body");
  return body ? hoofdtabellen(body).map((t) => elementen(t).filter((e) => e.lokaal === "tr").length) : [];
}
