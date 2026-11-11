import { describe, expect, it } from "vitest";
import { strToU8, unzipSync, zipSync } from "fflate";
import { Pakket } from "./pakket";
import { zipDelen, voegZipDelenSamen } from "./zipdelen";
import { attr, kind, leesWerkbladXml, leesXml, tekstVan, vervang } from "./xml";
const types = '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>';
describe("grote OOXML-pakketten (#74)", () => {
  it("kopieert een ongewijzigd groot onderdeel gecomprimeerd en isoleert afzonderlijke pakketten", () => {
    const groot = strToU8("<sheetData>" + '<row><c r="A1"><v>1234</v></c></row>'.repeat(100000) + "</sheetData>");
    const bron = zipSync({ "[Content_Types].xml": strToU8(types), "xl/large.xml": groot, "metadata.xml": strToU8("<a/>") });
    const a = new Pakket(bron), b = new Pakket(bron);
    a.schrijf("metadata.xml", "<a changed=\"true\"/>");
    const uit = a.inpakken();
    expect(zipDelen(uit)!.find((d) => d.naam === "xl/large.xml")!.lokaal).toEqual(zipDelen(bron)!.find((d) => d.naam === "xl/large.xml")!.lokaal);
    expect(Buffer.from(unzipSync(uit)["xl/large.xml"]).equals(Buffer.from(groot))).toBe(true);
    const bytes = a.bytes("metadata.xml")!; bytes[1] = 98;
    expect(b.lees("metadata.xml")).toBe("<a/>");
    const c = new Pakket(bron), geleend = c.bytes("metadata.xml")!; geleend[1] = 98;
    expect(new Pakket(c.inpakken()).lees("metadata.xml")).toBe("<b/>");
  });
  it("voegt onderdelen toe, verwijdert onderdelen en behoudt UTF-8-namen en opgeslagen data", () => {
    const bron = zipSync({ "[Content_Types].xml": strToU8(types), "oud.xml": strToU8("<old/>"), "één.bin": [new Uint8Array([0, 255, 17]), { level: 0 }] });
    const p = new Pakket(bron); p.verwijder("oud.xml"); p.schrijf("nieuw.xml", "<new/>");
    const terug = unzipSync(p.inpakken());
    expect(Object.keys(terug).sort()).toEqual(["[Content_Types].xml", "nieuw.xml", "één.bin"].sort());
    expect(terug["één.bin"]).toEqual(new Uint8Array([0, 255, 17]));
    expect(zipDelen(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(unzipSync(voegZipDelenSamen([]))).toEqual({});
  });
  it("handhaaft ZIP-grootte-, onderdeelnaam- en inhoudstypelimieten vóór uitpakken", () => {
    expect(() => new Pakket(zipSync({ "../escape.xml": strToU8("x"), "[Content_Types].xml": strToU8(types) }))).toThrow();
    expect(() => new Pakket(zipSync({ "a.xml": strToU8("x") }))).toThrow();
    const bron = zipSync({ "[Content_Types].xml": strToU8(types), "te-groot.bin": new Uint8Array([0]) });
    const d = new DataView(bron.buffer); let pos = 0;
    for (; pos < bron.length - 46; pos++) if (d.getUint32(pos, true) === 0x02014b50 && d.getUint32(pos + 24, true) === 1) { d.setUint32(pos + 24, 401 * 1024 * 1024, true); break; }
    expect(() => new Pakket(bron)).toThrow();
  });
  it("leest metadata naast honderdduizend rijen zonder celboom en behoudt exacte bronposities", () => {
    const data = '<row><c><v>12</v><is><t><![CDATA[</x:sheetData>]]></t></is></c></row>'.repeat(100000);
    const xml = `<x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData>${data}</x:sheetData><x:autoFilter ref="A1:AD100000"/></x:worksheet>`;
    const root = leesWerkbladXml(xml), cellen = kind(root, "sheetData")!, filter = kind(root, "autoFilter")!;
    expect(cellen.kinderen).toHaveLength(0); expect(attr(filter, "ref")).toBe("A1:AD100000");
    expect(xml.slice(cellen.inhoudStart, cellen.inhoudEind)).toBe(data);
    const uit = vervang(xml, [{ start: filter.start, eind: filter.eind, tekst: '<x:autoFilter ref="B1:C3"/>' }]);
    expect(uit).toContain(data); expect(attr(kind(leesWerkbladXml(uit), "autoFilter"), "ref")).toBe("B1:C3");
    expect(tekstVan(kind(leesXml('<r><sheetData><v>12</v></sheetData></r>'), "sheetData"))).toBe("12");
    expect(() => leesWerkbladXml("<worksheet><sheetData>bad")).toThrow();
  });
});
