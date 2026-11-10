import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { exporteerMarkdown } from "../markdown";
import { controleerPakket } from "../pakketcontrole";
import { bereidOpenen } from "./openen";
import { htmlNaarModel, ontleedHtml } from "./htmlbestand";
import { markdownNaarModel } from "./markdownbestand";
import { rtfNaarModel } from "./rtfbestand";
import { leesTekst } from "./tekstbestand";
import { schrijfDocx } from "./docxschrijver";
import { zetTekstOm } from "./tekstimport";

const enc = (tekst: string) => new TextEncoder().encode(tekst);
const docXml = (bytes: Uint8Array) =>
  strFromU8(unzipSync(bytes)["word/document.xml"]);
const geenRuntime = async () => {
  throw new Error("geen runtime");
};
const png = readFileSync("src-tauri/icons/32x32.png");
const pngDataUrl =
  "data:image/png;base64," + Buffer.from(png).toString("base64");

describe("Tekst (TXT)", () => {
  it.each(["utf-16le", "utf-16be"] as const)(
    "geeft de BOM voorrang op de nulbyteheuristiek bij %s",
    async (codering) => {
      // U+4E00 bevat een nulbyte in de andere positie dan Latijnse tekst.
      const tekst = "一".repeat(64);
      const le = codering === "utf-16le";
      const bytes = new Uint8Array([
        ...(le ? [0xff, 0xfe] : [0xfe, 0xff]),
        ...Array.from(tekst).flatMap(() => (le ? [0x00, 0x4e] : [0x4e, 0x00])),
      ]);
      expect(leesTekst(bytes)).toMatchObject({ tekst, codering });
      for (const ext of ["txt", "md"]) {
        const geopend = (await bereidOpenen(`Proef.${ext}`, bytes, {
          converteer: geenRuntime,
        }))!;
        expect(docXml(geopend.bytes)).toContain(tekst);
        expect(geopend.rapport!.regels[0].gevolg).toContain(
          le ? "UTF-16 LE" : "UTF-16 BE",
        );
      }
    },
  );

  it("herkent Windows-1252, UTF-8 met BOM en UTF-16 en de regeleinden", () => {
    const cp1252 = leesTekst(
      new Uint8Array([0x63, 0x61, 0x66, 0xe9, 0x0d, 0x0a, 0x80]),
    );
    expect(cp1252).toMatchObject({
      tekst: "café\r\n€",
      codering: "windows-1252",
      regeleinde: "CRLF",
    });
    const bom = leesTekst(new Uint8Array([0xef, 0xbb, 0xbf, 0x61, 0x0a, 0x62]));
    expect(bom).toMatchObject({
      tekst: "a\nb",
      codering: "utf-8-bom",
      regeleinde: "LF",
    });
    const utf16 = new Uint8Array([0x68, 0, 0xeb, 0, 0x0d, 0, 0x6c, 0]);
    expect(leesTekst(utf16)).toMatchObject({
      tekst: "hë\rl",
      codering: "utf-16le",
      regeleinde: "CR",
    });
    expect(
      leesTekst(new Uint8Array([0, 0x68, 0, 0xeb, 0, 0x0d, 0, 0x6c])),
    ).toMatchObject({ tekst: "hë\rl", codering: "utf-16be", regeleinde: "CR" });
  });
  it("maakt van elke regel een alinea en bewaart tabs", () => {
    const { bytes, regels } = zetTekstOm(
      "txt",
      enc("Eerste\tregel\n\nDerde & <vierde>\n"),
    );
    const xml = docXml(bytes);
    expect(xml.match(/<w:p>/g)).toHaveLength(3);
    expect(xml).toContain("<w:tab/>");
    expect(xml).toContain("Derde &amp; &lt;vierde&gt;");
    expect(regels[0].gevolg).toContain("UTF-8");
  });
});

describe("Markdown", () => {
  const md = [
    "# Titel",
    "",
    "Tekst met **vet**, *cursief*, ~~weg~~, `code` en een [koppeling](https://example.org).",
    "",
    "- een",
    "  - genest",
    "- twee",
    "",
    "3. drie",
    "4. vier",
    "",
    "| Kolom A | Kolom B |",
    "|---|---|",
    "| 1 | 2 |",
    "",
    "```",
    "let x = 1;",
    "```",
    "",
    "> citaat",
    "",
    `![logo](${pngDataUrl}) ![extern](https://example.org/x.png)`,
    "",
    "[gevaarlijk](javascript:alert(1))",
  ].join("\n");

  it("zet koppen, opmaak, lijsten, tabellen, code, citaten en afbeeldingen om", () => {
    const { document, nietIngesloten } = markdownNaarModel(md);
    expect(document.blokken.map((b) => b.soort)).toEqual([
      "kop",
      "alinea",
      "lijst",
      "lijst",
      "tabel",
      "code",
      "citaat",
      "alinea",
      "alinea",
    ]);
    expect(nietIngesloten).toBe(1);
    const geordend = document.blokken[3];
    expect(geordend).toMatchObject({
      soort: "lijst",
      geordend: true,
      start: 3,
    });
  });

  it("levert een DOCX die de teksteditor-kern leest", async () => {
    const { bytes, regels } = zetTekstOm("md", enc(md));
    expect(controleerPakket(bytes, "docx").risicos).toEqual([]);
    const xml = docXml(bytes);
    expect(xml).toContain('w:val="Kop1"');
    expect(xml).toContain("<w:numPr>");
    expect(xml).toContain("<w:tbl>");
    expect(xml).not.toContain("javascript:");
    const pakket = unzipSync(bytes);
    expect(Object.keys(pakket)).toContain("word/media/image1.png");
    expect(strFromU8(pakket["word/_rels/document.xml.rels"])).toContain(
      "https://example.org",
    );
    expect(regels.map((r) => r.onderdeel)).toContain("Afbeeldingen");
    const terug = new TextDecoder().decode(
      (await exporteerMarkdown(bytes)).bytes,
    );
    expect(terug).toMatch(/^# .*Titel/m);
    expect(terug).toContain("**vet**");
    expect(terug).toMatch(/\| .*Kolom A.* \| .*Kolom B.* \|/);
    expect(terug).toMatch(/\[.*koppeling.*\]\(https:\/\/example\.org\)/);
    expect(terug).toMatch(/- een/);
  });
});

describe("HTML", () => {
  const html = `<!doctype html><html><head><title>Proef &amp; zo</title><style>p{color:red}</style>
    <script>alert("niet uitvoeren")</script></head><body>
    <h1>Kop <em>één</em></h1><p align=center>Alinea met <b>vet</b> en <a href="https://example.org" onclick="x()">link</a><br>regel 2
    <p style="font-weight:bold;color:#c00000">Rood</p>
    <ul><li>Een<li>Twee<ul><li>Diep</ul></ul>
    <table><tr><th>A<th>B</tr><tr><td>1<td colspan=2>2</table>
    <img src="${pngDataUrl}" alt="logo" width="16"><img src="https://tracker.example/p.gif">
    <pre>  code
  blok</pre><form><input type=checkbox checked></form></body></html>`;

  it("ontleedt tolerant en laat scripts en stijlen weg", () => {
    const boom = ontleedHtml(html);
    expect(JSON.stringify(boom)).not.toContain("niet uitvoeren");
    const { document, nietIngesloten, formulieren } = htmlNaarModel(html);
    expect(document.titel).toBe("Proef & zo");
    expect(nietIngesloten).toBe(1);
    expect(formulieren).toBeGreaterThan(0);
    const soorten = document.blokken.map((b) => b.soort);
    expect(soorten.slice(0, 4)).toEqual(["kop", "alinea", "alinea", "lijst"]);
    expect(soorten).toContain("tabel");
    expect(soorten).toContain("code");
    expect(document.blokken[1]).toMatchObject({ uitlijning: "midden" });
    const tabel = document.blokken.find((b) => b.soort === "tabel")!;
    expect(tabel).toMatchObject({ kop: true });
    if (tabel.soort === "tabel") expect(tabel.rijen[1]).toHaveLength(3);
  });

  it("levert een DOCX zonder actieve inhoud", () => {
    const { bytes } = zetTekstOm("html", enc(html));
    const xml = docXml(bytes);
    expect(xml).not.toMatch(/alert|onclick|tracker/);
    expect(xml).toContain('w:color w:val="C00000"');
    expect(xml).toContain("<w:drawing>");
  });

  it("leest een meta-charset", () => {
    const bytes = new Uint8Array([
      ...enc('<meta charset="windows-1252"><p>caf'),
      0xe9,
      ...enc("</p>"),
    ]);
    expect(docXml(zetTekstOm("htm", bytes).bytes)).toContain("café");
  });
});

describe("RTF", () => {
  const rtf = String.raw`{\rtf1\ansi\ansicpg1252\deff0{\fonttbl{\f0\fswiss Arial;}{\f1\fcharset238 Arial CE;}}
{\colortbl;\red192\green0\blue0;}
{\stylesheet{\s0 Normal;}{\s1\snext0 heading 1;}}
{\info{\title Geheim}{\author X}}
{\header \pard Koptekst\par}
\pard\s1 Hoofdstuk\par
\pard\qc Gewone {\b vet} {\i cursief} {\ul onder}\ulnone  {\cf1 rood} caf\'e9 \u8364?  {\f1 \'9a}\par
\pard Regel\line twee\tab tab{\super 2}\par
{\field{\*\fldinst HYPERLINK "https://example.org"}{\fldrslt {\ul Link}}}\par
\trowd\cellx1000\cellx2000\pard\intbl A1\cell B1\cell\row
\trowd\cellx1000\cellx2000\pard\intbl A2\cell B2\cell\row
\pard Na tabel{\footnote voetnoot}\par
{\*\shppict{\pict\pngblip\picwgoal480\pichgoal480 ${Buffer.from(png).toString("hex")}}}{\nonshppict{\pict\wmetafile8 0102}}\par
\page Laatste\par
}`;

  it("leest tekst, opmaak, koppen, tabellen, koppelingen en afbeeldingen", () => {
    const { document, overgeslagen } = rtfNaarModel(enc(rtf));
    const soorten = document.blokken.map((b) => b.soort);
    expect(soorten).toEqual([
      "kop",
      "alinea",
      "alinea",
      "alinea",
      "tabel",
      "alinea",
      "alinea",
      "pagina-einde",
      "alinea",
    ]);
    const tekst = JSON.stringify(document);
    expect(tekst).toContain("café €");
    expect(tekst).toContain("š");
    expect(tekst).not.toContain("Koptekst");
    expect(tekst).not.toContain("Geheim");
    expect(tekst).not.toContain("voetnoot");
    expect(overgeslagen).toMatchObject({
      "kop- en voetteksten": 1,
      "voet- of eindnoten": 1,
    });
    const tweede = document.blokken[1];
    expect(tweede).toMatchObject({ soort: "alinea", uitlijning: "midden" });
    if (tweede.soort === "alinea") {
      expect(tweede.inhoud).toContainEqual(
        expect.objectContaining({ tekst: "vet", vet: true }),
      );
      expect(tweede.inhoud).toContainEqual(
        expect.objectContaining({ tekst: "rood", kleur: "C00000" }),
      );
    }
    const link = document.blokken[3];
    if (link.soort === "alinea")
      expect(link.inhoud[0]).toMatchObject({
        tekst: "Link",
        link: "https://example.org",
      });
    const tabel = document.blokken[4];
    if (tabel.soort === "tabel") expect(tabel.rijen).toHaveLength(2);
    const afbeelding = document.blokken[6];
    if (afbeelding.soort === "alinea")
      expect(afbeelding.inhoud[0]).toMatchObject({
        soort: "afbeelding",
        type: "png",
        breedte: 32,
      });
  });

  it("levert een geldige DOCX en meldt wat is overgeslagen", () => {
    const { bytes, regels } = zetTekstOm("rtf", enc(rtf));
    expect(controleerPakket(bytes, "docx").onderdelen).toBeGreaterThan(5);
    expect(regels.map((r) => r.onderdeel)).toContain("Kop- en voetteksten");
  });

  it("weigert iets dat geen RTF is", () => {
    expect(() => rtfNaarModel(enc("hallo"))).toThrow("RTF");
  });
});

describe("Openen zonder runtime", () => {
  it("opent TXT en MD als nieuwe DOCX-kopie met rapport", async () => {
    const txt = (await bereidOpenen("Notitie.txt", enc("Hallo"), {
      converteer: geenRuntime,
    }))!;
    expect(txt).toMatchObject({
      soort: "docx",
      naam: "Notitie.docx",
      gewijzigd: true,
      exportFormaat: "txt",
    });
    expect(txt.rapport!.kop).toContain("bewerkbare .docx-kopie");
    const md = (await bereidOpenen("Lees.markdown", enc("# Kop"), {
      converteer: geenRuntime,
    }))!;
    expect(md.exportFormaat).toBe("md");
  });
  it("valt voor RTF terug op de eigen lezer als de runtime faalt", async () => {
    const rtf = (await bereidOpenen(
      "Brief.rtf",
      enc(String.raw`{\rtf1 Hallo\par}`),
      {
        converteer: geenRuntime,
        runtimeBeschikbaar: async () => true,
      },
    ))!;
    expect(rtf.rapport!.regels[0].onderdeel).toBe("Kantoorruntime");
    expect(docXml(rtf.bytes)).toContain("Hallo");
  });
  it("gebruikt voor HTML de runtime als die er is", async () => {
    const omgezet = schrijfDocx({
      blokken: [
        { soort: "alinea", inhoud: [{ soort: "tekst", tekst: "via runtime" }] },
      ],
    });
    const html = (await bereidOpenen("Pagina.html", enc("<p>x"), {
      converteer: async () => omgezet,
      runtimeBeschikbaar: async () => true,
    }))!;
    expect(html.bytes).toBe(omgezet);
    expect(html.rapport!.regels[0].onderdeel).toBe("Omzetting");
  });
});

describe("Opslaan als HTML en TXT zonder runtime", () => {
  it("sluit afbeeldingen in de HTML in en kiest de codering van TXT", async () => {
    const { maakExport } = await import("../export");
    const docx = zetTekstOm(
      "md",
      enc(`# Kop\n\nCafé ![logo](${pngDataUrl})\n`),
    ).bytes;
    const html = new TextDecoder().decode(
      (await maakExport("docx", "html", docx, "Proef")).bytes,
    );
    expect(html).toMatch(/<img [^>]*src="data:image\/png;base64,/);
    const txt = await maakExport("docx", "txt", docx, "Proef", {
      codering: "windows-1252",
    });
    expect([...txt.bytes]).toContain(0xe9);
    expect(new TextDecoder("windows-1252").decode(txt.bytes)).toContain("Café");
  });
});
