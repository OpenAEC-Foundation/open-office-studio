import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import * as xlsx from "@betteroffice/xlsx";
import * as pptx from "@betteroffice/pptx";
import {
  cellenNaarCsv,
  codeer,
  neutraliseer,
  celPositie,
  type CsvCel,
} from "./csv";
import { htmlDocument, htmlNaarTekst, markdownNaarHtml } from "./html";
import { maakExport } from "./index";
import catalogus from "../formaten.json";
import {
  GROEPEN,
  kiesRoute,
  uitvoerformaten,
  uitvoerlijst,
  type Groep,
} from "../formaten";

const cel = (
  a1: string,
  value: CsvCel["value"],
  extra: Partial<CsvCel> = {},
): CsvCel => ({
  anchor: { a1 },
  value,
  displayText: "value" in value ? String(value.value) : "",
  numberFormat: "General",
  ...extra,
});
const tekst = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("CSV-export", () => {
  it("gebruikt puntkomma, decimale komma en CRLF voor Nederlandse instellingen", () => {
    const csv = cellenNaarCsv([
      cel("A1", { kind: "text", value: "Materiaal" }),
      cel("B1", { kind: "text", value: "Prijs" }),
      cel("A2", { kind: "text", value: "Hout; berken" }),
      cel("B2", { kind: "number", value: 38.5 }),
      cel("D3", { kind: "bool", value: true }),
    ]);
    expect(csv).toBe(
      'Materiaal;Prijs;;\r\n"Hout; berken";38,5;;\r\n;;;WAAR\r\n',
    );
  });
  it("gebruikt een punt als decimaalteken bij een komma-scheiding", () => {
    expect(
      cellenNaarCsv([cel("A1", { kind: "number", value: 1.25 })], {
        scheidingsteken: ",",
      }),
    ).toBe("1.25\r\n");
  });
  it("maakt formule-injectie onschadelijk, maar laat echte getallen staan", () => {
    expect(neutraliseer('=HYPERLINK("x")')).toBe('\'=HYPERLINK("x")');
    for (const gevaarlijk of ["+1", "-2+3", "@SUM(A1)", "\tA", "\rA"])
      expect(neutraliseer(gevaarlijk).startsWith("'")).toBe(true);
    const csv = cellenNaarCsv([
      cel("A1", { kind: "text", value: "=1+1" }),
      cel("B1", { kind: "number", value: -5 }),
    ]);
    expect(csv).toBe("'=1+1;-5\r\n");
  });
  it("zet aanhalingstekens en regeleinden correct tussen quotes", () => {
    expect(
      cellenNaarCsv([cel("A1", { kind: "text", value: 'zei "ja"\nklaar' })]),
    ).toBe('"zei ""ja""\nklaar"\r\n');
  });
  it("gebruikt de weergegeven tekst voor datums", () => {
    expect(
      cellenNaarCsv([
        cel(
          "A1",
          { kind: "number", value: 45000 },
          {
            numberFormat: "dd-mm-yyyy",
            displayText: "15-03-2023",
          },
        ),
      ]),
    ).toBe("15-03-2023\r\n");
  });
  it("codeert als UTF-8 met BOM, UTF-8 of Windows-1252", () => {
    expect([...codeer("é").bytes]).toEqual([0xef, 0xbb, 0xbf, 0xc3, 0xa9]);
    expect([...codeer("é", "utf8").bytes]).toEqual([0xc3, 0xa9]);
    const ansi = codeer("€ é ✓", "windows-1252");
    expect([...ansi.bytes]).toEqual([0x80, 0x20, 0xe9, 0x20, 0x3f]);
    expect(ansi.vervangen).toBe(1);
  });
  it("leest celadressen", () => {
    expect(celPositie("A1")).toEqual({ rij: 0, kolom: 0 });
    expect(celPositie("AB12")).toEqual({ rij: 11, kolom: 27 });
    expect(celPositie("1A")).toBeNull();
  });
});

describe("HTML-export", () => {
  it("saneert ruwe HTML en onveilige links", () => {
    const html = markdownNaarHtml(
      "# Kop\n\n<script>alert(1)</script>\n\n[klik](javascript:alert(1)) <img src=x onerror=alert(1)>\n\n| a | b |\n| - | - |\n| 1 | 2 |",
    );
    expect(html).toContain("<h1>Kop</h1>");
    expect(html).toContain("<table>");
    expect(html).not.toMatch(/<script|onerror|javascript:/i);
  });
  it("maakt een zelfstandig document met een strikt inhoudsbeleid", () => {
    const html = htmlDocument("<Titel>", "<p>x</p>");
    expect(html).toContain("<title>&lt;Titel&gt;</title>");
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/<script/i);
  });
  it("haalt leesbare tekst uit de HTML", () => {
    expect(
      htmlNaarTekst(
        "<h1>Kop</h1><p>A &amp; B&#x27;s</p><table><tr><td>1</td><td>2</td></tr></table>",
      ),
    ).toBe("Kop\nA & B's\n1\t2\n");
  });
});

describe("Exports uit de engines met de eigen voorbeelden", () => {
  beforeAll(async () => {
    await xlsx.initWasm(
      readFileSync(
        "node_modules/@betteroffice/xlsx/dist/generated/xlsx_wasm_bg.wasm",
      ),
    );
    await pptx.initWasm(
      readFileSync(
        "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
      ),
    );
  });
  // Zoals in de editor: de engine bewaart de berekende uitkomsten mee.
  const werkmap = () => {
    const handle = xlsx.openWorkbook(
      readFileSync("docs/voorbeelden/Materiaaloverzicht.xlsx"),
    );
    try {
      return handle.save();
    } finally {
      handle.dispose();
    }
  };
  it("rekenblad als CSV met totaal 3068 en neutrale tekst", async () => {
    const uit = await maakExport(
      "xlsx",
      "csv",
      werkmap(),
      "Materiaaloverzicht",
      { blad: 0 },
    );
    const csv = tekst(uit.bytes);
    expect(uit.bytes.slice(0, 3)).toEqual(new Uint8Array([0xef, 0xbb, 0xbf]));
    expect(csv).toContain(
      "Nr.;Materiaal;Categorie;Aantal;Eenheid;Prijs per eenheid;Totaal;Beschikbaarheid",
    );
    expect(csv).toContain(
      "01;Multiplex berken;Plaatmateriaal;24;m²;38,5;924;Beschikbaar",
    );
    expect(csv).toMatch(/;Totaal materiaal;;;;;3068;/);
  });
  it("berekent formules zonder opgeslagen uitkomst bij CSV-export", async () => {
    const handle = xlsx.openWorkbook(
      readFileSync("public/templates/nieuw.xlsx"),
    );
    try {
      handle.editCell(0, 0, 0, "=1+1");
      const delen = unzipSync(handle.save());
      const pad = "xl/worksheets/sheet1.xml";
      const xml = strFromU8(delen[pad]);
      let gevonden = false;
      delen[pad] = strToU8(
        xml.replace(
          /(<c\b[^>]*\br="A1"[^>]*>)(.*?)(<\/c>)/,
          (cel, open, inhoud, dicht) => {
            if (!inhoud.includes("<f>1+1</f>")) return cel;
            gevonden = true;
            return `${open}${inhoud.replace(/<v>[^<]*<\/v>/, "")}${dicht}`;
          },
        ),
      );
      expect(gevonden).toBe(true);

      const uit = await maakExport(
        "xlsx",
        "csv",
        zipSync(delen),
        "Rekenblad",
        { blad: 0 },
      );
      expect(tekst(uit.bytes)).toBe("2\r\n");
    } finally {
      handle.dispose();
    }
  });
  it("rekenblad als TSV en Markdown", async () => {
    const tsv = tekst((await maakExport("xlsx", "tsv", werkmap(), "M")).bytes);
    expect(tsv).toContain("Nr.\tMateriaal\t");
    expect(tsv).toContain("\t924\t");
    const md = tekst((await maakExport("xlsx", "md", werkmap(), "M")).bytes);
    expect(md).toContain("## Materialen");
    expect(md).not.toContain("xlsx-export:");
    expect(md).toContain(">€ 3,068.00<");
  });
  it("rekenblad als HTML-tabel en als PNG", async () => {
    const html = tekst(
      (await maakExport("xlsx", "html", werkmap(), "M")).bytes,
    );
    expect(html).toContain('colspan="8"');
    expect(html).toContain("Multiplex berken");
    expect(html).toContain(">€ 924.00<");
    expect(html).toContain(">€ 3,068.00<");
    expect(html).not.toMatch(/<script/i);
    const png = (await maakExport("xlsx", "png", werkmap(), "M", { blad: 0 }))
      .bytes;
    expect([...png.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
  it("tekstdocument als HTML en platte tekst", async () => {
    const bytes = readFileSync("docs/voorbeelden/Ontwerpnotitie.docx");
    const html = tekst(
      (await maakExport("docx", "html", bytes, "Ontwerpnotitie")).bytes,
    );
    expect(html).toContain("<h1><strong>Drie uitgangspunten</strong></h1>");
    expect(html).toContain("<table>");
    const txt = tekst(
      (await maakExport("docx", "txt", bytes, "Ontwerpnotitie")).bytes,
    );
    expect(txt).toContain("Ruimte voor ideeën.");
    expect(txt).toContain("01\tMaak ruimte");
    expect(txt).not.toContain("**");
  });
  it("presentatie als Markdown en HTML met Nederlandse diakoppen", async () => {
    const bytes = readFileSync("docs/voorbeelden/Ontwerpvisie.pptx");
    const md = tekst(
      (await maakExport("pptx", "md", bytes, "Ontwerpvisie")).bytes,
    );
    expect(md).toContain("## Dia 1");
    expect(md).toContain("Samen ruimte");
    expect(md).not.toContain("pptx-export:");
    const html = tekst(
      (await maakExport("pptx", "html", bytes, "Ontwerpvisie")).bytes,
    );
    expect(html).toContain("<h2>Dia 2</h2>");
  });
});

describe("Formaatcatalogus", () => {
  it("is consistent: eigen formaat, geldige groep en route, filter bij runtime", () => {
    for (const soort of ["docx", "xlsx", "pptx"] as const) {
      const lijst = uitvoerlijst(soort);
      expect(lijst.find((f) => f.ext === soort)?.groep).toBe("eigen");
      for (const formaat of lijst) {
        expect(Object.keys(GROEPEN)).toContain(formaat.groep as Groep);
        expect(["engine", "runtime"]).toContain(formaat.route);
        expect(formaat.naam.length).toBeGreaterThan(2);
        expect(formaat.behoud.length).toBeGreaterThan(2);
        if (formaat.route === "runtime") expect(formaat.filter).toBeTruthy();
        expect(formaat.ext).toMatch(/^[a-z0-9]+$/);
      }
      // Het eigen formaat moet ook via de runtime kunnen (import van varianten).
      expect(lijst.find((f) => f.ext === soort)?.filter).toBeTruthy();
      expect(catalogus[soort].invoer).toContain(soort);
    }
  });
  it("biedt zonder runtime alleen routes van de app zelf", () => {
    for (const soort of ["docx", "xlsx", "pptx"] as const)
      for (const formaat of uitvoerlijst(soort)) {
        const route = kiesRoute(formaat, false);
        if (route) expect(route).not.toBe("runtime");
        expect(kiesRoute(formaat, true)).not.toBeNull();
      }
    expect(uitvoerformaten("xlsx", false)).toEqual(
      expect.arrayContaining([
        "xlsx",
        "csv",
        "tsv",
        "md",
        "html",
        "png",
        "pdf",
      ]),
    );
    expect(uitvoerformaten("pptx", false)).toEqual(
      expect.arrayContaining(["pptx", "md", "html", "png", "pdf"]),
    );
    expect(uitvoerformaten("docx", false)).toEqual(
      expect.arrayContaining(["docx", "md", "txt", "html", "pdf"]),
    );
  });
  it("neemt macroformaten alleen op als eigen route met VBA-behoud", () => {
    const macro = { docx: "docm", xlsx: "xlsm", pptx: "pptm" } as const;
    for (const soort of ["docx", "xlsx", "pptx"] as const) {
      const formaten = uitvoerlijst(soort).filter((f) => f.groep === "macro");
      expect(formaten.map((f) => f.ext)).toEqual([macro[soort]]);
      // Zonder runtimefilter: de app zet het VBA-project zelf terug.
      expect(formaten[0]).toMatchObject({ route: "engine" });
      expect(formaten[0].filter).toBeUndefined();
    }
  });
});

describe("nalaadfouten", () => {
  it("herkent een onderdeel dat niet meer van de server komt", async () => {
    const { isNalaadfout } = await import("./bewaar");
    expect(
      isNalaadfout(
        new TypeError(
          "Failed to fetch dynamically imported module: http://localhost:4330/assets/index-CUxCrpfw.js",
        ),
      ),
    ).toBe(true);
    expect(
      isNalaadfout(new TypeError("Importing a module script failed.")),
    ).toBe(true);
    expect(isNalaadfout(new Error("Het bestand is te groot."))).toBe(false);
  });
});

describe("PDF zonder runtime", () => {
  it("leest documenteigenschappen voor de PDF-metadata", async () => {
    const { documentEigenschappen } = await import("./index");
    const eigenschappen = documentEigenschappen(
      new Uint8Array(readFileSync("docs/voorbeelden/Ontwerpnotitie.docx")),
    );
    expect(eigenschappen.titel).toBe("Ruimte voor ideeën");
    expect(eigenschappen.auteur).toBeUndefined();
    expect(documentEigenschappen(new Uint8Array([1, 2, 3]))).toEqual({});
  });
  it("vraagt om de geopende editor", async () => {
    await expect(
      maakExport("docx", "pdf", new Uint8Array(), "Proef"),
    ).rejects.toThrow(/editor/);
  });
});
