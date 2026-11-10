import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { openWorkbook } from "@betteroffice/xlsx";
import { Pakket } from "../grafieken/pakket";
import {
  leesTekenobjecten,
  voegTekenobjectToe,
  wijzigTekenobject,
  type ObjectPlek,
} from "./tekenobjecten";
import {
  bewaarTekenAnkers,
  laadTekenobjecten,
  metTekenAnkers,
  tekenobjecten,
} from "./tekenAnkers";

const BRON = readFileSync("public/templates/nieuw.xlsx");
const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC",
    "base64",
  ),
);
const plek: ObjectPlek = {
  row: 2,
  col: 3,
  x: 4,
  y: 5,
  breedte: 200,
  hoogte: 100,
};
describe("tekenobjecten in werkbladen (#75)", () => {
  it("bewaart niet-ondersteunde geometrie als herkenbaar object bij verplaatsen", () => {
    const bytes = voegTekenobjectToe(BRON, 0, { naam: "Ster", plek, tekst: "Vijf punten" });
    const p = new Pakket(bytes), pad = leesTekenobjecten(bytes)[0].tekening;
    p.schrijf(pad, p.lees(pad).replace('prst="rect"', 'prst="star5"'));
    const bron = p.inpakken(), object = leesTekenobjecten(bron)[0];
    expect(object.soort).toBe("onbekend");
    const verplaatst = wijzigTekenobject(bron, object, { ...plek, row: 8 });
    expect(new Pakket(verplaatst).lees(pad)).toContain('prst="star5"');
    expect(leesTekenobjecten(verplaatst)[0].plek.row).toBe(8);
    expect(leesTekenobjecten(verplaatst)[0].tekst).toBe("Vijf punten");
  });
  it("maakt een afbeelding en tekstvak, verplaatst/schaalt één object en behoudt andere onderdelen", () => {
    const p = new Pakket(BRON);
    p.schrijf("custom/proef.bin", new Uint8Array([1, 2, 3]));
    let bytes = voegTekenobjectToe(p.inpakken(), 0, {
      naam: "Afbeelding & 1",
      plek,
      afbeelding: PNG,
    });
    bytes = voegTekenobjectToe(bytes, 0, {
      naam: "Tekstvak",
      plek: { ...plek, row: 10 },
      tekst: "Regel 1\nTekst < & >",
      vorm: "roundRect",
      vulling: "#FF0000",
    });
    const objecten = leesTekenobjecten(bytes);
    expect(objecten).toHaveLength(2);
    expect(objecten[0]).toMatchObject({
      naam: "Afbeelding & 1",
      soort: "afbeelding",
      plek,
      mime: "image/png",
    });
    expect(objecten[0].media).toEqual(PNG);
    expect(objecten[1]).toMatchObject({
      naam: "Tekstvak",
      soort: "vorm",
      vorm: "roundRect",
      tekst: "Regel 1\nTekst < & >",
      vulling: "#FF0000",
    });
    const nieuw = { ...plek, row: 5, col: 6, breedte: 400, hoogte: 50 };
    const verplaatst = wijzigTekenobject(bytes, objecten[0], nieuw);
    expect(leesTekenobjecten(verplaatst)[0].plek).toEqual(nieuw);
    expect(leesTekenobjecten(verplaatst)[1]).toEqual(objecten[1]);
    const a = new Pakket(bytes),
      b = new Pakket(verplaatst);
    for (const pad of a.namen())
      if (pad !== objecten[0].tekening)
        expect(b.bytes(pad), pad).toEqual(a.bytes(pad));
    const weg = wijzigTekenobject(verplaatst, objecten[0], null);
    expect(leesTekenobjecten(weg)).toHaveLength(1);
    expect(new Pakket(weg).bytes("custom/proef.bin")).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });
  it("bewaart afbeelding, tekst, formaat en anker door de echte opslagkern", () => {
    let bytes = voegTekenobjectToe(BRON, 0, {
      naam: "Logo",
      plek,
      afbeelding: PNG,
    });
    bytes = voegTekenobjectToe(bytes, 0, {
      naam: "Label",
      plek: { ...plek, col: 8 },
      tekst: "Behouden",
      vorm: "ellipse",
    });
    const h = openWorkbook(bytes);
    try {
      h.editCell(0, 0, 0, "gezien");
      const opgeslagen = h.save();
      expect(leesTekenobjecten(opgeslagen)).toEqual(leesTekenobjecten(bytes));
    } finally {
      h.dispose();
    }
  });
  it("laat celankers met ingevoegde rijen en Undo meeschuiven", () => {
    const bytes = metTekenAnkers(
      voegTekenobjectToe(BRON, 0, { naam: "Logo", plek, afbeelding: PNG }),
    );
    const h = openWorkbook(bytes);
    try {
      laadTekenobjecten(h, bytes);
      h.applyOps([{ type: "insertRows", sheet: 0, at: 1, count: 2 }]);
      expect(tekenobjecten(h, 0)[0].plek.row).toBe(plek.row + 2);
      expect(
        leesTekenobjecten(bewaarTekenAnkers(h, h.save()))[0].plek.row,
      ).toBe(plek.row + 2);
      h.undo();
      expect(
        leesTekenobjecten(bewaarTekenAnkers(h, h.save()))[0].plek.row,
      ).toBe(plek.row);
      h.applyOps([{ type: "deleteRows", sheet: 0, at: 1, count: 4 }]);
      expect(tekenobjecten(h, 0)[0].plek.row).toBe(1);
      expect(
        leesTekenobjecten(bewaarTekenAnkers(h, h.save()))[0].plek.row,
      ).toBe(1);
      h.undo();
      expect(tekenobjecten(h, 0)[0].plek.row).toBe(plek.row);
      h.applyOps([{ type: "deleteCols", sheet: 0, at: 1, count: 4 }]);
      expect(tekenobjecten(h, 0)[0].plek.col).toBe(1);
      h.undo();
      expect(tekenobjecten(h, 0)[0].plek.col).toBe(plek.col);
    } finally {
      h.dispose();
    }
  });
  it("weigert ongeldige afmetingen, media en beveiligde tekenobjecten", () => {
    expect(() =>
      voegTekenobjectToe(BRON, 0, {
        naam: "x",
        plek: { ...plek, breedte: NaN },
      }),
    ).toThrow();
    expect(() =>
      voegTekenobjectToe(BRON, 0, {
        naam: "x",
        plek,
        afbeelding: new Uint8Array([1]),
      }),
    ).toThrow();
    const bytes = voegTekenobjectToe(BRON, 0, {
      naam: "Logo",
      plek,
      afbeelding: PNG,
    });
    const p = new Pakket(bytes),
      xml = p.lees("xl/worksheets/sheet1.xml");
    p.schrijf(
      "xl/worksheets/sheet1.xml",
      xml.replace(
        "</sheetData>",
        '</sheetData><sheetProtection sheet="1" objects="1"/>',
      ),
    );
    // Het sjabloon kan ook een zelfsluitende sheetData gebruiken.
    if (!p.lees("xl/worksheets/sheet1.xml").includes("sheetProtection"))
      p.schrijf(
        "xl/worksheets/sheet1.xml",
        xml.replace(
          /<sheetData\s*\/>/,
          '<sheetData/><sheetProtection sheet="1" objects="1"/>',
        ),
      );
    const doel = leesTekenobjecten(p.inpakken())[0];
    expect(doel.beveiligd).toBe(true);
    expect(() => wijzigTekenobject(p.inpakken(), doel, plek)).toThrow();
  });
  it("leest een lege tekening en bewerkt gedeelde tekeningen uitsluitend op het gekozen blad", () => {
    let bytes = voegTekenobjectToe(BRON, 0, {
      naam: "Gedeeld",
      plek,
      tekst: "Origineel",
    });
    const p = new Pakket(bytes);
    p.schrijf("xl/worksheets/sheet2.xml", p.lees("xl/worksheets/sheet1.xml"));
    p.schrijf(
      "xl/worksheets/_rels/sheet2.xml.rels",
      p.lees("xl/worksheets/_rels/sheet1.xml.rels"),
    );
    p.voegOverrideToe(
      "xl/worksheets/sheet2.xml",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml",
    );
    const id = p.voegRelatieToe(
      "xl/workbook.xml",
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet",
      "xl/worksheets/sheet2.xml",
    );
    p.schrijf(
      "xl/workbook.xml",
      p
        .lees("xl/workbook.xml")
        .replace(
          "</sheets>",
          `<sheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" name="Kopie" sheetId="2" r:id="${id}"/></sheets>`,
        ),
    );
    bytes = p.inpakken();
    const objecten = leesTekenobjecten(bytes);
    expect(objecten).toHaveLength(2);
    const gewijzigd = wijzigTekenobject(
      bytes,
      objecten[1],
      { ...plek, row: 12 },
      { tekst: "Nieuw", naam: "Andere naam" },
    );
    const terug = leesTekenobjecten(gewijzigd);
    expect(terug[0]).toEqual(objecten[0]);
    expect(terug[1]).toMatchObject({
      naam: "Andere naam",
      tekst: "Nieuw",
      plek: { row: 12 },
    });
    expect(terug[1].tekening).not.toBe(terug[0].tekening);
    const leeg = new Pakket(bytes);
    leeg.schrijf(
      objecten[0].tekening,
      '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"/>',
    );
    expect(
      leesTekenobjecten(
        voegTekenobjectToe(leeg.inpakken(), 0, {
          naam: "Nieuw",
          plek,
          tekst: "Tekst",
        }),
      ),
    ).toHaveLength(1);
  });
  it("bewaart uitsnede, spiegeling, rotatie en tekststijl bij positie- en tekstwijzigingen", () => {
    let bytes = voegTekenobjectToe(BRON, 0, {
      naam: "Beeld",
      plek,
      afbeelding: PNG,
    });
    bytes = voegTekenobjectToe(bytes, 0, {
      naam: "Tekst",
      plek: { ...plek, row: 12 },
      tekst: "Origineel",
    });
    const p = new Pakket(bytes),
      pad = leesTekenobjecten(bytes)[0].tekening;
    p.schrijf(
      pad,
      p
        .lees(pad)
        .replace(
          "<a:stretch>",
          '<a:srcRect l="10000" t="20000" r="15000" b="5000"/><a:stretch>',
        )
        .replace(
          "<xdr:spPr>",
          '<xdr:spPr><a:xfrm flipH="1" rot="1800000"><a:off x="0" y="0"/><a:ext cx="1905000" cy="952500"/></a:xfrm>',
        )
        .replace(
          "<a:r><a:t>Origineel",
          '<a:r><a:rPr sz="1800" b="1" i="1"><a:solidFill><a:srgbClr val="AA2233"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>Origineel',
        ),
    );
    bytes = p.inpakken();
    const [beeld, tekst] = leesTekenobjecten(bytes);
    expect(beeld).toMatchObject({
      spiegelX: true,
      rotatie: 30,
      uitsnede: { links: 0.1, boven: 0.2, rechts: 0.15, onder: 0.05 },
    });
    expect(tekst.tekstOpmaak[0].stukken[0]).toMatchObject({
      grootte: 24,
      vet: true,
      cursief: true,
      kleur: "#AA2233",
      lettertype: "Arial",
    });
    const verplaatst = wijzigTekenobject(bytes, beeld, {
      ...plek,
      row: 6,
      breedte: 400,
    });
    const vernieuwd = wijzigTekenobject(verplaatst, tekst, tekst.plek, {
      tekst: "Nieuw",
    });
    expect(leesTekenobjecten(vernieuwd)[0]).toMatchObject({
      spiegelX: true,
      rotatie: 30,
      uitsnede: beeld.uitsnede,
      plek: { breedte: 400 },
    });
    expect(
      leesTekenobjecten(vernieuwd)[1].tekstOpmaak[0].stukken[0],
    ).toMatchObject({
      tekst: "Nieuw",
      grootte: 24,
      vet: true,
      cursief: true,
      kleur: "#AA2233",
      lettertype: "Arial",
    });
  });
});
