/**
 * Eigen PDF-schrijver (PDF 1.7), zonder conversieprogramma en zonder DOM.
 *
 * Keuze (#37): elke pagina is een beeld in hoge resolutie (JPEG of verliesvrij
 * met Flate) met daarover een onzichtbare tekstlaag (tekenmodus 3) in een
 * ingesloten, glyphloos TrueType-lettertype met ToUnicode-tabel. Daardoor:
 *  - ziet de PDF er precies zo uit als het afdrukvoorbeeld (zelfde tekenroutine
 *    als de editor, zelfde paginering);
 *  - is tekst selecteerbaar, doorzoekbaar en kopieerbaar (ook met accenten en
 *    niet-Latijnse tekens, via ToUnicode);
 *  - zijn koppelingen klikbaar (Link-annotaties), staan bladwijzers in de
 *    inhoudsopgave en komen documenteigenschappen in Info en XMP.
 *
 * Vectorpagina's (#18): waar de opname van het paginacanvas zich laat
 * omzetten (`vector.ts`), krijgt de pagina een eigen inhoudsstroom met
 * vectoren, echte tekst in ingesloten, uitgedunde TrueType-lettertypen
 * (CIDFontType2, Identity-H, ToUnicode) en afbeeldingen. Die pagina's delen
 * één bronnenwoordenboek. Anders blijft het beeld met tekstlaag hierboven.
 */
import { zlibSync } from "fflate";
import { GLYPH_BREEDTE, glyphloosLettertype } from "./glyphloos.ts";
import { getal } from "./getal.ts";

export type PdfBeeld =
  | { soort: "jpeg"; breedte: number; hoogte: number; bytes: Uint8Array }
  /** Onbewerkte RGB-pixels (3 bytes per pixel, rij voor rij). */
  | { soort: "rgb"; breedte: number; hoogte: number; bytes: Uint8Array };

export interface PdfTekst {
  tekst: string;
  /** Begin van de basislijn, in punten vanaf linksboven. */
  x: number;
  y: number;
  grootte: number;
  breedte: number;
}

export interface PdfKoppeling {
  x: number;
  y: number;
  breedte: number;
  hoogte: number;
  url: string;
}

export interface PdfPagina {
  breedte: number;
  hoogte: number;
  /** Inhoudsstroom met vectoren (gebruikt `PdfDocument.bronnen`); dan geen beeld of tekstlaag. */
  vector?: string;
  beeld?: PdfBeeld;
  tekst?: PdfTekst[];
  koppelingen?: PdfKoppeling[];
}

export interface PdfBladwijzer {
  titel: string;
  pagina: number;
  y?: number;
}

export interface PdfFont {
  naam: string;
  /** PostScript-naam met deelverzamelingsprefix, zoals ABCDEF+Carlito. */
  basisnaam: string;
  bestand: Uint8Array;
  eenheden: number;
  stijgen: number;
  dalen: number;
  kader: [number, number, number, number];
  cursiefHoek: number;
  hoofdletter: number;
  vast: boolean;
  /** [glyph, breedte in lettertype-eenheden], oplopend. */
  breedtes: [number, number][];
  /** [glyph, tekst] voor ToUnicode. */
  unicode: [number, string][];
}

export interface PdfBeeldStroom {
  breedte: number;
  hoogte: number;
  filter: "DCTDecode" | "FlateDecode";
  kleuren: 1 | 3;
  /** PNG-voorspeller (Predictor 15) in de Flate-gegevens. */
  voorspeller: boolean;
  bytes: Uint8Array;
  masker?: PdfBeeldStroom;
}

export interface PdfVerloop {
  naam: string;
  soort: 2 | 3;
  coords: number[];
  stops: { t: number; kleur: [number, number, number] }[];
}

export interface PdfBronnen {
  fonts: PdfFont[];
  beelden: { naam: string; stroom: PdfBeeldStroom }[];
  toestanden: { naam: string; ca: number; CA: number }[];
  verlopen: PdfVerloop[];
}

export interface PdfDocument {
  titel?: string;
  auteur?: string;
  onderwerp?: string;
  trefwoorden?: string;
  taal?: string;
  maker?: string;
  /** Vaste datum voor reproduceerbare uitvoer (tests). */
  datum?: Date;
  paginas: PdfPagina[];
  bladwijzers?: PdfBladwijzer[];
  /** Gedeelde bronnen van de vectorpagina's. */
  bronnen?: PdfBronnen;
}

const enc = new TextEncoder();

class Uitvoer {
  private delen: Uint8Array[] = [];
  lengte = 0;
  schrijf(d: string | Uint8Array) {
    const b = typeof d === "string" ? latin1(d) : d;
    this.delen.push(b);
    this.lengte += b.length;
  }
  bytes() {
    const uit = new Uint8Array(this.lengte);
    let p = 0;
    for (const d of this.delen) {
      uit.set(d, p);
      p += d.length;
    }
    return uit;
  }
}

function latin1(s: string) {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
  return b;
}

export { getal };

/** Tekststring als UTF-16BE met BOM in hex (voor Info, bladwijzers). */
export function pdfTekst(s: string) {
  let hex = "FEFF";
  for (let i = 0; i < s.length; i++)
    hex += s.charCodeAt(i).toString(16).padStart(4, "0").toUpperCase();
  return `<${hex}>`;
}

/** Letterlijke ASCII-string met escapes (voor URI's). */
function pdfLetterlijk(s: string) {
  return `(${s.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, (c) => encodeURIComponent(c))})`;
}

function pdfDatum(d: Date) {
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

const xmlOntsnap = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Alleen http(s), mailto en tel worden klikbare koppelingen. */
export function veiligeUrl(url: string) {
  return /^(https?:|mailto:|tel:)/i.test(url.trim()) ? url.trim() : null;
}

/**
 * Codeert tekst als 2-byte CID's. Elk uniek teken (codepunt) krijgt een eigen
 * CID; de ToUnicode-tabel zet het terug naar Unicode.
 */
class Tekenset {
  private cids = new Map<string, number>();
  cid(teken: string) {
    let cid = this.cids.get(teken);
    if (cid === undefined) {
      cid = this.cids.size + 1;
      if (cid > 0xfffe) cid = 0xfffe;
      else this.cids.set(teken, cid);
    }
    return cid;
  }
  get aantal() {
    return this.cids.size;
  }
  toUnicode() {
    const regels: string[] = [];
    const lijst = [...this.cids.entries()];
    for (let i = 0; i < lijst.length; i += 100) {
      const blok = lijst.slice(i, i + 100);
      regels.push(`${blok.length} beginbfchar`);
      for (const [teken, cid] of blok) {
        let hex = "";
        for (let j = 0; j < teken.length; j++)
          hex += teken.charCodeAt(j).toString(16).padStart(4, "0");
        regels.push(`<${cid.toString(16).padStart(4, "0")}> <${hex}>`);
      }
      regels.push("endbfchar");
    }
    return `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /OOS-UCS def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
${regels.join("\n")}
endcmap
CMapName currentdict /CMap defineresource pop
end
end`;
  }
}

export function schrijfPdf(doc: PdfDocument): Uint8Array {
  const uit = new Uitvoer();
  const posities: number[] = [];
  let volgnummer = 0;
  const reserveer = () => ++volgnummer;
  const object = (nr: number, inhoud: string | Uint8Array, stroom?: Uint8Array) => {
    posities[nr] = uit.lengte;
    uit.schrijf(`${nr} 0 obj\n`);
    uit.schrijf(inhoud);
    if (stroom) {
      uit.schrijf("\nstream\n");
      uit.schrijf(stroom);
      uit.schrijf("\nendstream");
    }
    uit.schrijf("\nendobj\n");
  };
  uit.schrijf("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n");

  const catalogus = reserveer();
  const paginaBoom = reserveer();
  const info = reserveer();
  const metadata = reserveer();
  // Het glyphloze lettertype alleen als er een onzichtbare tekstlaag is.
  let glyphloos: { lettertype: number; cidFont: number; beschrijving: number; fontBestand: number; toUnicode: number; cidNaarGid: number } | null = null;
  const glyphloosNrs = () =>
    (glyphloos ??= {
      lettertype: reserveer(),
      cidFont: reserveer(),
      beschrijving: reserveer(),
      fontBestand: reserveer(),
      toUnicode: reserveer(),
      cidNaarGid: reserveer(),
    });
  const tekenset = new Tekenset();
  // Bronnen van de vectorpagina's: één woordenboek, alleen als er vectorpagina's zijn.
  const bronnenNr = doc.paginas.some((p) => p.vector) && doc.bronnen ? reserveer() : 0;

  const paginaNummers: number[] = [];
  doc.paginas.forEach((pagina) => {
    const nr = reserveer();
    paginaNummers.push(nr);
    const inhoudNr = reserveer();
    const beeldNr = pagina.beeld && !(pagina.vector !== undefined && bronnenNr) ? reserveer() : 0;
    const B = pagina.breedte;
    const H = pagina.hoogte;
    const vector = pagina.vector !== undefined && bronnenNr ? pagina.vector : null;
    let inhoud = vector ?? "";
    if (pagina.beeld && vector === null) inhoud += `q\n${getal(B)} 0 0 ${getal(H)} 0 0 cm\n/Im0 Do\nQ\n`;
    const stukken = (vector === null ? pagina.tekst ?? [] : []).filter(
      (t) => t.tekst.length > 0 && t.grootte > 0.5 && Number.isFinite(t.x + t.y + t.breedte),
    );
    if (stukken.length) {
      inhoud += "BT\n3 Tr\n";
      for (const t of stukken) {
        const tekens = [...t.tekst];
        let hex = "";
        for (const teken of tekens) hex += tekenset.cid(teken).toString(16).padStart(4, "0");
        const natuurlijk = (tekens.length * GLYPH_BREEDTE * t.grootte) / 1000;
        const schaal = natuurlijk > 0 ? Math.max(1, Math.min(1000, (t.breedte / natuurlijk) * 100)) : 100;
        inhoud += `/F0 ${getal(t.grootte)} Tf ${getal(schaal)} Tz 1 0 0 1 ${getal(t.x)} ${getal(H - t.y)} Tm <${hex}> Tj\n`;
      }
      inhoud += "ET\n";
    }
    const inhoudBytes = zlibSync(enc.encode(inhoud), { level: 6 });
    const annotaties: number[] = [];
    for (const k of pagina.koppelingen ?? []) {
      const url = veiligeUrl(k.url);
      if (!url) continue;
      const a = reserveer();
      annotaties.push(a);
      object(
        a,
        `<< /Type /Annot /Subtype /Link /Rect [${getal(k.x)} ${getal(H - k.y - k.hoogte)} ${getal(k.x + k.breedte)} ${getal(H - k.y)}] /Border [0 0 0] /A << /S /URI /URI ${pdfLetterlijk(url)} >> >>`,
      );
    }
    const middelen =
      vector !== null
        ? `${bronnenNr} 0 R`
        : `<< /ProcSet [/PDF /Text /ImageC]${pagina.beeld ? ` /XObject << /Im0 ${beeldNr} 0 R >>` : ""}${stukken.length ? ` /Font << /F0 ${glyphloosNrs().lettertype} 0 R >>` : ""} >>`;
    object(
      nr,
      `<< /Type /Page /Parent ${paginaBoom} 0 R /MediaBox [0 0 ${getal(B)} ${getal(H)}] /Resources ${middelen} /Contents ${inhoudNr} 0 R${annotaties.length ? ` /Annots [${annotaties.map((a) => `${a} 0 R`).join(" ")}]` : ""} >>`,
    );
    object(inhoudNr, `<< /Length ${inhoudBytes.length} /Filter /FlateDecode >>`, inhoudBytes);
    if (pagina.beeld && vector === null) {
      const b = pagina.beeld;
      if (b.soort === "jpeg")
        object(
          beeldNr,
          `<< /Type /XObject /Subtype /Image /Width ${b.breedte} /Height ${b.hoogte} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${b.bytes.length} >>`,
          b.bytes,
        );
      else {
        const gecomprimeerd = zlibSync(b.bytes, { level: 6 });
        object(
          beeldNr,
          `<< /Type /XObject /Subtype /Image /Width ${b.breedte} /Height ${b.hoogte} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${gecomprimeerd.length} >>`,
          gecomprimeerd,
        );
      }
    }
  });

  if (bronnenNr && doc.bronnen) schrijfBronnen(doc.bronnen, bronnenNr, reserveer, object);

  // Lettertype voor de onzichtbare tekstlaag.
  if (glyphloos) {
  const { lettertype, cidFont, beschrijving, fontBestand, toUnicode, cidNaarGid } = glyphloos;
  const font = glyphloosLettertype();
  const fontStroom = zlibSync(font, { level: 9 });
  object(
    lettertype,
    `<< /Type /Font /Subtype /Type0 /BaseFont /OOSGlyphless /Encoding /Identity-H /DescendantFonts [${cidFont} 0 R] /ToUnicode ${toUnicode} 0 R >>`,
  );
  object(
    cidFont,
    `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /OOSGlyphless /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${beschrijving} 0 R /DW ${GLYPH_BREEDTE} /CIDToGIDMap ${cidNaarGid} 0 R >>`,
  );
  object(
    beschrijving,
    `<< /Type /FontDescriptor /FontName /OOSGlyphless /Flags 5 /FontBBox [0 -200 ${GLYPH_BREEDTE} 800] /ItalicAngle 0 /Ascent 800 /Descent -200 /CapHeight 700 /StemV 80 /FontFile2 ${fontBestand} 0 R >>`,
  );
  object(fontBestand, `<< /Length ${fontStroom.length} /Length1 ${font.length} /Filter /FlateDecode >>`, fontStroom);
  const cmap = zlibSync(enc.encode(tekenset.toUnicode()), { level: 9 });
  object(toUnicode, `<< /Length ${cmap.length} /Filter /FlateDecode >>`, cmap);
  // Alle gebruikte CID's naar glyph 1 (CID 0 blijft .notdef).
  const kaart = new Uint8Array((tekenset.aantal + 1) * 2);
  for (let cid = 1; cid <= tekenset.aantal; cid++) kaart[cid * 2 + 1] = 1;
  const kaartStroom = zlibSync(kaart, { level: 9 });
  object(cidNaarGid, `<< /Length ${kaartStroom.length} /Filter /FlateDecode >>`, kaartStroom);
  }

  object(
    paginaBoom,
    `<< /Type /Pages /Kids [${paginaNummers.map((n) => `${n} 0 R`).join(" ")}] /Count ${paginaNummers.length} >>`,
  );

  // Bladwijzers (inhoudsopgave), plat.
  let outlines = 0;
  const bladwijzers = (doc.bladwijzers ?? []).filter(
    (b) => b.titel.trim() && b.pagina >= 0 && b.pagina < paginaNummers.length,
  );
  if (bladwijzers.length) {
    outlines = reserveer();
    const nummers = bladwijzers.map(() => reserveer());
    bladwijzers.forEach((b, i) => {
      const hoogte = doc.paginas[b.pagina].hoogte;
      const y = b.y !== undefined ? getal(hoogte - b.y) : getal(hoogte);
      object(
        nummers[i],
        `<< /Title ${pdfTekst(b.titel.slice(0, 200))} /Parent ${outlines} 0 R${i > 0 ? ` /Prev ${nummers[i - 1]} 0 R` : ""}${i < nummers.length - 1 ? ` /Next ${nummers[i + 1]} 0 R` : ""} /Dest [${paginaNummers[b.pagina]} 0 R /XYZ 0 ${y} 0] >>`,
      );
    });
    object(
      outlines,
      `<< /Type /Outlines /First ${nummers[0]} 0 R /Last ${nummers[nummers.length - 1]} 0 R /Count ${nummers.length} >>`,
    );
  }

  const datum = doc.datum ?? new Date();
  const maker = doc.maker ?? "OpenAEC Office Studio";
  const velden: string[] = [
    `/Producer ${pdfTekst(maker)}`,
    `/Creator ${pdfTekst(maker)}`,
    `/CreationDate (${pdfDatum(datum)})`,
    `/ModDate (${pdfDatum(datum)})`,
  ];
  if (doc.titel) velden.push(`/Title ${pdfTekst(doc.titel)}`);
  if (doc.auteur) velden.push(`/Author ${pdfTekst(doc.auteur)}`);
  if (doc.onderwerp) velden.push(`/Subject ${pdfTekst(doc.onderwerp)}`);
  if (doc.trefwoorden) velden.push(`/Keywords ${pdfTekst(doc.trefwoorden)}`);
  object(info, `<< ${velden.join(" ")} >>`);

  const iso = datum.toISOString().replace(/\.\d{3}Z$/, "Z");
  const xmp = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
<dc:format>application/pdf</dc:format>
${doc.titel ? `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlOntsnap(doc.titel)}</rdf:li></rdf:Alt></dc:title>` : ""}
${doc.auteur ? `<dc:creator><rdf:Seq><rdf:li>${xmlOntsnap(doc.auteur)}</rdf:li></rdf:Seq></dc:creator>` : ""}
${doc.onderwerp ? `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${xmlOntsnap(doc.onderwerp)}</rdf:li></rdf:Alt></dc:description>` : ""}
<xmp:CreateDate>${iso}</xmp:CreateDate>
<xmp:ModifyDate>${iso}</xmp:ModifyDate>
<xmp:CreatorTool>${xmlOntsnap(maker)}</xmp:CreatorTool>
<pdf:Producer>${xmlOntsnap(maker)}</pdf:Producer>
${doc.trefwoorden ? `<pdf:Keywords>${xmlOntsnap(doc.trefwoorden)}</pdf:Keywords>` : ""}
</rdf:Description>
</rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
  const xmpBytes = enc.encode(xmp);
  object(metadata, `<< /Type /Metadata /Subtype /XML /Length ${xmpBytes.length} >>`, xmpBytes);

  object(
    catalogus,
    `<< /Type /Catalog /Pages ${paginaBoom} 0 R /Metadata ${metadata} 0 R /Lang ${pdfTekst(doc.taal ?? "nl-NL")} /ViewerPreferences << /DisplayDocTitle true >>${outlines ? ` /Outlines ${outlines} 0 R /PageMode /UseOutlines` : ""} >>`,
  );

  const xref = uit.lengte;
  let tabel = `xref\n0 ${volgnummer + 1}\n0000000000 65535 f \n`;
  for (let nr = 1; nr <= volgnummer; nr++)
    tabel += `${String(posities[nr] ?? 0).padStart(10, "0")} 00000 n \n`;
  uit.schrijf(tabel);
  const id = idVan(uit.lengte, doc.paginas.length, doc.titel ?? "", datum);
  uit.schrijf(
    `trailer\n<< /Size ${volgnummer + 1} /Root ${catalogus} 0 R /Info ${info} 0 R /ID [<${id}> <${id}>] >>\nstartxref\n${xref}\n%%EOF\n`,
  );
  return uit.bytes();
}

/** Eenvoudige, deterministische bestands-id (geen cryptografische functie nodig). */
function idVan(lengte: number, paginas: number, titel: string, datum: Date) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  const bron = `${lengte}|${paginas}|${titel}|${datum.getTime()}`;
  for (let i = 0; i < bron.length; i++) {
    h1 = Math.imul(h1 ^ bron.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ bron.charCodeAt(i), 0x5bd1e995) >>> 0;
  }
  return [h1, h2, (h1 ^ h2) >>> 0, (h1 + h2) >>> 0]
    .map((n) => n.toString(16).padStart(8, "0"))
    .join("")
    .toUpperCase();
}

type Schrijf = (nr: number, inhoud: string | Uint8Array, stroom?: Uint8Array) => void;

/** ToUnicode-tabel voor glyph → tekst. */
function unicodeTabel(paren: [number, string][]) {
  const regels: string[] = [];
  for (let i = 0; i < paren.length; i += 100) {
    const blok = paren.slice(i, i + 100);
    regels.push(`${blok.length} beginbfchar`);
    for (const [g, tekst] of blok) {
      let hex = "";
      for (let j = 0; j < tekst.length; j++) hex += tekst.charCodeAt(j).toString(16).padStart(4, "0");
      regels.push(`<${g.toString(16).padStart(4, "0")}> <${hex || "0020"}>`);
    }
    regels.push("endbfchar");
  }
  return `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Adobe-Identity-UCS def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
${regels.join("\n")}
endcmap
CMapName currentdict /CMap defineresource pop
end
end`;
}

/** /W-reeks: opeenvolgende glyphs in één groep. */
function breedteReeks(breedtes: [number, number][], schaal: number) {
  const delen: string[] = [];
  let i = 0;
  while (i < breedtes.length) {
    const start = breedtes[i][0];
    const groep: string[] = [];
    let j = i;
    while (j < breedtes.length && breedtes[j][0] === start + (j - i)) {
      groep.push(getal(breedtes[j][1] * schaal));
      j++;
    }
    delen.push(`${start} [${groep.join(" ")}]`);
    i = j;
  }
  return `[${delen.join(" ")}]`;
}

function beeldObject(stroom: PdfBeeldStroom, nr: number, reserveer: () => number, object: Schrijf) {
  const masker = stroom.masker ? reserveer() : 0;
  const parms = stroom.voorspeller
    ? ` /DecodeParms << /Predictor 15 /Colors ${stroom.kleuren} /BitsPerComponent 8 /Columns ${stroom.breedte} >>`
    : "";
  object(
    nr,
    `<< /Type /XObject /Subtype /Image /Width ${stroom.breedte} /Height ${stroom.hoogte} /ColorSpace /${stroom.kleuren === 1 ? "DeviceGray" : "DeviceRGB"} /BitsPerComponent 8 /Filter /${stroom.filter}${parms}${masker ? ` /SMask ${masker} 0 R` : ""} /Length ${stroom.bytes.length} >>`,
    stroom.bytes,
  );
  if (stroom.masker) beeldObject(stroom.masker, masker, reserveer, object);
}

function functie(stops: PdfVerloop["stops"]) {
  const kleur = (k: [number, number, number]) => k.map(getal).join(" ");
  const lijst = [...stops].sort((a, b) => a.t - b.t).map((s) => ({ ...s, t: Math.max(0, Math.min(1, s.t)) }));
  if (!lijst.length) return "<< /FunctionType 2 /Domain [0 1] /C0 [0 0 0] /C1 [0 0 0] /N 1 >>";
  if (lijst[0].t > 0) lijst.unshift({ ...lijst[0], t: 0 });
  if (lijst[lijst.length - 1].t < 1) lijst.push({ ...lijst[lijst.length - 1], t: 1 });
  if (lijst.length === 1) lijst.push({ ...lijst[0], t: 1 });
  const stuk = (a: (typeof lijst)[number], b: (typeof lijst)[number]) =>
    `<< /FunctionType 2 /Domain [0 1] /C0 [${kleur(a.kleur)}] /C1 [${kleur(b.kleur)}] /N 1 >>`;
  if (lijst.length === 2) return stuk(lijst[0], lijst[1]);
  const grenzen: number[] = [];
  for (let i = 1; i < lijst.length - 1; i++) {
    const vorige = grenzen.length ? grenzen[grenzen.length - 1] : 0;
    grenzen.push(Math.min(1, Math.max(lijst[i].t, vorige + 1e-4)));
  }
  const functies = lijst.slice(0, -1).map((a, i) => stuk(a, lijst[i + 1]));
  return `<< /FunctionType 3 /Domain [0 1] /Functions [${functies.join(" ")}] /Bounds [${grenzen.map(getal).join(" ")}] /Encode [${functies.map(() => "0 1").join(" ")}] >>`;
}

/** Schrijft het gedeelde bronnenwoordenboek van de vectorpagina's en alles waarnaar het verwijst. */
function schrijfBronnen(bronnen: PdfBronnen, nr: number, reserveer: () => number, object: Schrijf) {
  const fonts: string[] = [];
  for (const f of bronnen.fonts) {
    const type0 = reserveer();
    const cid = reserveer();
    const beschrijving = reserveer();
    const bestand = reserveer();
    const tu = reserveer();
    fonts.push(`/${f.naam} ${type0} 0 R`);
    const schaal = 1000 / f.eenheden;
    const naam = `/${f.basisnaam}`;
    object(type0, `<< /Type /Font /Subtype /Type0 /BaseFont ${naam} /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${tu} 0 R >>`);
    object(
      cid,
      `<< /Type /Font /Subtype /CIDFontType2 /BaseFont ${naam} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${beschrijving} 0 R /DW 0 /W ${breedteReeks(f.breedtes, schaal)} /CIDToGIDMap /Identity >>`,
    );
    const vlaggen = 4 | (f.vast ? 1 : 0) | (f.cursiefHoek ? 64 : 0);
    object(
      beschrijving,
      `<< /Type /FontDescriptor /FontName ${naam} /Flags ${vlaggen} /FontBBox [${f.kader.map((v) => getal(v * schaal)).join(" ")}] /ItalicAngle ${getal(f.cursiefHoek)} /Ascent ${getal(f.stijgen * schaal)} /Descent ${getal(f.dalen * schaal)} /CapHeight ${getal(f.hoofdletter * schaal)} /StemV 80 /FontFile2 ${bestand} 0 R >>`,
    );
    const gepakt = zlibSync(f.bestand, { level: 9 });
    object(bestand, `<< /Length ${gepakt.length} /Length1 ${f.bestand.length} /Filter /FlateDecode >>`, gepakt);
    const cmap = zlibSync(enc.encode(unicodeTabel(f.unicode)), { level: 9 });
    object(tu, `<< /Length ${cmap.length} /Filter /FlateDecode >>`, cmap);
  }
  const beelden: string[] = [];
  for (const b of bronnen.beelden) {
    const n = reserveer();
    beelden.push(`/${b.naam} ${n} 0 R`);
    beeldObject(b.stroom, n, reserveer, object);
  }
  const toestanden = bronnen.toestanden.map((t) => `/${t.naam} << /Type /ExtGState /ca ${getal(t.ca)} /CA ${getal(t.CA)} >>`);
  const verlopen = bronnen.verlopen.map(
    (v) =>
      `/${v.naam} << /ShadingType ${v.soort} /ColorSpace /DeviceRGB /Coords [${v.coords.map(getal).join(" ")}] /Function ${functie(v.stops)} /Extend [true true] >>`,
  );
  object(
    nr,
    `<< /ProcSet [/PDF /Text /ImageB /ImageC]${fonts.length ? ` /Font << ${fonts.join(" ")} >>` : ""}${beelden.length ? ` /XObject << ${beelden.join(" ")} >>` : ""}${toestanden.length ? ` /ExtGState << ${toestanden.join(" ")} >>` : ""}${verlopen.length ? ` /Shading << ${verlopen.join(" ")} >>` : ""} >>`,
  );
}
