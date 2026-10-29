import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { zlibSync } from "fflate";
import { zetTaal } from "../../../../src/i18n/config";
import { grootteTekst, herkenSoort, lijktTekst } from "./herkenning";
import { decodeerTekst, detecteerCodering, isGeldigeUtf8 } from "./codering";
import { leesPdfMeta, pdfDatum } from "./pdf-meta";
import { DWG_VERSIES, dwgVersie, eenheidNaam, leesDwgMeta, leesDxfMeta } from "./cad-meta";
import { IfcTeller, analyseerIfc, analyseerIfcSync, herstelUtf8, stepArgumenten, stepTekst } from "./ifc-meta";
import { controleerAfbeelding, exifOrientatie, leesAfmetingen } from "./afbeelding-meta";
import { herkenWebview } from "./platform";
import { LIMIETEN, kiesWeergever, maakBron, registreerWeergever, type VoorbeeldBron } from "./contract";
import { MarkdownWeergave, heeftExterneAfbeeldingen } from "./weergevers/MarkdownWeergever";
import { regelnummers } from "./weergevers/TekstWeergever";
import { registreerStandaardWeergevers } from "./standaard";

const enc = new TextEncoder();
const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
const PNG_KOP = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function png(breedte: number, hoogte: number) {
  const b = new Uint8Array(33);
  b.set(PNG_KOP);
  b.set([0, 0, 0, 13], 8);
  b.set(ascii("IHDR"), 12);
  new DataView(b.buffer).setUint32(16, breedte);
  new DataView(b.buffer).setUint32(20, hoogte);
  return b;
}

describe("herkenning", () => {
  it("herkent op extensie zonder inhoud", () => {
    expect(herkenSoort("plan.dwg", "application/octet-stream").soort).toBe("dwg");
    expect(herkenSoort("README.md", "").soort).toBe("markdown");
    expect(herkenSoort("x.JPG", "").afbeelding).toBe("jpeg");
    expect(herkenSoort("begroting.xlsx", "").kantoor).toBe("rekenblad");
    expect(herkenSoort("data.bin", "text/plain").soort).toBe("tekst");
    expect(herkenSoort("x.exe", "application/x-msdownload").soort).toBe("onbekend");
  });

  it("herkent op magische bytes", () => {
    expect(herkenSoort("x", "", ascii("%PDF-1.7\n")).soort).toBe("pdf");
    expect(herkenSoort("x", "", ascii("AC1032\0\0\0")).soort).toBe("dwg");
    expect(herkenSoort("x", "", ascii("ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC4'));\nENDSEC;")).soort).toBe("ifc");
    expect(herkenSoort("x", "", new Uint8Array([0xff, 0xd8, 0xff, 0xe0])).afbeelding).toBe("jpeg");
    expect(herkenSoort("x", "", new Uint8Array(PNG_KOP)).afbeelding).toBe("png");
    expect(herkenSoort("x", "", ascii("GIF89a....")).afbeelding).toBe("gif");
    expect(herkenSoort("x", "", ascii("RIFF\0\0\0\0WEBPVP8 ")).afbeelding).toBe("webp");
    expect(herkenSoort("x", "", ascii("  0\nSECTION\n  2\nHEADER\n")).soort).toBe("dxf");
    expect(herkenSoort("x", "", ascii('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>')).afbeelding).toBe("svg");
  });

  it("herkent Office-ZIP's en gewone ZIP's", () => {
    const ooxml = ascii("PK\x03\x04" + "\0".repeat(26) + "[Content_Types].xml....word/document.xml");
    expect(herkenSoort("brief", "", ooxml)).toMatchObject({ soort: "office", kantoor: "tekst" });
    const odf = ascii("PK\x03\x04" + "\0".repeat(26) + "mimetypeapplication/vnd.oasis.opendocument.spreadsheet");
    expect(herkenSoort("x.ods", "", odf)).toMatchObject({ soort: "office", kantoor: "rekenblad" });
    const zip = ascii("PK\x03\x04" + "\0".repeat(26) + "foto.jpg");
    expect(herkenSoort("archief.zip", "", zip).soort).toBe("onbekend");
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(herkenSoort("oud.doc", "", ole)).toMatchObject({ soort: "office", kantoor: "tekst" });
  });

  it("laat de inhoud winnen van een misleidende extensie", () => {
    const r = herkenSoort("vakantie.jpg", "image/jpeg", ascii("%PDF-1.4\n"));
    expect(r.soort).toBe("pdf");
    expect(r.waarschuwing).toMatch(/\.jpg/);
    const exe = herkenSoort("factuur.pdf", "application/pdf", ascii("MZ\x90\0\x03"));
    expect(exe.soort).toBe("onbekend");
    expect(exe.waarschuwing).toBeTruthy();
    // Binaire inhoud achter .txt wordt niet als tekst getoond.
    expect(herkenSoort("notities.txt", "", new Uint8Array([1, 2, 0, 3])).soort).toBe("onbekend");
    // Een .svg die geen SVG is (bijv. HTML) wordt nooit als afbeelding behandeld.
    expect(herkenSoort("logo.svg", "image/svg+xml", ascii("<html><script>alert(1)</script>")).soort).toBe("onbekend");
    // PNG met een .txt-naam: als afbeelding tonen, met waarschuwing.
    const p = herkenSoort("lees.txt", "", png(10, 10));
    expect(p).toMatchObject({ soort: "afbeelding", afbeelding: "png" });
    expect(p.waarschuwing).toBeTruthy();
  });

  it("toont leesbare tekst zonder bekende extensie als tekst", () => {
    expect(herkenSoort("LICENSE", "", ascii("MIT License\n\nCopyright")).soort).toBe("tekst");
    expect(lijktTekst(new Uint8Array([0xff, 0xfe, 0x41, 0x00]))).toBe(true);
  });
});

describe("codering", () => {
  it("herkent BOM's, UTF-8 en Windows-1252", () => {
    expect(detecteerCodering(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]))).toBe("utf-8-bom");
    expect(detecteerCodering(new Uint8Array([0xff, 0xfe, 0x41, 0]))).toBe("utf-16le");
    expect(detecteerCodering(new Uint8Array([0xfe, 0xff, 0, 0x41]))).toBe("utf-16be");
    expect(detecteerCodering(enc.encode("café €"))).toBe("utf-8");
    expect(detecteerCodering(new Uint8Array([0x63, 0x61, 0x66, 0xe9]))).toBe("windows-1252");
    expect(isGeldigeUtf8(new Uint8Array([0xc0, 0x80]))).toBe(false); // te lange codering
    expect(isGeldigeUtf8(new Uint8Array([0xed, 0xa0, 0x80]))).toBe(false); // surrogaat
  });

  it("decodeert correct en verwijdert de BOM", () => {
    expect(decodeerTekst(new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0xc3, 0xa9])).tekst).toBe("hé");
    expect(decodeerTekst(new Uint8Array([0xff, 0xfe, 0x68, 0, 0xe9, 0])).tekst).toBe("hé");
    expect(decodeerTekst(new Uint8Array([0xfe, 0xff, 0, 0x68, 0, 0xe9])).tekst).toBe("hé");
    expect(decodeerTekst(new Uint8Array([0x80, 0x20, 0xe9])).tekst).toBe("€ é");
  });

  it("kapt af op de limiet zonder half teken", () => {
    const b = enc.encode("aé".repeat(10)); // 30 bytes
    const r = decodeerTekst(b, 5); // a é a + eerste byte van é
    expect(r.afgekapt).toBe(true);
    expect(r.codering).toBe("utf-8");
    expect(r.tekst).toBe("aéa");
  });

  it("telt regelnummers", () => {
    expect(regelnummers("a\nb\nc")).toBe("1\n2\n3");
    expect(regelnummers("a\nb\n")).toBe("1\n2");
    expect(regelnummers("")).toBe("1");
  });
});

function bouwPdf(objecten: string[], trailer: string, versie = "1.4") {
  let s = `%PDF-${versie}\n%\xe2\xe3\xcf\xd3\n`;
  objecten.forEach((o, i) => (s += `${i + 1} 0 obj\n${o}\nendobj\n`));
  s += `xref\n0 ${objecten.length + 1}\ntrailer\n${trailer}\nstartxref\n0\n%%EOF\n`;
  return ascii(s);
}

describe("PDF-metadata", () => {
  it("leest versie, pagina's en Info", () => {
    const pdf = bouwPdf(
      [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>",
        "<< /Type /Page /Parent 2 0 R >>",
        "<< /Type /Page /Parent 2 0 R >>",
        "<< /Type /Page /Parent 2 0 R >>",
        "<< /Title (Bestek \\(concept\\)) /Author <FEFF004A0061006E> /Producer (LibreOffice) /CreationDate (D:20260115103000+01'00') >>",
      ],
      "<< /Size 7 /Root 1 0 R /Info 6 0 R >>",
      "1.7",
    );
    const m = leesPdfMeta(pdf);
    expect(m.versie).toBe("1.7");
    expect(m.paginas).toBe(3);
    expect(m.titel).toBe("Bestek (concept)");
    expect(m.auteur).toBe("Jan");
    expect(m.producent).toBe("LibreOffice");
    expect(m.aangemaakt?.toISOString()).toBe("2026-01-15T09:30:00.000Z");
    expect(m.versleuteld).toBe(false);
    expect(m.onvolledig).toBe(false);
  });

  it("telt bladobjecten als /Count ontbreekt en herkent versleuteling", () => {
    const pdf = bouwPdf(["<< /Type /Page >>", "<< /Type /Page >>", "<< /Filter /Standard /V 2 >>"], "<< /Encrypt 3 0 R /Info 9 0 R >>");
    const m = leesPdfMeta(pdf);
    expect(m.paginas).toBe(2);
    expect(m.versleuteld).toBe(true);
    expect(m.titel).toBeUndefined();
  });

  it("kijkt in gecomprimeerde objectstromen (PDF 1.5+)", () => {
    const o1 = "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>";
    const o2 = "<< /Title (Gecomprimeerd) >>";
    const kop = `2 0 5 ${o1.length + 1} `;
    const inhoud = zlibSync(ascii(kop + o1 + " " + o2));
    const pre = `%PDF-1.5\n1 0 obj\n<< /Type /ObjStm /N 2 /First ${kop.length} /Length ${inhoud.length} /Filter /FlateDecode >>\nstream\n`;
    const post = "\nendstream\nendobj\n9 0 obj\n<< /Type /XRef /Root 7 0 R /Info 5 0 R >>\nendobj\n%%EOF\n";
    const pdf = new Uint8Array([...ascii(pre), ...inhoud, ...ascii(post)]);
    const m = leesPdfMeta(pdf);
    expect(m.paginas).toBe(2);
    expect(m.titel).toBe("Gecomprimeerd");
  });

  it("markeert afgekapte bestanden en leest datums", () => {
    expect(leesPdfMeta(ascii("%PDF-1.3\n1 0 obj\n<< /Type /Page >>")).onvolledig).toBe(true);
    expect(pdfDatum("D:2024")?.getUTCFullYear()).toBe(2024);
    expect(pdfDatum("onzin")).toBeUndefined();
  });
});

describe("DWG en DXF", () => {
  it("kent de DWG-versietabel AC1015…AC1032", () => {
    for (const c of ["AC1015", "AC1018", "AC1021", "AC1024", "AC1027", "AC1032"]) expect(DWG_VERSIES[c]).toBeTruthy();
    expect(dwgVersie("AC1015")?.autocad).toMatch(/2000/);
    expect(dwgVersie("AC1032")?.autocad).toMatch(/2018/);
    expect(dwgVersie("AC9999")).toBeNull();
    expect(leesDwgMeta(ascii("AC1027\0\0\0\0\0")).versie?.release).toBe("R2013");
    expect(leesDwgMeta(ascii("PK\x03\x04")).code).toBeNull();
  });

  it("vindt een ingebed PNG-miniatuur", () => {
    const b = new Uint8Array(200);
    b.set(ascii("AC1032"));
    const adres = 0x40;
    new DataView(b.buffer).setUint32(0x0d, adres, true);
    const ingang = adres + 16 + 4;
    b[ingang] = 1; // aantal
    b[ingang + 1] = 6; // PNG
    new DataView(b.buffer).setUint32(ingang + 2, 100, true);
    new DataView(b.buffer).setUint32(ingang + 6, 33, true);
    b.set(png(64, 48), 100);
    const m = leesDwgMeta(b);
    expect(m.miniatuur?.type).toBe("image/png");
    expect(m.miniatuur?.bytes.length).toBe(33);
  });

  it("ontleedt een ASCII-DXF", () => {
    const dxf = [
      "999", "gemaakt door test",
      "0", "SECTION", "2", "HEADER",
      "9", "$ACADVER", "1", "AC1027",
      "9", "$INSUNITS", "70", "4",
      "0", "ENDSEC",
      "0", "SECTION", "2", "TABLES",
      "0", "TABLE", "2", "LAYER", "70", "2",
      "0", "LAYER", "2", "0", "70", "0",
      "0", "LAYER", "2", "Wanden", "70", "0",
      "0", "ENDTAB",
      "0", "TABLE", "2", "LTYPE",
      "0", "LTYPE", "2", "CONTINUOUS",
      "0", "ENDTAB",
      "0", "ENDSEC",
      "0", "SECTION", "2", "BLOCKS",
      "0", "BLOCK", "2", "Deur",
      "0", "ENDBLK",
      "0", "ENDSEC",
      "0", "SECTION", "2", "ENTITIES",
      "0", "LINE", "8", "Wanden",
      "0", "LINE", "8", "Wanden",
      "0", "LWPOLYLINE", "8", "0",
      "0", "INSERT", "2", "Deur",
      "0", "ENDSEC",
      "0", "EOF",
    ].join("\r\n");
    const m = leesDxfMeta(ascii(dxf));
    expect(m.acadver).toBe("AC1027");
    expect(m.versie?.release).toBe("R2013");
    expect(m.eenheid).toBe("millimeter");
    expect(m.lagen).toEqual(["0", "Wanden"]);
    expect(m.entiteiten).toEqual([["LINE", 2], ["INSERT", 1], ["LWPOLYLINE", 1]]);
    expect(m.totaalEntiteiten).toBe(4);
    expect(m.blokken).toBe(1);
    expect(herkenSoort("x.dxf", "", ascii(dxf)).soort).toBe("dxf");
  });
});

const IFC = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView_V2.0]'),'2;1');
FILE_NAME('Woning.ifc','2026-03-01T10:00:00',('Jan de Vries'),('OpenAEC; Bouw'),'IfcOpenShell','Revit 2025','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
/* commentaar met ; erin */
#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'Woning ''t Hof',$,$,'Project lang',$,$,$);
#2=IFCSITE('1',$,'Kavel 12',$,$,$,$,$,.ELEMENT.,$,$,$,$,$);
#3=IFCBUILDING('2',$,'Hoofdgebouw',$,$,$,$,$,.ELEMENT.,$,$,$);
#4=IFCBUILDINGSTOREY('3',$,'01 Verdieping',$,$,$,$,$,.ELEMENT.,3000.);
#5=IFCBUILDINGSTOREY('4',$,'00 Begane grond',$,$,$,$,$,.ELEMENT.,0.);
#6=IFCWALL('5',$,'Wand; met puntkomma',$,$,$,$,$,$);
#7=IFCWALL('6',$,'W\\X2\\00E9\\X0\\',$,$,$,$,$,$);
#8=IFCDOOR('7',$,'Deur',$,$,$,$,$,$,$,$,$,$);
#9=IFCSLAB('8',$,'Vloer',$,$,$,$,$,.FLOOR.);
#10=IFCCARTESIANPOINT((0.,0.,0.));
ENDSEC;
END-ISO-10303-21;
`;

describe("IFC", () => {
  it("leest de STEP-kop", () => {
    const m = analyseerIfcSync(ascii(IFC));
    expect(m.kop.schema).toEqual(["IFC4"]);
    expect(m.kop.naam).toBe("Woning.ifc");
    expect(m.kop.tijdstip).toBe("2026-03-01T10:00:00");
    expect(m.kop.auteurs).toEqual(["Jan de Vries"]);
    expect(m.kop.organisaties).toEqual(["OpenAEC; Bouw"]);
    expect(m.kop.toepassing).toBe("Revit 2025");
    expect(m.kop.beschrijving).toEqual(["ViewDefinition [CoordinationView_V2.0]"]);
    expect(m.volledig).toBe(true);
  });

  it("telt entiteiten en leest de ruimtelijke structuur", () => {
    const m = analyseerIfcSync(ascii(IFC));
    const t = new Map(m.entiteiten);
    expect(t.get("IFCWALL")).toBe(2);
    expect(t.get("IFCDOOR")).toBe(1);
    expect(t.get("IFCSLAB")).toBe(1);
    expect(t.get("IFCBUILDINGSTOREY")).toBe(2);
    expect(m.totaal).toBe(10);
    expect(m.project).toMatchObject({ naam: "Woning 't Hof", langeNaam: "Project lang" });
    expect(m.terreinen.map((x) => x.naam)).toEqual(["Kavel 12"]);
    expect(m.gebouwen.map((x) => x.naam)).toEqual(["Hoofdgebouw"]);
    // Gesorteerd op hoogte.
    expect(m.verdiepingen.map((x) => [x.naam, x.hoogte])).toEqual([["00 Begane grond", 0], ["01 Verdieping", 3000]]);
  });

  it("geeft hetzelfde resultaat bij elke opsplitsing in stukken", () => {
    const bytes = ascii(IFC);
    const geheel = analyseerIfcSync(bytes);
    for (const stuk of [1, 2, 3, 7, 64]) {
      const t = new IfcTeller();
      for (let p = 0; p < bytes.length; p += stuk) t.voed(bytes.subarray(p, p + stuk));
      expect(t.einde()).toEqual(geheel);
    }
  });

  it("decodeert STEP-tekst en herstelt rauwe UTF-8", () => {
    expect(stepTekst("W\\X2\\00E9\\X0\\")).toBe("Wé");
    expect(stepTekst("\\X\\E9t\\S\\i")).toBe("été");
    expect(stepTekst("a''b\\\\c")).toBe("a'b\\c");
    expect(herstelUtf8("CafÃ©")).toBe("Café");
    expect(herstelUtf8("Café")).toBe("Café");
    expect(stepArgumenten("('a,b',(1,2),$)")).toEqual(["'a,b'", "(1,2)", "$"]);
  });

  it("analyseert zonder Worker in stukken en kan annuleren", async () => {
    const m = await analyseerIfc(ascii(IFC));
    expect(m.kop.schema).toEqual(["IFC4"]);
    const ac = new AbortController();
    ac.abort();
    await expect(analyseerIfc(ascii(IFC), { signaal: ac.signal })).rejects.toThrow("Geannuleerd");
  });
});

describe("Markdown zonder rauwe HTML", () => {
  const html = (tekst: string, extern = false) =>
    renderToStaticMarkup(<MarkdownWeergave tekst={tekst} externeAfbeeldingen={extern} />);

  it("rendert GFM", () => {
    const h = html("# Titel\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] klaar\n\n~~weg~~");
    expect(h).toContain("<h1>Titel</h1>");
    expect(h).toContain("<table>");
    expect(h).toContain('type="checkbox"');
    expect(h).toContain("<del>weg</del>");
  });

  it("laat rauwe HTML en gevaarlijke links weg", () => {
    const h = html('Hallo <script>alert(1)</script> <b onclick="x()">vet</b>\n\n<iframe src="https://kwaad"></iframe>\n\n[klik](javascript:alert(1))');
    expect(h).not.toMatch(/<script|<iframe|<b[ >]|onclick|javascript:/i);
    expect(h).toContain("vet");
    expect(h).toContain("klik");
  });

  it("blokkeert externe afbeeldingen tot ze zijn toegestaan", () => {
    const md = "![logo](https://voorbeeld.nl/logo.png)";
    expect(heeftExterneAfbeeldingen(md)).toBe(true);
    expect(html(md)).not.toContain("<img");
    expect(html(md)).toContain("externe afbeelding geblokkeerd");
    expect(html(md, true)).toContain('<img src="https://voorbeeld.nl/logo.png"');
  });

  it("maakt alleen http(s)/mailto klikbaar", () => {
    expect(html("[site](https://openaec.nl)")).toContain('href="https://openaec.nl"');
    expect(html("[bestand](file:///etc/passwd)")).not.toContain("href=");
  });
});

describe("afbeeldingen en limieten", () => {
  it("leest afmetingen uit de kop", () => {
    expect(leesAfmetingen(png(640, 480), "png")).toEqual({ breedte: 640, hoogte: 480 });
    expect(leesAfmetingen(ascii("GIF89a\x20\x03\x58\x02"), "gif")).toEqual({ breedte: 800, hoogte: 600 });
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0x01, 0xe0, 0x02, 0x80, 3, 0, 0, 0]);
    expect(leesAfmetingen(jpeg, "jpeg")).toEqual({ breedte: 640, hoogte: 480 });
  });

  it("leest de EXIF-oriëntatie", () => {
    // APP1 met TIFF (II), één IFD-ingang: 0x0112 = 6.
    const tiff = [0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0];
    const app1 = [...ascii("Exif\0\0"), ...tiff];
    const len = app1.length + 2;
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 0xff, ...app1, 0xff, 0xd9]);
    expect(exifOrientatie(jpeg)).toBe(6);
    expect(exifOrientatie(png(1, 1))).toBe(1);
  });

  it("weigert te grote afbeeldingen", () => {
    expect(controleerAfbeelding(png(20_000, 20_000), "png", LIMIETEN).ok).toBe(false);
    expect(controleerAfbeelding(png(8000, 6000), "png", LIMIETEN).ok).toBe(true);
    const groot = new Uint8Array(LIMIETEN.afbeeldingBytes + 1);
    groot.set(png(10, 10));
    const r = controleerAfbeelding(groot, "png", LIMIETEN);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.melding).toMatch(/40 MB/);
  });

  it("kapt tekst af op 2 MB", () => {
    const b = new Uint8Array(LIMIETEN.tekstBytes + 10).fill(0x61);
    const r = decodeerTekst(b, LIMIETEN.tekstBytes);
    expect(r.afgekapt).toBe(true);
    expect(r.tekst.length).toBe(LIMIETEN.tekstBytes);
  });
});

describe("platform", () => {
  it("herkent WebKitGTK en Chromium", () => {
    expect(herkenWebview("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko)", undefined)).toEqual({ soort: "webkitgtk", pdfIngebouwd: false });
    expect(herkenWebview("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0", true).pdfIngebouwd).toBe(true);
    expect(herkenWebview("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko)", undefined).pdfIngebouwd).toBe(true);
  });
});

describe("register van weergevers", () => {
  const bron: VoorbeeldBron = maakBron({ bestandsnaam: "a.dwg", inhoudstype: "", grootte: 1 }, async () => new Uint8Array());

  it("kiest de hoogste prioriteit die de bron kan tonen", () => {
    registreerStandaardWeergevers();
    expect(kiesWeergever("dwg", bron)?.naam).toBe("dwg-metadata");
    const Nep = () => null;
    const af1 = registreerWeergever({ naam: "dwg-rust", soort: "dwg", prioriteit: 100, kan: () => true, Component: Nep });
    const af2 = registreerWeergever({ naam: "dwg-kapot", soort: "dwg", prioriteit: 200, kan: () => { throw new Error("x"); }, Component: Nep });
    expect(kiesWeergever("dwg", bron)?.naam).toBe("dwg-rust");
    af1();
    af2();
    expect(kiesWeergever("dwg", bron)?.naam).toBe("dwg-metadata");
  });

  it("valt terug op onbekend en cachet bytes", async () => {
    const leeg = registreerWeergever({ naam: "pdf-nooit", soort: "pdf", prioriteit: 50, kan: () => false, Component: () => null });
    expect(kiesWeergever("pdf", bron)?.naam).toBe("pdf-webview");
    leeg();
    let n = 0;
    const b = maakBron({ bestandsnaam: "x", inhoudstype: "", grootte: 0 }, async () => (n++, new Uint8Array([1])));
    await b.bytes();
    await b.bytes();
    expect(n).toBe(1);
  });
});

describe("meertalig", () => {
  afterEach(async () => {
    await zetTaal("nl");
  });

  it("toont waarschuwingen, meldingen en eenheden in het Engels", async () => {
    await zetTaal("en");
    expect(herkenSoort("vakantie.jpg", "image/jpeg", ascii("%PDF-1.4\n")).waarschuwing).toBe(
      "This attachment is named “.jpg” (an image), but the content is a PDF.",
    );
    const groot = new Uint8Array(LIMIETEN.afbeeldingBytes + 1);
    groot.set(png(10, 10));
    const r = controleerAfbeelding(groot, "png", LIMIETEN);
    expect(!r.ok && r.melding).toBe("This image is larger than 40 MB and is not shown as a preview.");
    expect(eenheidNaam(4)).toBe("millimetre");
    expect(dwgVersie("AC1015")?.autocad).toBe("AutoCAD 2000, 2000i and 2002");
    expect(dwgVersie("AC1027")?.autocad).toBe("AutoCAD 2013 to 2017");
    expect(grootteTekst(1.5 * 1024 * 1024)).toBe("1.5 MB");
    expect(renderToStaticMarkup(<MarkdownWeergave tekst="![logo](https://x.nl/a.png)" externeAfbeeldingen={false} />)).toContain(
      "logo (external image blocked)",
    );
  });

  it("houdt de Nederlandse teksten gelijk", () => {
    expect(herkenSoort("vakantie.jpg", "image/jpeg", ascii("%PDF-1.4\n")).waarschuwing).toBe(
      "Deze bijlage heet “.jpg” (afbeelding), maar de inhoud is PDF.",
    );
    expect(dwgVersie("AC1015")?.autocad).toBe("AutoCAD 2000, 2000i en 2002");
    expect(dwgVersie("AC1027")?.autocad).toBe("AutoCAD 2013 t/m 2017");
    expect(dwgVersie("AC1032")?.autocad).toBe("AutoCAD 2018 en later");
    expect(grootteTekst(1.5 * 1024 * 1024)).toBe("1,5 MB");
    expect(grootteTekst(2 * 1024 * 1024)).toBe("2,0 MB");
  });
});
