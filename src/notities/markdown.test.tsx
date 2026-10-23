import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownVoorbeeld } from "./MarkdownEditor";
import { bewerkMarkdown } from "./markdown-bewerking";
import {
  nieuweNotities,
  nieuwePagina,
  nieuwBlok,
  nieuwTekstvak,
  leesNotities,
  NotitieBewaring,
  kopieerSectie,
  paginaAlsMarkdown,
  voegBackupToe,
  zoekPaginas,
  type Sectie,
} from "./model";

function markdownBoek(
  tekst = "## Besluiten\n\n- [x] Klaar\n\n**Letterlijk** & ideeën\n",
) {
  const data = nieuweNotities();
  const sectie: Sectie = {
    id: crypto.randomUUID(),
    naam: "Werknotities",
    soort: "markdown",
    paginas: [{ ...nieuwePagina("Overleg", "markdown"), markdown: tekst }],
  };
  data.boeken[0].secties.push(sectie);
  return { data, sectie, pagina: sectie.paginas[0] };
}

describe("Canvas- en Markdownsecties", () => {
  it("migreert versie 2 naar canvas zonder de bestaande opslag te herschrijven", () => {
    const origineel = nieuweNotities();
    const oud = {
      ...origineel,
      versie: 2,
      boeken: origineel.boeken.map((b) => ({
        ...b,
        secties: b.secties.map(({ soort, ...s }) => ({
          ...s,
          paginas: s.paginas.map(({ markdown, ...p }) => p),
        })),
      })),
    };
    let tekst = JSON.stringify(oud);
    const vroeger = tekst;
    const opslag = new NotitieBewaring({
      getItem: () => tekst,
      setItem: (_k, v) => {
        tekst = v;
      },
    });
    const data = opslag.lees();
    expect(tekst).toBe(vroeger);
    expect(data).toEqual(origineel);
    opslag.schrijf(data);
    expect(leesNotities(tekst)).toEqual(origineel);
  });
  it("bewaart en exporteert Markdown letterlijk, inclusief witruimte, regelafbrekingen en tekens", () => {
    const tekst = "# Eigen kop\r\n\r\n**vet** & <tekst>\r\n\r\n";
    const { data, pagina } = markdownBoek(tekst);
    expect(leesNotities(JSON.stringify(data))).toEqual(data);
    expect(paginaAlsMarkdown(pagina, "markdown")).toBe(tekst);
    expect(
      paginaAlsMarkdown(nieuwePagina("Leeg", "markdown"), "markdown"),
    ).toBe("");
  });
  it("vindt Markdown over alle secties en neemt het mee in een toegevoegde back-up", () => {
    const { data, pagina } = markdownBoek("Een uniek besluit over hergebruik");
    expect(zoekPaginas(data, "uniek hergebruik")).toHaveLength(1);
    const samen = voegBackupToe(data, leesNotities(JSON.stringify(data)));
    expect(leesNotities(JSON.stringify(samen))).toEqual(samen);
    expect(zoekPaginas(samen, "uniek hergebruik")).toHaveLength(2);
    expect(samen.boeken[1].secties[1].paginas[0].id).not.toBe(pagina.id);
    pagina.verwijderd = true;
    expect(zoekPaginas(data, "uniek hergebruik")).toHaveLength(0);
    expect(zoekPaginas(data, "uniek hergebruik", true)).toHaveLength(1);
  });
  it("kopieert canvas naar Markdown terwijl tekstvakken, coördinaten en identificaties van de bron intact blijven", () => {
    const data = nieuweNotities(),
      sectie = data.boeken[0].secties[0];
    sectie.paginas[0].vakken[0].x = 700;
    sectie.paginas[0].vakken.push(
      nieuwTekstvak([nieuwBlok("Losse gedachte", "kop")], 40, 10),
    );
    const origineel = structuredClone(sectie);
    const kopie = kopieerSectie(sectie, "markdown");
    expect(sectie).toEqual(origineel);
    expect(kopie.paginas[0].markdown).toContain("## Losse gedachte");
    expect(kopie.paginas[0].markdown).toContain(
      "- [ ] Een eerste idee vastleggen",
    );
    expect(kopie.paginas[0].markdown.indexOf("Losse gedachte")).toBeLessThan(
      kopie.paginas[0].markdown.indexOf("Een plek voor alles"),
    );
    expect(kopie.paginas[0].id).not.toBe(sectie.paginas[0].id);
    data.boeken[0].secties.push(kopie);
    expect(leesNotities(JSON.stringify(data))).toEqual(data);
  });
  it("neemt lange Markdownbron volledig over in canvaskopieën, zonder Unicode te splitsen", () => {
    const tekst = "a".repeat(99999) + "😀" + "b".repeat(2000);
    const { data, sectie } = markdownBoek(tekst);
    const kopie = kopieerSectie(sectie, "canvas");
    const blokken = kopie.paginas[0].vakken[0].blokken;
    expect(blokken.map((b) => b.tekst).join("")).toBe(tekst);
    expect(blokken[0].tekst).toHaveLength(99999);
    data.boeken[0].secties.push(kopie);
    expect(leesNotities(JSON.stringify(data))).toEqual(data);
  });
  it.each(["soort", "markdown", "lengte"])(
    "weigert ongeldige nieuwe velden: %s",
    (fout) => {
      const { data, sectie, pagina } = markdownBoek();
      if (fout === "soort")
        (sectie as unknown as { soort: string }).soort = "html";
      if (fout === "markdown")
        (pagina as unknown as { markdown: number }).markdown = 10;
      if (fout === "lengte") pagina.markdown = "x".repeat(500001);
      expect(() => leesNotities(JSON.stringify(data))).toThrow();
    },
  );
  it("weigert te grote omzettingen voordat de oorspronkelijke sectie wordt gewijzigd", () => {
    const sectie = nieuweNotities().boeken[0].secties[0];
    sectie.paginas[0].vakken[0].blokken = Array.from({ length: 6 }, () =>
      nieuwBlok("a".repeat(100000)),
    );
    const origineel = structuredClone(sectie);
    expect(() => kopieerSectie(sectie, "markdown")).toThrow("te groot");
    expect(sectie).toEqual(origineel);
  });
});

describe("Markdownbewerking en voorbeeld", () => {
  it("omsluit precies de geselecteerde tekst en laat de selectie in de opmaak staan", () => {
    const r = bewerkMarkdown("Een idee delen", 4, 8, "vet");
    expect(r.tekst).toBe("Een **idee** delen");
    expect(r.tekst.slice(r.start, r.einde)).toBe("idee");
  });
  it("maakt van een selectie van meerdere regels taken en laat de volgende regel ongemoeid", () => {
    expect(bewerkMarkdown("Eerst\nDaarna\nLater", 0, 12, "taak").tekst).toBe(
      "- [ ] Eerst\n- [ ] Daarna\nLater",
    );
    expect(bewerkMarkdown("\nTweede", 0, 0, "kop").tekst).toBe("## \nTweede");
  });
  it("plaatst de linkselectie op het adres en verwijdert kopopmaak via Tekst", () => {
    const r = bewerkMarkdown("Werk", 0, 4, "link");
    expect(r.tekst).toBe("[Werk](https://)");
    expect(r.tekst.slice(r.start, r.einde)).toBe("https://");
    expect(bewerkMarkdown("## Een kop\nTekst", 4, 4, "tekst").tekst).toBe(
      "Een kop\nTekst",
    );
  });
  it("toont koppen, opmaak, tabellen, taken en code als leesbaar voorbeeld", () => {
    const html = renderToStaticMarkup(
      <MarkdownVoorbeeld
        tekst={
          "## Besluiten\n\n**Vrij** en *open*\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n- [x] Gereed\n\n```\nconst x = 1\n```"
        }
      />,
    );
    for (const teken of [
      "<h2>",
      "<strong>",
      "<em>",
      "<table>",
      "checked=",
      "<pre>",
    ])
      expect(html).toContain(teken);
  });
  it("voert geen HTML uit, maakt geen actieve scriptlinks en laadt geen externe afbeeldingen", () => {
    const html = renderToStaticMarkup(
      <MarkdownVoorbeeld
        tekst={
          '<script>alert("x")</script>\n\n[klik](javascript:alert%281%29)\n\n![Schets](https://example.invalid/prive.png)'
        }
      />,
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain("<img");
    expect(html).toContain("Afbeelding: Schets");
  });
});
