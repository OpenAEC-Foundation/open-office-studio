import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { openWorkbook } from "@betteroffice/xlsx";
import { Pakket } from "../grafieken/pakket";
import {
  attr,
  kind,
  kinderen,
  leesXml,
  tekstVan,
  zoekAlle,
} from "../grafieken/xml";
import {
  leesCelnotities,
  schrijfCelnotitie,
  Notitiefout,
  notitieBladBeschermd,
} from "./celnotities";
import { laadCelnotities, celnotities } from "./celnotitieAnkers";

const bron = new Uint8Array(readFileSync("public/templates/nieuw.xlsx"));
const noot = {
  tekst: "  Kosten < 20 & ideeën 😀\nTweede regel  ",
  auteur: "Renée & Co",
  zichtbaar: false,
};
const commentPad = (p: Pakket) =>
  p.namen().find((n) => /^xl\/comments\d+\.xml$/.test(n))!;
const vmlPad = (p: Pakket) => p.namen().find((n) => n.endsWith(".vml"))!;
function metTwee() {
  return schrijfCelnotitie(schrijfCelnotitie(bron, 0, "B2", noot), 0, "D5", {
    ...noot,
    tekst: "Behoud deze",
    auteur: "Anna",
    zichtbaar: true,
  });
}
function weiger(functie: () => unknown, code: Notitiefout["code"]) {
  try {
    functie();
    throw new Error("Geen weigering");
  } catch (f) {
    expect(f).toBeInstanceOf(Notitiefout);
    expect((f as Notitiefout).code).toBe(code);
  }
}
describe("XLSX-celnotities (#71)", () => {
  it("houdt ongeankerde bronnotities per werkmap en bladvak gescheiden", () => {
    let ids = ["eerste", "tweede"];
    const h = {
      sheetInfo: () => ({ sheetIds: ids, sheetNames: ["Blad 1", "Blad 2"] }),
    };
    laadCelnotities(h, metTwee());
    expect(celnotities(h, 0)).toHaveLength(2);
    ids = ["tweede", "eerste"];
    expect(celnotities(h, 0)).toEqual([]);
    expect(celnotities(h, 1)).toHaveLength(2);
    expect(
      celnotities(
        { sheetInfo: () => ({ sheetIds: ["eerste"], sheetNames: ["Blad 1"] }) },
        0,
      ),
    ).toEqual([]);
  });
  it("voegt notities in lege cellen toe met XML-tekst, auteur en VML-zichtbaarheid", () => {
    const bytes = metTwee(),
      p = new Pakket(bytes);
    expect(leesCelnotities(bytes)[0]).toEqual([
      { cel: "B2", ...noot },
      {
        cel: "D5",
        ...noot,
        tekst: "Behoud deze",
        auteur: "Anna",
        zichtbaar: true,
      },
    ]);
    const ws = leesXml(p.lees("xl/worksheets/sheet1.xml"));
    expect(kind(ws, "legacyDrawing")).toBeTruthy();
    expect(
      p
        .relaties("xl/worksheets/sheet1.xml")
        .filter((r) => /\/(?:comments|vmlDrawing)$/.test(r.type)),
    ).toHaveLength(2);
    const types = p.lees("[Content_Types].xml");
    expect(types).toContain("spreadsheetml.comments+xml");
    expect(types).toContain('Extension="vml"');
    expect(p.lees(commentPad(p))).toContain("&lt; 20 &amp;");
  });
  it("bewerkt en verwijdert alleen de gekozen cel, behoudt andere onderdelen en VML-objecten", () => {
    const eerste = new Pakket(metTwee());
    const vml = vmlPad(eerste),
      vmlXml = eerste.lees(vml);
    eerste.schrijf(
      vml,
      vmlXml.replace(
        "</xml>",
        '<v:shape xmlns:v="urn:schemas-microsoft-com:vml" id="OtherControl"><v:textbox>Niet verwijderen</v:textbox></v:shape></xml>',
      ),
    );
    eerste.schrijf("customXml/onbekend.xml", "<custom>Blijf gelijk</custom>");
    const bytes = eerste.inpakken();
    const uit = schrijfCelnotitie(bytes, 0, "B2", {
      ...noot,
      tekst: "Nieuwe tekst",
      auteur: "Andere auteur",
      zichtbaar: true,
    });
    const na = new Pakket(uit);
    for (const naam of eerste.namen())
      if (![commentPad(eerste), vml].includes(naam))
        expect(na.bytes(naam), naam).toEqual(eerste.bytes(naam));
    expect(na.lees(vml)).toContain('id="OtherControl"');
    expect(leesCelnotities(uit)[0][1]).toEqual(leesCelnotities(bytes)[0][1]);
    const weg = schrijfCelnotitie(uit, 0, "B2", null),
      p = new Pakket(weg);
    expect(leesCelnotities(weg)[0]).toEqual([
      {
        cel: "D5",
        ...noot,
        tekst: "Behoud deze",
        auteur: "Anna",
        zichtbaar: true,
      },
    ]);
    expect(p.lees(vml)).toContain("OtherControl");
    expect(
      zoekAlle(leesXml(p.lees(vml)), "shape").filter(
        (s) => attr(kind(s, "ClientData"), "ObjectType") === "Note",
      ),
    ).toHaveLength(1);
    expect(leesCelnotities(schrijfCelnotitie(weg, 0, "D5", null))[0]).toEqual(
      [],
    );
  });
  it("bewaart rijke tekst bij alleen zichtbaarheid wijzigen en behoudt vreemde XML", () => {
    const p = new Pakket(metTwee()),
      pad = commentPad(p);
    const xml = p.lees(pad),
      root = leesXml(xml);
    const c = kinderen(kind(root, "commentList"), "comment")[0];
    const oud = xml.slice(c.start, c.eind);
    const rijk =
      '<text><r><rPr><b/></rPr><t>Rijke </t></r><r><t>tekst</t></r></text><extLst><ext uri="custom"/></extLst>';
    p.schrijf(
      pad,
      xml.replace(
        oud,
        `<comment ref="B2" authorId="0" custom="yes">${rijk}</comment>`,
      ),
    );
    const bytes = p.inpakken(),
      n = leesCelnotities(bytes)[0][0];
    const uit = new Pakket(
      schrijfCelnotitie(bytes, 0, "B2", { ...n, zichtbaar: true }),
    );
    expect(uit.lees(pad)).toContain(rijk);
    expect(uit.lees(pad)).toContain('custom="yes"');
  });
  it("behoudt notities, waarden en formules na openen/bewerken/bewaren in de echte kern", () => {
    const h = openWorkbook(metTwee());
    try {
      h.editCell(0, 0, 0, "42");
      h.editCell(0, 0, 1, "=A1+1");
      const bytes = h.save();
      expect(leesCelnotities(bytes)).toEqual(leesCelnotities(metTwee()));
      const opnieuw = openWorkbook(
        schrijfCelnotitie(bytes, 0, "B2", { ...noot, tekst: "Na bewaren" }),
      );
      try {
        expect(opnieuw.cell(0, 0, 0).input).toBe("42");
        expect(opnieuw.cell(0, 0, 1).input).toBe("=A1+1");
        expect(leesCelnotities(opnieuw.save())[0][0].tekst).toBe("Na bewaren");
      } finally {
        opnieuw.dispose();
      }
    } finally {
      h.dispose();
    }
  });
  it("weigert een beveiligd blad, ongeldige cel en moderne reactieketen", () => {
    const p = new Pakket(metTwee());
    const ws = p.lees("xl/worksheets/sheet1.xml");
    p.schrijf(
      "xl/worksheets/sheet1.xml",
      ws.replace(
        "</worksheet>",
        '<sheetProtection sheet="1" objects="1"/></worksheet>',
      ),
    );
    const bytes = p.inpakken();
    expect(notitieBladBeschermd(bytes, 0)).toBe(true);
    weiger(() => schrijfCelnotitie(bytes, 0, "B2", noot), "protectedSheet");
    weiger(() => schrijfCelnotitie(bron, 0, "XFE1", noot), "invalidCell");
    weiger(() => schrijfCelnotitie(bron, 99, "A1", noot), "missingSheet");
    const modern = new Pakket(metTwee());
    modern.schrijf(
      "xl/threadedComments/threadedComment1.xml",
      '<ThreadedComments xmlns="http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments"><threadedComment ref="B2" id="x" personId="p"><text>Reactie</text></threadedComment></ThreadedComments>',
    );
    modern.voegRelatieToe(
      "xl/worksheets/sheet1.xml",
      "http://schemas.microsoft.com/office/2017/10/relationships/threadedComment",
      "xl/threadedComments/threadedComment1.xml",
    );
    expect(leesCelnotities(modern.inpakken())[0].map((n) => n.cel)).toEqual([
      "D5",
    ]);
    weiger(
      () => schrijfCelnotitie(modern.inpakken(), 0, "B2", noot),
      "threadedComment",
    );
  });
  it("volgt de werkbladrelatie en werkt met voorvoegsels en hernoemde onderdelen", () => {
    const p = new Pakket(schrijfCelnotitie(bron, 0, "B2", noot));
    const oud = commentPad(p),
      nieuw = "xl/notes/ander.xml";
    p.schrijf(
      nieuw,
      p
        .lees(oud)
        .replace(/xmlns=/, "xmlns:s=")
        .replace(
          /<(\/?)(comments|authors|author|commentList|comment|text|t)(?=[\s/>])/g,
          "<$1s:$2",
        ),
    );
    const rel = "xl/worksheets/_rels/sheet1.xml.rels";
    p.schrijf(
      rel,
      p.lees(rel).replace("../comments1.xml", "../notes/ander.xml"),
    );
    p.verwijder(oud);
    const bytes = schrijfCelnotitie(p.inpakken(), 0, "B2", {
      ...noot,
      auteur: "B",
      tekst: "Wijziging",
    });
    expect(leesCelnotities(bytes)[0][0].tekst).toBe("Wijziging");
    const lijst = kind(leesXml(new Pakket(bytes).lees(nieuw)), "commentList");
    expect(tekstVan(kind(kind(lijst, "comment"), "text"))).toBe("Wijziging");
  });
});
