import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { converteerNoten, leesNoten, leesNootInstellingen, voegNootIn, zetNootInstellingen } from "./noten";
import { Pakket, NS_W, WREL, kinderen, leesXml, openDocument, onderdeelVan } from "./ooxml";

function gemengd() {
  const p = new Pakket(readFileSync("public/templates/nieuw.docx"));
  p.schrijf("word/document.xml", p.lees("word/document.xml").replace(/<w:body>[\s\S]*?<\/w:body>/,
    '<w:body><w:p><w:r><w:t>Begin __F1__ midden __F2__ slot __E1__.</w:t></w:r></w:p><w:sectPr/></w:body>'));
  let b = p.inpakken();
  b = voegNootIn(b, "__F1__", "voetnoot", "Eerste voetnoot.").bytes;
  b = voegNootIn(b, "__F2__", "voetnoot", "Tweede voetnoot.").bytes;
  b = voegNootIn(b, "__E1__", "eindnoot", "Bestaande eindnoot.").bytes;
  return b;
}
const wijzig = (b: Uint8Array, f: (p: Pakket) => void) => { const p = new Pakket(b); f(p); return p.inpakken(); };
const lijst = (b: Uint8Array) => leesNoten(b).map(n => [n.soort, n.id, n.tekst]);

describe("voetnoten en eindnoten omzetten zonder inhoudsverlies (#51)", () => {
  it("zet alle voetnoten om naast bestaande eindnoten, en kan alles terugzetten", () => {
    const bron = gemengd();
    const uit = converteerNoten(bron, "voetnoot");
    expect(uit.aantal).toBe(2);
    expect(lijst(uit.bytes)).toEqual([
      ["eindnoot", "2", "Eerste voetnoot."], ["eindnoot", "3", "Tweede voetnoot."], ["eindnoot", "1", "Bestaande eindnoot."],
    ]);
    const terug = converteerNoten(uit.bytes, "eindnoot");
    expect(terug.aantal).toBe(3);
    expect(lijst(terug.bytes)).toEqual([
      ["voetnoot", "1", "Eerste voetnoot."], ["voetnoot", "2", "Tweede voetnoot."], ["voetnoot", "3", "Bestaande eindnoot."],
    ]);
    expect(lijst(bron)).toHaveLength(3);
  });

  it("zet uitsluitend de gekozen noot om en behoudt de bestaande doelnummering", () => {
    const bron = zetNootInstellingen(gemengd(), "eindnoot", { notatie: "upperRoman", beginBij: 7, herstart: "eachSect", positie: "sectEnd" });
    const uit = converteerNoten(bron, "voetnoot", ["2"]);
    expect(uit.aantal).toBe(1);
    expect(lijst(uit.bytes)).toEqual([
      ["voetnoot", "1", "Eerste voetnoot."], ["eindnoot", "2", "Tweede voetnoot."], ["eindnoot", "1", "Bestaande eindnoot."],
    ]);
    expect(leesNootInstellingen(uit.bytes, "eindnoot")).toEqual(leesNootInstellingen(bron, "eindnoot"));
    expect(new Pakket(uit.bytes).lees("word/endnotes.xml")).toContain("<w:endnoteRef/>");
  });

  it("houdt bij niets omzetten exact de oorspronkelijke bytes en maakt geen onderdelen", () => {
    const bron = gemengd();
    expect(converteerNoten(bron, "voetnoot", []).bytes).toBe(bron);
    const zonder = converteerNoten(bron, "voetnoot").bytes;
    expect(converteerNoten(zonder, "voetnoot")).toEqual({ bytes: zonder, aantal: 0 });
    expect(converteerNoten(zonder, "voetnoot").bytes).toBe(zonder);
  });

  it("maakt bij een nieuw doel de bijbehorende verwijzingen, instellingen en inhoudstypen", () => {
    const bron = wijzig(gemengd(), p => {
      p.schrijf("word/document.xml", p.lees("word/document.xml").replace(/<w:endnoteReference[^>]*\/>/g, ""));
      const r = p.relaties("word/document.xml").find(r => r.type === WREL.endnotes)!;
      p.verwijderRelatie("word/document.xml", r.id); p.verwijder("word/endnotes.xml"); p.verwijderOverride("word/endnotes.xml");
      p.schrijf("word/settings.xml", p.lees("word/settings.xml").replace(/<w:endnotePr\b[\s\S]*?<\/w:endnotePr>/g, ""));
    });
    const uit = converteerNoten(bron, "voetnoot");
    expect(leesNootInstellingen(uit.bytes, "eindnoot")).toMatchObject({ notatie: "lowerRoman", beginBij: 1, positie: "docEnd" });
    const p = new Pakket(uit.bytes), doc = openDocument(p);
    const pad = onderdeelVan(p, doc.pad, WREL.endnotes)!;
    expect(p.heeft(pad)).toBe(true);
    expect(p.lees("[Content_Types].xml")).toContain('PartName="/' + pad + '"');
    expect(p.lees(pad)).toContain('w:type="separator"');
  });

  it("behoudt rijke noten, naamruimten, stijlen, mediabytes en interne/externe relaties bij een ander doelpad", () => {
    const beeld = Uint8Array.of(137, 80, 78, 71, 1, 2, 3, 4);
    const bron = wijzig(gemengd(), p => {
      p.schrijf("word/footnotes.xml", p.lees("word/footnotes.xml").replace('<w:footnotes ', '<w:footnotes xmlns:a="urn:proefbeeld" xmlns:x="urn:behouden" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="x" ')
        .replace("Eerste voetnoot.", "Rijke voetnoot.").replace("</w:footnote>", '</w:footnote>')
        .replace("Rijke voetnoot.</w:t></w:r>", 'Rijke voetnoot.</w:t></w:r><w:r><w:rPr><w:b/><w:color w:val="125AA2"/></w:rPr><w:drawing><a:blip r:embed="rId1"/></w:drawing></w:r><w:hyperlink r:id="rId2"><w:r><w:t>Koppeling</w:t></w:r></w:hyperlink><x:extra x:id="behouden">Eigen uitbreiding</x:extra>'));
      p.schrijf("word/_rels/footnotes.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="beeld" Target="media/proef.png"/><Relationship Id="rId2" Type="koppeling" Target="https://example.invalid/bron" TargetMode="External"/></Relationships>');
      p.schrijf("word/media/proef.png", beeld); p.voegDefaultToe("png", "image/png");
      p.schrijf("word/notes/endnotes.xml", p.bytes("word/endnotes.xml")!); p.verwijder("word/endnotes.xml");
      p.schrijf("word/_rels/document.xml.rels", p.lees("word/_rels/document.xml.rels").replace('Target="endnotes.xml"', 'Target="notes/endnotes.xml"'));
      p.verwijderOverride("word/endnotes.xml"); p.voegOverrideToe("word/notes/endnotes.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml");
      p.schrijf("word/notes/_rels/endnotes.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="koppeling" Target="https://example.invalid/bestaand" TargetMode="External"/></Relationships>');
    });
    const uit = converteerNoten(bron, "voetnoot", ["1"]).bytes;
    const p = new Pakket(uit), voor = new Pakket(bron), xml = p.lees("word/notes/endnotes.xml");
    expect(xml).toContain('xmlns:a="urn:proefbeeld"'); expect(xml).toContain('mc:Ignorable="x"'); expect(xml).toContain('<x:extra x:id="behouden">Eigen uitbreiding</x:extra>');
    expect(xml).toContain('<w:b/>'); expect(xml).toContain('<w:color w:val="125AA2"/>');
    expect(xml).toContain('r:embed="rId2"'); expect(xml).toContain('r:id="rId3"');
    expect(p.doel("word/notes/endnotes.xml", "rId2")).toBe("word/media/proef.png");
    expect(p.relaties("word/notes/endnotes.xml")).toContainEqual({ id: "rId3", type: "koppeling", target: "https://example.invalid/bron", extern: true });
    expect(p.bytes("word/media/proef.png")).toEqual(beeld);
    expect(p.bytes("word/styles.xml")).toEqual(voor.bytes("word/styles.xml"));
    expect(p.bytes("word/_rels/footnotes.xml.rels")).toEqual(voor.bytes("word/_rels/footnotes.xml.rels"));
    const terug = converteerNoten(uit, "eindnoot", ["2"]).bytes;
    expect(new Pakket(terug).relaties("word/footnotes.xml")).toHaveLength(2);
  });

  it("accepteert normale noot-id nul en laat onverwezen noten in de bron", () => {
    // Normale id nul is geldig; ids zijn geen zichtbare volgnummers.
    // https://learn.microsoft.com/dotnet/api/documentformat.openxml.wordprocessing.footnoteendnotetype.id
    const bron = wijzig(gemengd(), p => {
      p.schrijf("word/footnotes.xml", p.lees("word/footnotes.xml").replace('w:type="continuationSeparator" w:id="0"', 'w:type="continuationSeparator" w:id="-2"').replace('<w:footnote w:id="1"', '<w:footnote w:id="0"'));
      p.schrijf("word/document.xml", p.lees("word/document.xml").replace('<w:footnoteReference w:id="1"', '<w:footnoteReference w:id="0"').replace('<w:footnoteReference w:id="2"/>', ''));
    });
    const uit = converteerNoten(bron, "voetnoot");
    expect(uit.aantal).toBe(1);
    expect(new Pakket(uit.bytes).lees("word/footnotes.xml")).toContain("Tweede voetnoot.");
  });

  it("kan een bestaande zelfsluitende doelwortel vullen", () => {
    const bron = wijzig(gemengd(), p => {
      p.schrijf("word/document.xml", p.lees("word/document.xml").replace(/<w:endnoteReference[^>]*\/>/g, ""));
      p.schrijf("word/endnotes.xml", `<w:endnotes xmlns:w="${NS_W}"/>`);
    });
    const p = new Pakket(converteerNoten(bron, "voetnoot").bytes);
    expect(kinderen(leesXml(p.lees("word/endnotes.xml")), "endnote")).toHaveLength(2);
  });

  it.each(["onbekende-keuze", "ontbrekende-noot", "dubbele-id", "ontbrekende-relatie", "ontbrekend-beeld"])("weigert %s zonder de bron te wijzigen", fout => {
    const bron = wijzig(gemengd(), p => {
      if (fout === "ontbrekende-noot") p.schrijf("word/document.xml", p.lees("word/document.xml").replace('<w:footnoteReference w:id="1"', '<w:footnoteReference w:id="99"'));
      if (fout === "dubbele-id") p.schrijf("word/footnotes.xml", p.lees("word/footnotes.xml").replace('<w:footnote w:id="2"', '<w:footnote w:id="1"'));
      if (fout.startsWith("ontbrekend") && !fout.endsWith("noot")) {
        p.schrijf("word/footnotes.xml", p.lees("word/footnotes.xml").replace("Eerste voetnoot.</w:t></w:r>", 'Eerste voetnoot.</w:t></w:r><w:hyperlink r:id="rId7"/>'));
        if (fout === "ontbrekend-beeld") p.schrijf("word/_rels/footnotes.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId7" Type="beeld" Target="media/bestaat-niet.png"/></Relationships>');
      }
    });
    const kopie = bron.slice();
    expect(() => converteerNoten(bron, "voetnoot", fout === "onbekende-keuze" ? ["999"] : undefined)).toThrow(/noten|noot/);
    expect(bron).toEqual(kopie);
  });
});
