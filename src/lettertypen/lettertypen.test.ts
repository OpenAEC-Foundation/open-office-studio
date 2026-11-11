import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import * as fonts from "@betteroffice/fonts";
import {
  VERVANGINGEN,
  lettertypenInDocument,
  vervangerVoor,
  vervangingsMelding,
} from "./vervanging";
import { maakLettertypeBron } from "./provider";
import { lettertypeGroepen } from "./LettertypeKeuze";
import {
  CATALOGUS,
  EXTRA_FACES,
  extraFace,
  familieInfo,
  isExtraFamilie,
} from "./catalogus";
import { vermelding } from "./voorbeeld";
import { selectieUitVerhaal, woordBijCursor } from "./koppeling";
import { citeerFamilies } from "./canvasFont";
import { documentLettertypen } from "./document";
import manifest from "../../assets/lettertypen.json";

const voorbeeld = (naam: string) =>
  new Uint8Array(readFileSync(`docs/voorbeelden/${naam}`));
const gebundeld = (f: string) => fonts.resolveMetricCompatFamily(f);
const gebundeldExact = (f: string) =>
  fonts.BUNDLED_FONTS.some((b) => b.family.toLowerCase() === f.toLowerCase()) ||
  isExtraFamilie(f);

describe("lettertypen in een document", () => {
  it.each([
    ["word/footnotes.xml", '<w:footnotes><w:rFonts w:ascii="Noot Serif"/></w:footnotes>'],
    ["word/endnotes.xml", '<w:endnotes><w:rFonts w:hAnsi="Noot Serif"/></w:endnotes>'],
    ["word/comments.xml", '<w:comments><w:rFonts w:ascii="Noot Serif"/></w:comments>'],
    ["ppt/notesSlides/notesSlide1.xml", '<p:notes><a:latin typeface="Noot Serif"/></p:notes>'],
    ["ppt/notesMasters/notesMaster1.xml", '<p:notesMaster><a:latin typeface="Noot Serif"/></p:notesMaster>'],
  ])("vindt een lettertype dat alleen in %s staat", (pad, xml) => {
    expect(lettertypenInDocument(zipSync({ [pad]: strToU8(xml) }))).toEqual(["Noot Serif"]);
  });
  it("meldt ook ontbrekende nootlettertypen en behoudt de pakketbytes", async () => {
    const bytes = zipSync({
      "word/document.xml": strToU8('<w:document><w:rFonts w:ascii="Inter"/></w:document>'),
      "word/footnotes.xml": strToU8('<w:footnotes><w:rFonts w:ascii="Unieke Noot Serif"/></w:footnotes>'),
      "word/endnotes.xml": strToU8('<w:endnotes><w:rFonts w:hAnsi="unieke noot serif"/></w:endnotes>'),
      "word/fontTable.xml": strToU8('<w:fonts><w:font w:name="Ongebruikt"/></w:fonts>'),
      "word/media/plaatje.svg": strToU8('<svg><w:rFonts w:ascii="Geen tekstfont"/></svg>'),
    });
    const origineel = bytes.slice();
    const info = await documentLettertypen(bytes);
    expect(info.namen).toEqual(["Inter", "Unieke Noot Serif"]);
    expect(info.vervangingen).toEqual([
      { origineel: "Unieke Noot Serif", vervanger: "Liberation Serif", soort: "benadering" },
    ]);
    expect(vervangingsMelding(info.vervangingen)).toContain("Unieke Noot Serif → Liberation Serif");
    expect(bytes).toEqual(origineel);
  });
  it("vindt de lettertypen van tekst, rekenblad en presentatie", () => {
    expect(
      lettertypenInDocument(voorbeeld("Ontwerpnotitie.docx")).length,
    ).toBeGreaterThan(0);
    expect(
      lettertypenInDocument(voorbeeld("Materiaaloverzicht.xlsx")),
    ).toContain("Calibri");
    expect(
      lettertypenInDocument(voorbeeld("Ontwerpvisie.pptx")).length,
    ).toBeGreaterThan(0);
    expect(lettertypenInDocument(new Uint8Array([1, 2, 3]))).toEqual([]);
  });
  it("slaat themaplaatshouders over", () => {
    const z = unzipSync(voorbeeld("Ontwerpvisie.pptx"));
    const dia = Object.keys(z).find((n) =>
      /^ppt\/slides\/slide\d+\.xml$/.test(n),
    )!;
    z[dia] = strToU8(
      strFromU8(z[dia]).replace(
        "</p:sld>",
        '<!-- <a:latin typeface="+mn-lt"/> --></p:sld>',
      ),
    );
    expect(lettertypenInDocument(zipSync(z))).not.toContain("+mn-lt");
  });
});

describe("vervanging van ontbrekende lettertypen", () => {
  const nergens = () => false;
  it("kiest metrisch gelijke open lettertypen", () => {
    expect(vervangerVoor("Calibri", nergens, gebundeld)).toEqual({
      origineel: "Calibri",
      vervanger: "Carlito",
      soort: "metrisch",
    });
    expect(vervangerVoor("Cambria", nergens, gebundeld)?.vervanger).toBe(
      "Caladea",
    );
    expect(vervangerVoor("Arial", nergens, gebundeld)?.vervanger).toBe(
      "Liberation Sans",
    );
    expect(
      vervangerVoor("Times New Roman", nergens, gebundeld)?.vervanger,
    ).toBe("Liberation Serif");
    expect(vervangerVoor("Courier New", nergens, gebundeld)?.vervanger).toBe(
      "Liberation Mono",
    );
    expect(vervangerVoor("Georgia", nergens, gebundeld)?.vervanger).toBe(
      "Gelasio",
    );
    expect(vervangerVoor("Segoe UI", nergens, gebundeld)).toMatchObject({
      vervanger: "Selawik",
      soort: "metrisch",
    });
    expect(vervangerVoor("Comic Sans MS", nergens, gebundeld)).toMatchObject({
      vervanger: "Comic Relief",
      soort: "metrisch",
    });
    expect(vervangerVoor("Helvetica", nergens, gebundeld)?.vervanger).toBe(
      "Liberation Sans",
    );
  });
  it("noemt benaderingen apart", () => {
    expect(vervangerVoor("Consolas", nergens, gebundeld)).toMatchObject({
      vervanger: "JetBrains Mono",
      soort: "benadering",
    });
    expect(vervangerVoor("Garamond", nergens, gebundeld)).toMatchObject({
      vervanger: "EB Garamond",
      soort: "benadering",
    });
    expect(vervangerVoor("Verdana", nergens, gebundeld)?.soort).toBe(
      "benadering",
    );
    expect(vervangerVoor("Calibri", nergens, gebundeld)?.vervanger).toBe(
      "Carlito",
    );
    expect(vervangerVoor("Cambria", nergens, gebundeld)?.vervanger).toBe(
      "Caladea",
    );
  });
  it("vervangt niets wat op deze computer of in de app staat", () => {
    expect(
      vervangerVoor("Calibri", (f) => f === "Calibri", gebundeld),
    ).toBeNull();
    expect(vervangerVoor("Inter", gebundeldExact, gebundeld)).toBeNull();
    expect(vervangerVoor("Lato", gebundeldExact, gebundeld)).toBeNull();
  });
  it("valt terug op een benadering met of zonder schreef", () => {
    expect(
      vervangerVoor("Onbekende Grotesk", nergens, gebundeld),
    ).toMatchObject({
      vervanger: "Liberation Sans",
      soort: "benadering",
    });
    expect(vervangerVoor("Minion Pro", nergens, gebundeld)?.vervanger).toBe(
      "Liberation Serif",
    );
  });
  it("noemt alleen vervangers die worden meegeleverd", () => {
    for (const { vervanger } of Object.values(VERVANGINGEN))
      expect(gebundeldExact(vervanger)).toBe(true);
  });
  it("meldt wat er is vervangen", () => {
    expect(vervangingsMelding([])).toBeNull();
    const melding = vervangingsMelding([
      { origineel: "Calibri", vervanger: "Carlito", soort: "metrisch" },
      { origineel: "Segoe UI", vervanger: "Open Sans", soort: "benadering" },
    ])!;
    expect(melding).toContain(
      "metrisch gelijk (zelfde regelval): Calibri → Carlito",
    );
    expect(melding).toContain(
      "benadering (regels en pagina's kunnen verschuiven): Segoe UI → Open Sans",
    );
    expect(melding).toContain("oorspronkelijke namen");
    expect(
      vervangingsMelding([
        { origineel: "Arial", vervanger: "Liberation Sans", soort: "metrisch" },
      ]),
    ).not.toContain("benadering");
  });
});

describe("lettertypebron voor de engines", () => {
  const bron = maakLettertypeBron({ baseUrl: "http://localhost/fonts/" });
  it("geeft meegeleverde en metrisch gelijke lettertypen", () => {
    expect(bron.resolveFamily("Inter", false, false)).toBeTypeOf("function");
    expect(bron.resolve("Calibri", true, false)).toBeTypeOf("function");
  });
  it("gebruikt de eigen vervangingstabel als laatste redmiddel", () => {
    expect(bron.resolveLastResort("Segoe UI", false, false)).toBeTypeOf(
      "function",
    );
    expect(bron.resolveFamily("Niet Aanwezig", false, false)).toBeUndefined();
  });
});

describe("extra lettertypen (manifest)", () => {
  type Bestand = {
    bestand: string;
    gewicht: number;
    stijl: string;
    url: string;
    sha256: string;
    grootte: number;
    archief?: string;
    archiefSha256?: string;
  };
  type Familie = {
    familie: string;
    categorie: string;
    licentie: string;
    bron: string;
    licentiebestand: { url: string; sha256: string };
    bestanden: Bestand[];
  };
  const families = (manifest as { families: Familie[] }).families;
  it("heeft per bestand een vaste bron, hash, licentie en licentietekst", () => {
    for (const f of families) {
      expect(["OFL-1.1", "Apache-2.0"]).toContain(f.licentie);
      expect(f.licentiebestand.url).toMatch(
        /^https:\/\/(raw\.githubusercontent\.com|github\.com)\//,
      );
      expect(f.licentiebestand.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect([
        "schreefloos",
        "schreef",
        "monospace",
        "handschrift",
        "display",
      ]).toContain(f.categorie);
      for (const b of f.bestanden) {
        expect(b.sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(b.bestand).toMatch(/\.(ttf|otf)$/);
        expect(b.grootte).toBeGreaterThan(1000);
        // Een vaste commit (40 tekens) of een release, nooit een tak.
        expect(b.url).toMatch(/\/[0-9a-f]{40}\/|\/releases\/download\//);
        if (b.archief) expect(b.archiefSha256).toMatch(/^[0-9a-f]{64}$/);
      }
      expect(
        f.bestanden.some((b) => b.gewicht === 400 && b.stijl === "normal"),
      ).toBe(true);
    }
  });
  it("registreert elk extra lettertype via precies één manifestregel", () => {
    const bestanden = families.flatMap((f) =>
      f.bestanden.map((b) => b.bestand),
    );
    expect(new Set(bestanden).size).toBe(bestanden.length);
    expect(EXTRA_FACES.map((f) => f.file).sort()).toEqual(
      [...bestanden].sort(),
    );
    for (const face of EXTRA_FACES) {
      const regel = families.find((f) => f.familie === face.family)!;
      expect(regel.bestanden.find((b) => b.bestand === face.file)?.sha256).toBe(
        face.sha256,
      );
    }
    for (const info of CATALOGUS) {
      if (info.herkomst === "extra")
        expect(families.some((f) => f.familie === info.familie)).toBe(true);
      else
        expect(fonts.BUNDLED_FONTS.some((b) => b.family === info.familie)).toBe(
          true,
        );
    }
  });
  it("bevat de gevraagde families en geen dubbele met de meegeleverde set", () => {
    for (const naam of [
      "Lato",
      "Noto Sans",
      "IBM Plex Sans",
      "Source Serif 4",
      "EB Garamond",
      "JetBrains Mono",
      "Fira Code",
      "Selawik",
      "Comic Neue",
      "Atkinson Hyperlegible",
    ])
      expect(isExtraFamilie(naam)).toBe(true);
    for (const f of families)
      expect(fonts.BUNDLED_FONTS.some((b) => b.family === f.familie)).toBe(
        false,
      );
    expect(familieInfo("selawik")?.metrischVoor).toBe("Segoe UI");
    expect(familieInfo("Inter")?.herkomst).toBe("meegeleverd");
  });
  it("vindt exacte stijlen en laat ontbrekende stijlen aan de browser", () => {
    expect(extraFace("Lato", true, true)?.file).toBe("Lato-BoldItalic.ttf");
    expect(extraFace("Fira Code", false, true)).toBeUndefined();
  });
  it("geeft een licentievermelding", () => {
    expect(vermelding({ familie: "Lato", herkomst: "extra" })).toContain(
      "SIL Open Font License 1.1",
    );
    expect(
      vermelding({
        familie: "Calibri",
        herkomst: "office",
        vervanger: "Carlito",
        metrisch: true,
      }),
    ).toContain("metrisch gelijk");
  });
});

describe("lettertypebron met extra lettertypen", () => {
  const bron = maakLettertypeBron({ baseUrl: "http://localhost/fonts/" });
  it("levert extra families bij naam en Segoe UI via Selawik", () => {
    expect(bron.resolveFamily("Lato", true, false)).toBeTypeOf("function");
    expect(bron.resolveFamily("Fira Code", false, true)).toBeUndefined();
    expect(bron.resolve("Fira Code", false, true)).toBeTypeOf("function");
    expect(bron.resolve("Segoe UI", false, false)).toBeTypeOf("function");
  });
  it("haalt een extra lettertype op relatief aan de basis", async () => {
    const gevraagd: string[] = [];
    const oud = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      gevraagd.push(String(url));
      return new Response(new Uint8Array([0, 1, 0, 0]));
    }) as typeof fetch;
    try {
      const b = maakLettertypeBron({
        baseUrl: "http://localhost/werkplek/app/office/fonts/",
      });
      await b.resolveFamily("JetBrains Mono", false, false)!();
    } finally {
      globalThis.fetch = oud;
    }
    expect(gevraagd).toEqual([
      "http://localhost/werkplek/app/office/fonts/extra/JetBrainsMono-Regular.ttf",
    ]);
  });
});

describe("lettertypekeuze", () => {
  it("groepeert in dit document, recent, categorieën en systeem", () => {
    const groepen = lettertypeGroepen({
      document: ["Calibri", "Lato"],
      recent: ["Inter"],
      engine: ["Arial"],
      systeem: ["DejaVu Sans", "Inter"],
    });
    expect(groepen.map((g) => g.naam)).toEqual([
      "In dit document",
      "Recent gebruikt",
      "Schreefloos",
      "Schreef",
      "Monospace",
      "Handschrift en display",
      "Op deze computer",
    ]);
    const van = (naam: string) =>
      groepen.find((g) => g.naam === naam)!.regels.map((r) => r.familie);
    expect(van("In dit document")).toEqual(["Calibri", "Lato"]);
    expect(van("Recent gebruikt")).toEqual(["Inter"]);
    expect(van("Schreefloos")).toEqual(
      expect.arrayContaining([
        "Lato",
        "Inter",
        "Calibri",
        "Arial",
        "Selawik",
        "Noto Sans",
      ]),
    );
    expect(van("Schreef")).toEqual(
      expect.arrayContaining(["EB Garamond", "Gelasio", "Cambria", "Georgia"]),
    );
    expect(van("Monospace")).toEqual(
      expect.arrayContaining(["JetBrains Mono", "Fira Code", "Courier New"]),
    );
    expect(van("Handschrift en display")).toEqual(
      expect.arrayContaining([
        "Comic Neue",
        "Playfair Display",
        "Comic Sans MS",
      ]),
    );
    // Meegeleverd gaat voor systeem: Inter staat niet nog eens onder "Op deze computer".
    expect(van("Op deze computer")).toEqual(["DejaVu Sans"]);
    const schreefloos = van("Schreefloos");
    expect(schreefloos).toEqual(
      [...schreefloos].sort((a, b) => a.localeCompare(b)),
    );
    const calibri = groepen
      .find((g) => g.naam === "Schreefloos")!
      .regels.find((r) => r.familie === "Calibri");
    expect(calibri).toMatchObject({
      herkomst: "office",
      vervanger: "Carlito",
      metrisch: true,
    });
  });
  it("filtert op zoektekst zonder dubbelingen binnen een groep", () => {
    const groepen = lettertypeGroepen({
      document: ["Lato", "lato"],
      zoek: "lat",
    });
    expect(
      groepen.map((g) => [g.naam, g.regels.map((r) => r.familie)]),
    ).toEqual([
      ["In dit document", ["Lato"]],
      ["Schreefloos", ["Lato"]],
    ]);
    expect(lettertypeGroepen({ zoek: "bestaat-niet" })).toEqual([]);
  });
  it("haalt de selectie uit een presentatieverhaal", () => {
    expect(selectieUitVerhaal("Samen ruimte\nmaken.", 6, 0)).toBe("Samen ");
    expect(selectieUitVerhaal("Samen ruimte\nmaken.", 8, 8)).toBe("ruimte");
  });
  it("vindt het woord bij de cursor", () => {
    expect(woordBijCursor("Een voorbe", "eld hier")).toBe("voorbeeld");
    expect(woordBijCursor("Klaar. ", "")).toBe("");
  });
});

describe("canvaslettertype met een getal in de naam", () => {
  it("zet familienamen tussen aanhalingstekens", () => {
    expect(citeerFamilies("bold 30px Source Serif 4, serif")).toBe(
      'bold 30px "Source Serif 4", serif',
    );
    expect(citeerFamilies("italic 700 12.5px/1.2 Source Sans 3")).toBe(
      'italic 700 12.5px/1.2 "Source Sans 3"',
    );
    expect(citeerFamilies('16px "Inter", sans-serif')).toBeNull();
    expect(citeerFamilies("geen opgave")).toBeNull();
  });
});

describe("beperkte lettertypelijst", () => {
  const namen = (alle: boolean, zoek = "", document: string[] = []) =>
    lettertypeGroepen({ alle, zoek, document }).flatMap((g) =>
      g.regels.map((r) => r.familie),
    );
  it("toont standaard alleen lettertypen die duidelijk verschillen", () => {
    const lijst = namen(false);
    for (const naam of [
      "Inter",
      "Merriweather",
      "JetBrains Mono",
      "Calibri",
      "Arial",
    ])
      expect(lijst).toContain(naam);
    for (const naam of [
      "Roboto",
      "Open Sans",
      "Lato",
      "Fira Code",
      "Gelasio",
      "Aptos",
    ])
      expect(lijst).not.toContain(naam);
    expect(lijst.length).toBeLessThan(namen(true).length);
  });
  it("vindt verborgen lettertypen via zoeken en via het document", () => {
    expect(namen(false, "robo")).toContain("Roboto");
    expect(namen(false, "", ["Lato"])).toContain("Lato");
  });
});
