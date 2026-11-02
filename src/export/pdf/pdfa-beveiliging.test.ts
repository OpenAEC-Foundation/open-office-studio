import { describe, expect, it } from "vitest";
import { unzlibSync } from "fflate";
import { bladwijzerBoom, schrijfPdf, schrijfPdfBeveiligd, pdfTekst, type PdfDocument } from "./schrijver";
import { hash2B, heeftBeveiliging, rechtenWaarde, versleutelStrings, wachtwoordBytes } from "./beveiliging";
import { srgbProfiel } from "./srgb";

const latin1 = (b: Uint8Array) => {
  let s = "";
  for (const c of b) s += String.fromCharCode(c);
  return s;
};
const vanHex = (h: string) => new Uint8Array(h.match(/../g)!.map((x) => parseInt(x, 16)));

const basis = (): PdfDocument => ({
  titel: "Proef",
  auteur: "OpenAEC",
  onderwerp: "Archief",
  trefwoorden: "pdf, archief",
  datum: new Date(Date.UTC(2026, 9, 29, 9)),
  paginas: [
    {
      breedte: 595,
      hoogte: 842,
      beeld: { soort: "rgb", breedte: 2, hoogte: 2, bytes: new Uint8Array(12).fill(240) },
      tekst: [{ tekst: "Geheime tekst", x: 72, y: 100, grootte: 12, breedte: 90 }],
      koppelingen: [{ x: 72, y: 90, breedte: 100, hoogte: 14, url: "https://openaec.org/(a)" }],
    },
    { breedte: 595, hoogte: 842 },
  ],
  bladwijzers: [
    { titel: "Inleiding", pagina: 0, niveau: 1 },
    { titel: "Achtergrond", pagina: 0, y: 300, niveau: 2 },
    { titel: "Details", pagina: 0, y: 400, niveau: 3 },
    { titel: "Methode", pagina: 1, niveau: 1 },
  ],
});

/** Objecttekst (zonder stroom) van object `nr`. */
function objectTekst(pdf: string, nr: number) {
  const m = new RegExp(`\\n${nr} 0 obj\\n([\\s\\S]*?)\\n(?:stream|endobj)`).exec(pdf);
  return m?.[1] ?? "";
}
function stroomVan(pdf: Uint8Array, nr: number) {
  const tekst = latin1(pdf);
  const m = new RegExp(`\\n${nr} 0 obj\\n<<[^\\n]*?/Length (\\d+)[^\\n]*>>\\nstream\\n`).exec(tekst)!;
  const begin = m.index + m[0].length;
  return pdf.subarray(begin, begin + Number(m[1]));
}

describe("bladwijzers", () => {
  it("nesten volgens kopniveau, ook bij een sprong", () => {
    const boom = bladwijzerBoom([
      { titel: "A", pagina: 0, niveau: 1 },
      { titel: "A.1", pagina: 0, niveau: 2 },
      { titel: "A.1.1", pagina: 0, niveau: 3 },
      { titel: "A.2", pagina: 0, niveau: 2 },
      { titel: "B", pagina: 1, niveau: 1 },
      { titel: "B.x", pagina: 1, niveau: 3 },
    ]);
    expect(boom.map((k) => k.bladwijzer.titel)).toEqual(["A", "B"]);
    expect(boom[0].kinderen.map((k) => k.bladwijzer.titel)).toEqual(["A.1", "A.2"]);
    expect(boom[0].kinderen[0].kinderen[0].bladwijzer.titel).toBe("A.1.1");
    expect(boom[1].kinderen[0].bladwijzer.titel).toBe("B.x");
  });
  it("schrijft /First, /Last en /Count in de PDF", () => {
    const tekst = latin1(schrijfPdf(basis()));
    const outlines = /\/Outlines (\d+) 0 R/.exec(tekst)!;
    expect(objectTekst(tekst, Number(outlines[1]))).toContain("/Count 3");
    // Inleiding staat open (positieve Count), Achtergrond is ingeklapt (negatief).
    const inleiding = new RegExp(`\\d+ 0 obj\\n<< /Title ${pdfTekst("Inleiding")}[^\\n]*`).exec(tekst)![0];
    expect(inleiding).toContain("/Count 1");
    const achtergrond = new RegExp(`\\d+ 0 obj\\n<< /Title ${pdfTekst("Achtergrond")}[^\\n]*`).exec(tekst)![0];
    expect(achtergrond).toContain("/Count -1");
  });
});

describe("PDF/A-2b", () => {
  const pdf = schrijfPdf({ ...basis(), pdfa: true });
  const tekst = latin1(pdf);
  it("identificeert zich in XMP en heeft een OutputIntent met sRGB", () => {
    expect(tekst).toContain("<pdfaid:part>2</pdfaid:part>");
    expect(tekst).toContain("<pdfaid:conformance>B</pdfaid:conformance>");
    expect(tekst).toContain("/OutputIntents [<< /Type /OutputIntent /S /GTS_PDFA1");
    const nr = Number(/\/DestOutputProfile (\d+) 0 R/.exec(tekst)![1]);
    expect(unzlibSync(stroomVan(pdf, nr))).toEqual(srgbProfiel());
  });
  it("zet de afdrukvlag op koppelingen en houdt Info en XMP gelijk", () => {
    expect(tekst).toContain("/Subtype /Link /F 4");
    expect(tekst).toContain(`/Keywords ${pdfTekst("pdf, archief")}`);
    expect(tekst).toContain("<pdf:Keywords>pdf, archief</pdf:Keywords>");
    expect(tekst).toContain("/CreationDate (D:20261029090000Z)");
    expect(tekst).toContain("<xmp:CreateDate>2026-10-29T09:00:00Z</xmp:CreateDate>");
    expect(tekst).not.toContain("/Encrypt");
  });
  it("weigert PDF/A met wachtwoord", async () => {
    await expect(
      schrijfPdfBeveiligd(
        { ...basis(), pdfa: true },
        { openWachtwoord: "x", afdrukken: true, kopieren: true, wijzigen: true },
      ),
    ).rejects.toThrow();
  });
});

describe("sRGB-profiel", () => {
  it("heeft een geldige ICC-kop en tagtabel", () => {
    const p = srgbProfiel();
    const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
    expect(dv.getUint32(0)).toBe(p.length);
    expect(latin1(p.subarray(12, 24))).toBe("mntrRGB XYZ ");
    expect(latin1(p.subarray(36, 40))).toBe("acsp");
    const aantal = dv.getUint32(128);
    const tags = new Set<string>();
    for (let i = 0; i < aantal; i++) {
      const o = 132 + i * 12;
      tags.add(latin1(p.subarray(o, o + 4)));
      const begin = dv.getUint32(o + 4);
      expect(begin % 4).toBe(0);
      expect(begin + dv.getUint32(o + 8)).toBeLessThanOrEqual(p.length);
    }
    for (const t of ["desc", "cprt", "wtpt", "rXYZ", "gXYZ", "bXYZ", "rTRC", "gTRC", "bTRC"])
      expect(tags.has(t)).toBe(true);
  });
});

describe("wachtwoord en rechten (AES-256, R 6)", () => {
  it("berekent de rechtenwaarde volgens de specificatie", () => {
    const alles = rechtenWaarde({ afdrukken: true, kopieren: true, wijzigen: true });
    expect(alles & 4).toBe(4);
    expect(alles & 16).toBe(16);
    const niets = rechtenWaarde({ afdrukken: false, kopieren: false, wijzigen: false });
    expect(niets & (4 | 8 | 16 | 32 | 256 | 1024 | 2048)).toBe(0);
    expect(niets & 0xc0).toBe(0xc0);
    expect(niets).toBeLessThan(0);
    expect(heeftBeveiliging({ afdrukken: true, kopieren: true, wijzigen: true })).toBe(false);
    expect(heeftBeveiliging({ afdrukken: false, kopieren: true, wijzigen: true })).toBe(true);
  });

  it("versleutelt strings in woordenboeken en laat namen staan", async () => {
    const nep = async (d: Uint8Array) => new Uint8Array([...d].map((b) => b ^ 0xff));
    const uit = await versleutelStrings("<< /Title <FEFF0041> /URI (a\\(b\\)) /Kids [<< /X 1 >>] >>", nep);
    expect(uit).toBe("<< /Title <0100FFBE> /URI <9ED79DD6> /Kids [<< /X 1 >>] >>");
  });

  it("maakt een PDF die met het juiste wachtwoord te openen is", async () => {
    const pdf = await schrijfPdfBeveiligd(basis(), {
      openWachtwoord: "open sesam",
      rechtenWachtwoord: "eigenaar",
      afdrukken: true,
      kopieren: false,
      wijzigen: false,
    });
    const tekst = latin1(pdf);
    const encrypt = Number(/\/Encrypt (\d+) 0 R/.exec(tekst)![1]);
    const dict = objectTekst(tekst, encrypt);
    expect(dict).toContain("/V 5 /R 6");
    expect(dict).toContain("/CFM /AESV3");
    expect(tekst).toContain("/ExtensionLevel 8");
    // Geen leesbare tekst meer in strings.
    expect(tekst).not.toContain("openaec.org");
    expect(tekst).not.toContain(pdfTekst("Inleiding"));
    const u = vanHex(/\/U <([0-9A-F]+)>/.exec(dict)![1]);
    const o = vanHex(/\/O <([0-9A-F]+)>/.exec(dict)![1]);
    const ue = vanHex(/\/UE <([0-9A-F]+)>/.exec(dict)![1]);
    expect(u.length).toBe(48);
    // Algoritme 11: gebruikerswachtwoord controleren.
    const pw = wachtwoordBytes("open sesam");
    expect(await hash2B(pw, u.subarray(32, 40), new Uint8Array())).toEqual(u.subarray(0, 32));
    expect(await hash2B(wachtwoordBytes("fout"), u.subarray(32, 40), new Uint8Array())).not.toEqual(
      u.subarray(0, 32),
    );
    // Algoritme 12: eigenaarswachtwoord.
    expect(await hash2B(wachtwoordBytes("eigenaar"), o.subarray(32, 40), u)).toEqual(o.subarray(0, 32));
    // Bestandssleutel uit UE, daarmee de metadata ontsleutelen.
    const subtle = globalThis.crypto.subtle;
    const tussen = await hash2B(pw, u.subarray(40, 48), new Uint8Array());
    const k1 = await subtle.importKey("raw", tussen, "AES-CBC", false, ["decrypt", "encrypt"]);
    // UE is zonder opvulling versleuteld: voeg een geldig opvulblok toe om te kunnen ontsleutelen.
    const opvul = new Uint8Array(
      await subtle.encrypt({ name: "AES-CBC", iv: ue.subarray(16, 32) }, k1, new Uint8Array(0)),
    );
    const sleutel = new Uint8Array(
      await subtle.decrypt({ name: "AES-CBC", iv: new Uint8Array(16) }, k1, new Uint8Array([...ue, ...opvul])),
    );
    expect(sleutel.length).toBe(32);
    const metadataNr = Number(/\/Metadata (\d+) 0 R/.exec(tekst)![1]);
    const stroom = stroomVan(pdf, metadataNr);
    const k = await subtle.importKey("raw", sleutel, "AES-CBC", false, ["decrypt"]);
    const xmp = new Uint8Array(
      await subtle.decrypt({ name: "AES-CBC", iv: stroom.subarray(0, 16) }, k, stroom.subarray(16)),
    );
    expect(new TextDecoder().decode(xmp)).toContain("<dc:title>");
  });

  it("zonder beperkingen en zonder wachtwoord blijft de PDF onversleuteld", async () => {
    const pdf = await schrijfPdfBeveiligd(basis(), { afdrukken: true, kopieren: true, wijzigen: true });
    expect(latin1(pdf)).not.toContain("/Encrypt");
  });
});
