import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Pakket } from "../../grafieken/pakket.ts";
import { leesXml, kind, kinderen, zoekAlle, attr } from "./ooxml.ts";
import {
  FORMATEN,
  MARGES,
  kolommenVoor,
  leesSecties,
  sectieVanMarkering,
  voegKolomeindeIn,
  voegSectieEindeIn,
  wijzigSecties,
  zetKolomVoorkeur,
} from "./secties.ts";
import {
  koppelAanVorige,
  leesKopVoet,
  verwijderKopVoet,
  verwijderPaginanummers,
  voegPaginanummerIn,
  voegVeldInBijMarkering,
  zetEerstePaginaAnders,
  zetEvenOnevenAnders,
  zetKopVoetAfstand,
  zorgVoorKopVoet,
} from "./kopvoet.ts";
import {
  STANDAARD_INHOUD,
  koppenUitExport,
  leesInhoudsopgave,
  verwijderInhoudsopgave,
  voegInhoudsopgaveIn,
  werkInhoudsopgaveBij,
  type Kop,
} from "./inhoudsopgave.ts";
import { herstelNootverwijzingen, leesNootInstellingen, leesNoten, voegNootIn, zetNootInstellingen } from "./noten.ts";

const SJABLOON = new Uint8Array(readFileSync(new URL("../../../public/templates/nieuw.docx", import.meta.url)));
const M = "OOSMARKTEST1Q";

const p = (tekst: string, stijl?: string) =>
  `<w:p>${stijl ? `<w:pPr><w:pStyle w:val="${stijl}"/></w:pPr>` : ""}<w:r><w:t xml:space="preserve">${tekst}</w:t></w:r></w:p>`;

/** Een DOCX op basis van het sjabloon met deze hoofdtekst (zonder sectPr: die van het sjabloon blijft). */
function maakDocx(body: string, sectPr?: string) {
  const pakket = new Pakket(SJABLOON);
  const xml = pakket.lees("word/document.xml");
  const sect = sectPr ?? /<w:sectPr\b[\s\S]*<\/w:sectPr>/.exec(xml)![0];
  pakket.schrijf("word/document.xml", xml.replace(/<w:body>[\s\S]*<\/w:body>/, `<w:body>${body}${sect}</w:body>`));
  return pakket.inpakken();
}
const deel = (bytes: Uint8Array, pad: string) => new Pakket(bytes).lees(pad);
const doc = (bytes: Uint8Array) => deel(bytes, "word/document.xml");
const welgevormd = (bytes: Uint8Array) => {
  const pakket = new Pakket(bytes);
  for (const n of pakket.namen()) if (/\.(xml|rels)$/.test(n)) leesXml(pakket.lees(n));
};

describe("secties: pagina-indeling", () => {
  it("zet marges, formaat en afdrukstand in schemavolgorde", () => {
    const bytes = maakDocx(p("Hallo"));
    const uit = wijzigSecties(bytes, "alle", { marges: MARGES.smal.marges, formaat: FORMATEN.A5 });
    const s = leesSecties(uit)[0];
    expect(s.marges).toMatchObject({ boven: 720, onder: 720, links: 720, rechts: 720 });
    expect([s.breedte, s.hoogte]).toEqual([8391, 11906]);
    const liggend = wijzigSecties(uit, "alle", { afdrukstand: "liggend" });
    const l = leesSecties(liggend)[0];
    expect([l.breedte, l.hoogte, l.afdrukstand]).toEqual([11906, 8391, "liggend"]);
    expect(doc(liggend)).toMatch(/<w:pgSz w:w="11906" w:h="8391" w:orient="landscape"\/>/);
    // pgSz staat vóór pgMar, cols erna.
    const sectPr = /<w:sectPr[\s\S]*?<\/w:sectPr>/.exec(doc(liggend))![0];
    expect(sectPr.indexOf("pgSz")).toBeLessThan(sectPr.indexOf("pgMar"));
    expect(sectPr.indexOf("pgMar")).toBeLessThan(sectPr.indexOf("cols"));
    welgevormd(liggend);
  });

  it("kolommen: gelijk, met lijn, en links/rechts ongelijk", () => {
    const bytes = maakDocx(p("Tekst"));
    const twee = zetKolomVoorkeur(bytes, "alle", "twee", { lijn: true, tussenruimte: 567 });
    expect(doc(twee)).toMatch(/<w:cols w:num="2" w:sep="1" w:space="567"\/>/);
    expect(leesSecties(twee)[0].kolommen).toMatchObject({ aantal: 2, lijn: true, tussenruimte: 567 });
    const links = zetKolomVoorkeur(bytes, "alle", "links");
    const k = leesSecties(links)[0].kolommen;
    expect(k.breedtes?.length).toBe(2);
    expect(k.breedtes![0].breedte).toBeLessThan(k.breedtes![1].breedte);
    expect(kolommenVoor("rechts", 9000).breedtes![0].breedte).toBeGreaterThan(kolommenVoor("rechts", 9000).breedtes![1].breedte);
    const een = zetKolomVoorkeur(links, "alle", "een");
    expect(doc(een)).toMatch(/<w:cols w:space="708"\/>/);
  });

  it("werkt per sectie en vindt de sectie van de cursor", () => {
    const tweede = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>';
    const bytes = maakDocx(`<w:p><w:pPr>${tweede}</w:pPr><w:r><w:t>Een</w:t></w:r></w:p>${p("Twee " + M)}`);
    expect(sectieVanMarkering(bytes, M)).toBe(1);
    const uit = wijzigSecties(bytes, 1, { afdrukstand: "liggend" });
    const s = leesSecties(uit);
    expect(s[0].afdrukstand).toBe("staand");
    expect(s[1].afdrukstand).toBe("liggend");
  });

  it("zet een sectie-einde op een oneven pagina bij de cursor", () => {
    const bytes = maakDocx(p("Een") + p(`Twee${M}drie`));
    const uit = voegSectieEindeIn(bytes, M, "oddPage");
    welgevormd(uit);
    const s = leesSecties(uit);
    expect(s.length).toBe(2);
    expect(s[0].begin).toBe("nextPage");
    expect(s[1].begin).toBe("oddPage");
    const xml = doc(uit);
    expect(xml).toMatch(/Twee<\/w:t><\/w:r><\/w:p><w:p><w:pPr><w:sectPr[\s\S]*?<\/w:sectPr><\/w:pPr><\/w:p><w:p><w:r><w:t xml:space="preserve">drie/);
    expect(() => voegSectieEindeIn(maakDocx(`<w:tbl><w:tr><w:tc>${p(M)}</w:tc></w:tr></w:tbl>`), M, "evenPage")).toThrow(/tabel/);
  });

  it("zet een kolomeinde in een eigen alinea op de cursorplek", () => {
    const bytes = maakDocx(p(`Voor${M}na`, "Heading2"));
    const uit = doc(voegKolomeindeIn(bytes, M));
    expect(uit).not.toContain(M);
    expect(uit).toContain(
      '<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t xml:space="preserve">Voor</w:t></w:r></w:p>' +
        '<w:p><w:r><w:br w:type="column"/></w:r></w:p>' +
        '<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t xml:space="preserve">na</w:t></w:r></w:p>',
    );
    // Aan het eind: geen lege derde alinea; de sectie-einde blijft bij de laatste helft.
    const sect = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>';
    const eind = doc(voegKolomeindeIn(maakDocx(`<w:p><w:pPr>${sect}</w:pPr><w:r><w:t>Tekst${M}</w:t></w:r></w:p>${p("Volgende")}`), M));
    expect(eind).toContain(`<w:p><w:pPr></w:pPr><w:r><w:t xml:space="preserve">Tekst</w:t></w:r></w:p><w:p><w:r><w:br w:type="column"/></w:r></w:p><w:p><w:pPr>${sect}</w:pPr></w:p>`);
  });
});

describe("kop- en voettekst", () => {
  it("voegt ‘Pagina X van Y’ onderaan in het midden in, zonder eerste pagina", () => {
    const bytes = maakDocx(p("Tekst"));
    const uit = voegPaginanummerIn(bytes, { positie: "onder", uitlijning: "midden", vorm: "paginaVan", opEerstePagina: false, notatie: "upperRoman", beginBij: 3 });
    welgevormd(uit);
    const pakket = new Pakket(uit);
    const sectPr = /<w:sectPr[\s\S]*?<\/w:sectPr>/.exec(doc(uit))![0];
    expect(sectPr).toMatch(/<w:footerReference w:type="default" r:id="rId\d+"\/>/);
    expect(sectPr).toContain("<w:titlePg/>");
    expect(sectPr).toMatch(/<w:pgNumType w:fmt="upperRoman" w:start="3"\/>/);
    const voet = pakket.namen().find((n) => /^word\/footer\d+\.xml$/.test(n))!;
    const xml = pakket.lees(voet);
    expect(xml).toContain('<w:jc w:val="center"/>');
    expect(xml).toMatch(/Pagina [\s\S]*PAGE [\s\S]* van [\s\S]*NUMPAGES/);
    expect(pakket.lees("[Content_Types].xml")).toContain(`/${voet}`);
    expect(pakket.lees("word/_rels/document.xml.rels")).toContain(voet.replace("word/", ""));
    // Nogmaals invoegen vervangt het nummer in plaats van te verdubbelen.
    const weer = voegPaginanummerIn(uit, { positie: "onder", uitlijning: "rechts", vorm: "getal", opEerstePagina: true });
    const xml2 = new Pakket(weer).lees(voet);
    expect(xml2.match(/PAGE /g)?.length).toBe(1);
    expect(xml2).toContain('<w:jc w:val="right"/>');
    expect(leesKopVoet(weer).secties[0].inhoud.footer.default).toBe(true);
  });

  it("behoudt een bestaande koptekst op de eerste pagina bij ‘niet op eerste pagina’", () => {
    let bytes = maakDocx(p("Tekst"));
    bytes = koppelAanVorigeOfMaak(bytes);
    const uit = voegPaginanummerIn(bytes, { positie: "onder", uitlijning: "links", vorm: "getal", opEerstePagina: false });
    const sectPr = /<w:sectPr[\s\S]*?<\/w:sectPr>/.exec(doc(uit))![0];
    expect(sectPr).toMatch(/<w:headerReference w:type="first"/);
    const stand = leesKopVoet(uit).secties[0];
    expect(stand.inhoud.header.first).toBe(true);
    expect(stand.titelpagina).toBe(true);
  });

  it("zet een sectie-einde op een nieuwe pagina en een doorlopend sectie-einde", () => {
    const nieuw = voegSectieEindeIn(maakDocx(p(`Een${M}twee`)), M, "nextPage");
    welgevormd(nieuw);
    expect(leesSecties(nieuw).map((s) => s.begin)).toEqual(["nextPage", "nextPage"]);
    const doorlopend = voegSectieEindeIn(maakDocx(p(`Een${M}twee`)), M, "continuous");
    welgevormd(doorlopend);
    expect(leesSecties(doorlopend).map((s) => s.begin)).toEqual(["nextPage", "continuous"]);
  });

  it("maakt bij ‘eerste pagina anders’ en ‘even en oneven’ de ontbrekende onderdelen om te bewerken", () => {
    const bytes = maakDocx(p("Tekst"));
    const kop = zorgVoorKopVoet(bytes, 0, "header")!;
    expect(/<w:sectPr[\s\S]*?<\/w:sectPr>/.exec(doc(kop))![0]).toMatch(/headerReference w:type="default"/);
    // Al aanwezig: niets te doen.
    expect(zorgVoorKopVoet(kop, 0, "header")).toBeNull();
    // Met eerste pagina anders en even/oneven: een lege eerste en even koptekst erbij.
    const anders = zetEvenOnevenAnders(zetEerstePaginaAnders(kop, "alle", true), true);
    const uit = zorgVoorKopVoet(anders, 0, "header")!;
    welgevormd(uit);
    const sectPr = /<w:sectPr[\s\S]*?<\/w:sectPr>/.exec(doc(uit))![0];
    expect(sectPr).toMatch(/headerReference w:type="first"/);
    expect(sectPr).toMatch(/headerReference w:type="even"/);
    expect(sectPr.match(/headerReference/g)).toHaveLength(3);
    expect(zorgVoorKopVoet(uit, 0, "header")).toBeNull();
  });

  it("even/oneven, afstand en verwijderen", () => {
    const bytes = maakDocx(p("Tekst"));
    const eo = zetEvenOnevenAnders(bytes, true);
    expect(deel(eo, "word/settings.xml")).toContain("<w:evenAndOddHeaders/>");
    // evenAndOddHeaders staat na defaultTabStop en vóór characterSpacingControl.
    const s = deel(eo, "word/settings.xml");
    expect(s.indexOf("defaultTabStop")).toBeLessThan(s.indexOf("evenAndOddHeaders"));
    expect(s.indexOf("evenAndOddHeaders")).toBeLessThan(s.indexOf("characterSpacingControl"));
    expect(leesKopVoet(eo).evenOneven).toBe(true);
    const met = voegPaginanummerIn(eo, { positie: "boven", uitlijning: "rechts", vorm: "pagina", opEerstePagina: true });
    expect(/<w:sectPr[\s\S]*?<\/w:sectPr>/.exec(doc(met))![0]).toMatch(/headerReference w:type="even"/);
    const afstand = zetKopVoetAfstand(met, "alle", { koptekst: 567, voettekst: 850 });
    expect(leesKopVoet(afstand).secties[0]).toMatchObject({ koptekst: 567, voettekst: 850 });
    const zonder = verwijderKopVoet(afstand, "alle", "header");
    expect(doc(zonder)).not.toContain("headerReference");
    expect(new Pakket(zonder).namen().some((n) => /^word\/header\d*\.xml$/.test(n))).toBe(false);
    expect(() => verwijderPaginanummers(zonder)).toThrow();
  });

  it("koppelt een tweede sectie los en weer vast", () => {
    const tweede = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>';
    let bytes = maakDocx(`<w:p><w:pPr>${tweede}</w:pPr><w:r><w:t>Een</w:t></w:r></w:p>${p("Twee")}`);
    bytes = voegPaginanummerIn(bytes, { positie: "onder", uitlijning: "midden", vorm: "getal", opEerstePagina: true, doel: 0 });
    expect(leesKopVoet(bytes).secties[1].eigen.footer).toBe(false);
    const los = koppelAanVorige(bytes, 1, "footer", false);
    expect(leesKopVoet(los).secties[1].eigen.footer).toBe(true);
    expect(leesKopVoet(los).secties[1].inhoud.footer.default).toBe(true);
    const vast = koppelAanVorige(los, 1, "footer", true);
    expect(leesKopVoet(vast).secties[1].eigen.footer).toBe(false);
    expect(() => koppelAanVorige(vast, 0, "footer", true)).toThrow();
  });

  it("zet een PAGE-veld bij de cursor", () => {
    const bytes = maakDocx(p(`Blad ${M}`));
    const uit = doc(voegVeldInBijMarkering(bytes, M, "getal"));
    expect(uit).toContain('<w:instrText xml:space="preserve"> PAGE </w:instrText>');
    expect(uit).not.toContain(M);
  });
});

/** Hulp: een document met een koptekst (via de paginanummerroute bovenaan, zonder nummer daarna). */
function koppelAanVorigeOfMaak(bytes: Uint8Array) {
  const met = voegPaginanummerIn(bytes, { positie: "boven", uitlijning: "links", vorm: "pagina", opEerstePagina: true });
  // Vervang het nummer door gewone tekst, zodat de koptekst inhoud zonder veld heeft.
  const pakket = new Pakket(met);
  const kop = pakket.namen().find((n) => /^word\/header\d+\.xml$/.test(n))!;
  pakket.schrijf(kop, pakket.lees(kop).replace(/<w:p>[\s\S]*<\/w:p>/, '<w:p><w:r><w:t>Rapport</w:t></w:r></w:p>'));
  return pakket.inpakken();
}

describe("inhoudsopgave", () => {
  const body = p(`Begin ${M}`) + p("Inleiding", "Heading1") + p("tekst") + p("Achtergrond", "Heading2") + p("Diep", "Heading3") + p("Resultaten", "Heading1");
  const koppen: Kop[] = [
    { tekst: "Inleiding", niveau: 1, pagina: "1" },
    { tekst: "Achtergrond", niveau: 2, pagina: "2" },
    { tekst: "Diep", niveau: 3, pagina: "2" },
    { tekst: "Resultaten", niveau: 1, pagina: "3" },
  ];

  it.each([0, 5, 13])("koppelt de kop ook met een tijdelijke cursor op positie %s (#145)", (positie) => {
    const kop = "Hoofdstuk een";
    const metCursor = kop.slice(0, positie) + M + kop.slice(positie);
    const uit = voegInhoudsopgaveIn(maakDocx(p(metCursor, "Heading1") + p("Een gewone alinea.")), M,
      [{ tekst: kop, niveau: 1, pagina: "1" }], STANDAARD_INHOUD);
    const xml = doc(uit), wortel = leesXml(xml);
    expect(xml).not.toContain(M);
    const bladwijzer = zoekAlle(wortel, "bookmarkStart")[0];
    expect(attr(bladwijzer, "name")).toMatch(/^_Toc/);
    const sdt = zoekAlle(wortel, "sdt")[0];
    const link = zoekAlle(sdt, "hyperlink")[0];
    expect(attr(link, "anchor")).toBe(attr(bladwijzer, "name"));
    expect(zoekAlle(link, "t").map((t) => t.kinderen.map((k) => k.soort === "tekst" ? k.tekst : "").join(""))).toEqual([kop, "1"]);
    expect(xml).toMatch(/w:tab w:val="right" w:leader="dot"/);
    expect(werkInhoudsopgaveBij(uit, [{ tekst: kop, niveau: 1, pagina: "1" }], "alles").gewijzigd).toBe(false);
  });

  it("voegt een TOC-veld met regels, bladwijzers en hyperlinks in", () => {
    const uit = voegInhoudsopgaveIn(maakDocx(body), M, koppen, { ...STANDAARD_INHOUD, niveaus: 2 });
    welgevormd(uit);
    const xml = doc(uit);
    expect(xml).not.toContain(M);
    expect(xml).toContain('<w:docPartGallery w:val="Table of Contents"/>');
    expect(xml).toContain('<w:instrText xml:space="preserve"> TOC \\o "1-2" \\h \\z \\u </w:instrText>');
    const wortel = leesXml(xml);
    const sdt = zoekAlle(wortel, "sdt")[0];
    const regels = kinderen(kind(sdt, "sdtContent"), "p");
    // Titel + 3 regels (Diep valt buiten niveau 2).
    expect(regels.length).toBe(4);
    const ankers = zoekAlle(sdt, "hyperlink").map((h) => attr(h, "anchor"));
    expect(ankers.length).toBe(3);
    for (const a of ankers) expect(xml).toContain(`w:name="${a}"`);
    expect(xml).toMatch(/<w:tab w:val="right" w:leader="dot" w:pos="\d+"\/>/);
    // Begin in de eerste regel, einde in de laatste.
    expect(xml.indexOf('fldCharType="begin"')).toBeLessThan(xml.indexOf("Inleiding"));
    expect(new Pakket(uit).lees("word/styles.xml")).toMatch(/w:styleId="TOC1"[\s\S]*w:styleId="TOC2"/);
    expect(leesInhoudsopgave(uit)).toMatchObject({ niveaus: 2, hyperlinks: true, paginanummers: true, opvulteken: "punt", titel: "Inhoudsopgave" });
  });

  it("werkt alleen de paginanummers bij of de hele tabel", () => {
    const uit = voegInhoudsopgaveIn(maakDocx(body), M, koppen, STANDAARD_INHOUD);
    const nieuw = koppen.map((k, i) => ({ ...k, pagina: String(i + 5) }));
    const paginas = werkInhoudsopgaveBij(uit, nieuw, "paginas");
    expect(paginas.gewijzigd).toBe(true);
    const tekst = zoekAlle(zoekAlle(leesXml(doc(paginas.bytes)), "sdt")[0], "t").map((t) => t.kinderen.map((k) => (k.soort === "tekst" ? k.tekst : "")).join(""));
    expect(tekst).toEqual(["Inhoudsopgave", "Inleiding", "5", "Achtergrond", "6", "Diep", "7", "Resultaten", "8"]);
    expect(werkInhoudsopgaveBij(paginas.bytes, nieuw, "paginas").gewijzigd).toBe(false);
    const alles = werkInhoudsopgaveBij(paginas.bytes, [...nieuw, { tekst: "Bijlage", niveau: 1, pagina: "9" }], "alles");
    expect(doc(alles.bytes)).toContain("Bijlage");
    // Bestaande bladwijzers worden hergebruikt.
    expect((doc(alles.bytes).match(/w:bookmarkStart/g) ?? []).length).toBe(4);
    expect(() => voegInhoudsopgaveIn(alles.bytes, null, koppen, STANDAARD_INHOUD)).toThrow(/al een inhoudsopgave/);
    const weg = verwijderInhoudsopgave(alles.bytes);
    expect(leesInhoudsopgave(weg)).toBeNull();
  });

  it("zonder paginanummers en met een ander opvulteken", () => {
    const uit = voegInhoudsopgaveIn(maakDocx(body), M, koppen, { ...STANDAARD_INHOUD, paginanummers: false, opvulteken: "streep", titel: "" });
    const xml = doc(uit);
    expect(xml).toContain("\\n </w:instrText>");
    expect(xml).not.toContain("TOCHeading\"/></w:pPr>");
    expect(leesInhoudsopgave(uit)?.paginanummers).toBe(false);
  });

  it("leest koppen en paginalabels uit een paged export", () => {
    const k = koppenUitExport({
      structured: {
        stories: [
          {
            kind: "body",
            blocks: [
              { id: "b1", kind: "heading", paragraph: { styleId: "Heading1", inlines: [{ kind: "text", text: "Inleiding" }] }, heading: { outlineLevel: 0 } },
              { id: "b2", kind: "paragraph", paragraph: { styleId: null, inlines: [{ kind: "text", text: "x" }] } },
              { id: "b3", kind: "heading", paragraph: { styleId: "TOC1", inlines: [{ kind: "text", text: "Inleiding" }] }, heading: { outlineLevel: 0 } },
              { id: "b4", kind: "listItem", paragraph: { styleId: "Heading2", inlines: [{ kind: "text", text: "Sub" }, { kind: "tab" }, { kind: "text", text: "deel" }] }, heading: { outlineLevel: 1 } },
            ],
          },
        ],
      },
      layout: { pages: [{ pageIndex: 0, displayedLabel: "i" }, { pageIndex: 1, displayedLabel: "ii" }], fragments: [{ blockId: "b1", pageIndex: 0 }, { blockId: "b4", pageIndex: 1 }] },
    });
    expect(k).toEqual([
      { tekst: "Inleiding", niveau: 1, pagina: "i" },
      { tekst: "Sub deel", niveau: 2, pagina: "ii" },
    ]);
  });

  it("slaat verwijderde tekst over in de markeringsweergave (bijgehouden wijzigingen)", () => {
    const k = koppenUitExport({
      structured: {
        stories: [
          {
            kind: "body",
            blocks: [
              {
                id: "b1",
                kind: "heading",
                paragraph: {
                  styleId: "Heading1",
                  inlines: [
                    { kind: "text", text: "Nieuwe" },
                    { kind: "text", text: " oude", revisions: [{ kind: "deletion" }] },
                    { kind: "text", text: " kop", revisions: [{ kind: "insertion" }] },
                  ],
                },
                heading: { outlineLevel: 0 },
              },
            ],
          },
        ],
      },
      layout: { pages: [{ pageIndex: 0, displayedLabel: "1" }], fragments: [{ blockId: "b1", pageIndex: 0 }] },
    });
    expect(k).toEqual([{ tekst: "Nieuwe kop", niveau: 1, pagina: "1" }]);
  });
});

describe("voet- en eindnoten", () => {
  it("voegt een voetnoot in met verwijzing, notendeel, relatie en stijlen", () => {
    const uit = voegNootIn(maakDocx(p(`Feit${M} en meer`)), M, "voetnoot", "Bron: archief.\nTweede regel");
    welgevormd(uit.bytes);
    expect(uit.id).toBe(1);
    const pakket = new Pakket(uit.bytes);
    expect(doc(uit.bytes)).toMatch(/Feit<\/w:t><\/w:r><w:r><w:rPr><w:rStyle w:val="FootnoteReference"\/><w:vertAlign w:val="superscript"\/><\/w:rPr><w:footnoteReference w:id="1"\/><\/w:r><w:r><w:t xml:space="preserve"> en meer/);
    const noten = pakket.lees("word/footnotes.xml");
    expect(noten).toContain('w:type="separator" w:id="-1"');
    expect(noten).toMatch(/<w:footnote w:id="1"><w:p><w:pPr><w:pStyle w:val="FootnoteText"\/><\/w:pPr><w:r>[\s\S]*<w:footnoteRef\/>[\s\S]*Bron: archief\.[\s\S]*Tweede regel/);
    expect(pakket.lees("word/_rels/document.xml.rels")).toContain('Target="footnotes.xml"');
    expect(pakket.lees("[Content_Types].xml")).toContain("/word/footnotes.xml");
    expect(pakket.lees("word/styles.xml")).toContain('w:styleId="FootnoteReference"');
    expect(pakket.lees("word/settings.xml")).toMatch(/<w:footnotePr><w:footnote w:id="-1"\/><w:footnote w:id="0"\/><\/w:footnotePr>/);
    // Een tweede noot krijgt id 2.
    const tweede = new Pakket(uit.bytes);
    tweede.schrijf("word/document.xml", tweede.lees("word/document.xml").replace(" en meer", ` en ${M}meer`));
    const twee = voegNootIn(tweede.inpakken(), M, "voetnoot", "x");
    expect(twee.id).toBe(2);
    expect(new Pakket(twee.bytes).lees("word/footnotes.xml").match(/<w:footnote w:id="\d/g)?.length).toBe(2);
  });

  it("nummert, leest en stelt noten in", () => {
    let bytes = maakDocx(p(`Een ${M}`));
    bytes = voegNootIn(bytes, M, "voetnoot", "Eerste").bytes;
    const pakket = new Pakket(bytes);
    pakket.schrijf("word/document.xml", pakket.lees("word/document.xml").replace("Een ", `Een ${M}`));
    bytes = voegNootIn(pakket.inpakken(), M, "eindnoot", "Slot").bytes;
    const noten = leesNoten(bytes);
    expect(noten.map((n) => [n.soort, n.id, n.tekst])).toEqual([
      ["voetnoot", "1", "Eerste"],
      ["eindnoot", "1", "Slot"],
    ]);
    expect(new Pakket(bytes).lees("word/endnotes.xml")).toContain("<w:endnoteRef/>");
    const ingesteld = zetNootInstellingen(bytes, "voetnoot", { notatie: "lowerLetter", beginBij: 3, herstart: "eachPage", positie: "pageBottom" });
    expect(leesNootInstellingen(ingesteld, "voetnoot")).toEqual({ notatie: "lowerLetter", beginBij: 3, herstart: "eachPage", positie: "pageBottom" });
    const s = deel(ingesteld, "word/settings.xml");
    // De nummering staat per sectie; de instellingen houden alleen de scheidingslijnen.
    expect(s).toMatch(/<w:footnotePr><w:footnote w:id="-1"\/><w:footnote w:id="0"\/><\/w:footnotePr>/);
    expect(/<w:sectPr[\s\S]*?<\/w:sectPr>/.exec(doc(ingesteld))![0]).toMatch(
      /^<w:sectPr[^>]*><w:footnotePr><w:pos w:val="pageBottom"\/><w:numFmt w:val="lowerLetter"\/><w:numStart w:val="3"\/><w:numRestart w:val="eachPage"\/><\/w:footnotePr>/,
    );
    expect(leesNootInstellingen(bytes, "eindnoot").notatie).toBe("lowerRoman");
    expect(() => zetNootInstellingen(bytes, "eindnoot", { notatie: "decimal", beginBij: 1, herstart: "eachPage", positie: "docEnd" })).toThrow();
  });

  it("herstelt nootverwijzingen waarvan de engine de opmaak liet vallen", () => {
    const xml = '<w:document xmlns:w="w"><w:body><w:p><w:r><w:footnoteReference w:id="1"/></w:r><w:r><w:rPr><w:b/></w:rPr><w:endnoteReference w:id="2"/></w:r></w:p></w:body></w:document>';
    expect(herstelNootverwijzingen(xml)).toBe(
      '<w:document xmlns:w="w"><w:body><w:p><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteReference w:id="1"/></w:r><w:r><w:rPr><w:b/></w:rPr><w:endnoteReference w:id="2"/></w:r></w:p></w:body></w:document>',
    );
  });

  it("weigert een noot buiten de hoofdtekst", () => {
    let bytes = maakDocx(p("Tekst"));
    bytes = voegPaginanummerIn(bytes, { positie: "onder", uitlijning: "midden", vorm: "getal", opEerstePagina: true });
    const pakket = new Pakket(bytes);
    const voet = pakket.namen().find((n) => /footer\d+\.xml$/.test(n))!;
    pakket.schrijf(voet, pakket.lees(voet).replace("</w:p>", `<w:r><w:t>${M}</w:t></w:r></w:p>`));
    expect(() => voegNootIn(pakket.inpakken(), M, "voetnoot", "x")).toThrow(/hoofdtekst/);
  });
});
