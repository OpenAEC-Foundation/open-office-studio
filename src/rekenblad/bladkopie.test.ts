import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { openWorkbook } from "@betteroffice/xlsx";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { Pakket } from "../grafieken/pakket";
import { attr, kind, kinderen, leesXml, tekstVan } from "../grafieken/xml";
import { lijstGrafieken, voegGrafiekToeXlsx } from "../grafieken/documenten";
import { gegevensUitRaster, standaardModel } from "../grafieken/model";
import { kopieerWerkblad } from "./bladkopie";
import { bladKopieren } from "./bladen";
import { kopieFormule } from "./bladkopieFormules";
import { werkbladDeel } from "./pakket";
import { NS, sectie } from "./werkboekXml";
import { leesCelnotities, schrijfCelnotitie } from "./celnotities";
import { leesDiscussies, wijzigDiscussie } from "./discussies";
import {
  metCelnotitieAnkers,
  laadCelnotities,
  bewaarCelnotitieAnkers,
} from "./celnotitieAnkers";
import {
  metTekenAnkers,
  laadTekenobjecten,
  bewaarTekenAnkers,
} from "./tekenAnkers";
import {
  leesTekenobjecten,
  voegTekenobjectToe,
  wijzigTekenobject,
} from "./tekenobjecten";

const bron = () => new Uint8Array(readFileSync("public/templates/nieuw.xlsx"));
const rel =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";
const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC",
    "base64",
  ),
);
const plek = { row: 4, col: 4, x: 0, y: 0, breedte: 200, hoogte: 100 };
const display = (
  h: ReturnType<typeof openWorkbook>,
  sheet: number,
  row: number,
  col: number,
) => {
  const read = h.readCells({
    ranges: [
      {
        sheetId: h.sheetInfo().sheetIds[sheet],
        range: { kind: "rowCol", start: { row, col }, end: { row, col } },
      },
    ],
  });
  if (!read.ok) throw Error(read.failure.message);
  return read.ranges[0].cells[0][0].displayText;
};
const bladXml = (bytes: Uint8Array, i: number) => {
  const p = new Pakket(bytes);
  return p.lees(werkbladDeel(p, i).pad);
};

describe("complete worksheet copy (#61)", () => {
  it("rebinds self references, but retains literal strings, external books, other sheets and structured headings", () => {
    expect(
      kopieFormule(
        `SUM('Jan''s'!A1,jan!B2,"Jan's!A1",'[book.xlsx]Jan''s'!A1,Other!A1)`,
        "Jan's",
        "New's",
      ),
    ).toBe(
      `SUM('New''s'!A1,jan!B2,"Jan's!A1",'[book.xlsx]Jan''s'!A1,Other!A1)`,
    );
    expect(
      kopieFormule(
        "Data!A1+[1]Data!A1+Other:Data!A1+Data:Other!A1+SUM(T[Data!A1])+T[[#Headers],[A]]",
        "Data",
        "Copy",
        new Map([["t", "T_2"]]),
      ),
    ).toBe(
      "'Copy'!A1+[1]Data!A1+Other:Data!A1+Data:Other!A1+SUM(T_2[Data!A1])+T_2[[#Headers],[A]]",
    );
  });

  it("retains sparse cells, metadata and self formulas; copied and source cells recalculate independently after reopen", () => {
    const h = openWorkbook(bron());
    h.editCell(0, 0, 0, "7");
    h.editCell(0, 0, 1, "='Blad 1'!A1*2");
    h.patchRangeStyle(0, "XFD1048576", { bold: true });
    h.applyOps([
      { type: "setColWidth", sheet: 0, col: 150, width: 28 },
      { type: "setRowHeight", sheet: 0, row: 1500, height: 29 },
      {
        type: "setFreezePane",
        sheet: 0,
        pane: { rows: 2, cols: 1, top_left: { row: 2, col: 1 } },
      },
    ]);
    const p = new Pakket(h.save()),
      { pad } = werkbladDeel(p, 0);
    sectie(
      p,
      pad,
      "conditionalFormatting",
      `<conditionalFormatting sqref="A1"><cfRule type="expression" priority="1"><formula>'Blad 1'!A1&gt;5</formula></cfRule></conditionalFormatting>`,
    );
    sectie(
      p,
      pad,
      "dataValidations",
      `<dataValidations count="1"><dataValidation type="custom" sqref="C3"><formula1>'Blad 1'!A1&lt;99</formula1></dataValidation></dataValidations>`,
    );
    sectie(
      p,
      pad,
      "hyperlinks",
      `<hyperlinks><hyperlink ref="D4" location="'Blad 1'!A1"/></hyperlinks>`,
    );
    p.schrijf("custom/unchanged.bin", new Uint8Array([0, 1, 255]));
    const input = p.inpakken(),
      before = input.slice();
    const uit = kopieerWerkblad(input, 0, 0, "Copy");
    expect(input).toEqual(before);
    const xml = bladXml(uit.bytes, 0);
    expect(xml).toContain("'Copy'!A1*2");
    expect(xml).toContain("'Copy'!A1&gt;5");
    expect(xml).toContain("'Copy'!A1&lt;99");
    expect(xml).toContain("location=\"'Copy'!A1\"");
    expect(new Pakket(uit.bytes).bytes("custom/unchanged.bin")).toEqual(
      new Uint8Array([0, 1, 255]),
    );
    const copy = openWorkbook(uit.bytes);
    expect(copy.sheetInfo().sheetNames).toEqual(["Copy", "Blad 1"]);
    expect(copy.sheetInfo().frozenRows).toBe(2);
    expect(copy.selectionFormatting(0, "XFD1048576").bold).toBe(true);
    expect(
      copy.cellPosition(0, 0, 151).x - copy.cellPosition(0, 0, 150).x,
    ).toBe(copy.cellPosition(1, 0, 151).x - copy.cellPosition(1, 0, 150).x);
    copy.editCell(0, 0, 0, "11");
    expect(display(copy, 0, 0, 1)).toBe("22");
    expect(display(copy, 1, 0, 1)).toBe("14");
    const reopened = openWorkbook(copy.save());
    expect(display(reopened, 0, 0, 1)).toBe("22");
    expect(display(reopened, 1, 0, 1)).toBe("14");
  });

  it("copies drawings, media, chart relationships, legacy notes and threaded replies into independent parts", () => {
    let bytes = voegTekenobjectToe(bron(), 0, {
      naam: "Picture",
      plek,
      afbeelding: png,
    });
    bytes = voegTekenobjectToe(bytes, 0, {
      naam: "Text",
      plek: { ...plek, row: 12 },
      tekst: "Source text",
    });
    bytes = schrijfCelnotitie(bytes, 0, "A1", {
      auteur: "Anna",
      tekst: "A note",
      zichtbaar: false,
    });
    bytes = wijzigDiscussie(bytes, 0, {
      soort: "nieuw",
      cel: "B2",
      auteur: "Anna",
      tekst: "Question",
    });
    bytes = wijzigDiscussie(bytes, 0, {
      soort: "antwoord",
      id: leesDiscussies(bytes)[0][0].id,
      auteur: "Bob",
      tekst: "Answer",
    });
    bytes = voegGrafiekToeXlsx(
      bytes,
      standaardModel({
        ...gegevensUitRaster(
          [
            ["", "Data"],
            ["One", 7],
            ["Two", 8],
          ],
          { koprij: true, kopkolom: true, reeksenIn: "kolommen" },
          { blad: "Blad 1", top: 0, left: 0 },
        ),
      }),
      { blad: 0, row: 20, col: 0 },
    ).bytes;
    const uit = kopieerWerkblad(bytes, 0, 1, "Copy").bytes;
    const objects = leesTekenobjecten(uit),
      source = objects.filter((o) => o.blad === 0),
      copy = objects.filter((o) => o.blad === 1);
    expect(copy.map((o) => [o.naam, o.soort, o.tekst, o.plek])).toEqual(
      source.map((o) => [o.naam, o.soort, o.tekst, o.plek]),
    );
    expect(copy[0].tekening).not.toBe(source[0].tekening);
    const packageCopy = new Pakket(uit);
    const media = (pad: string) =>
      packageCopy
        .relaties(pad)
        .filter((r) => r.type.endsWith("/image"))
        .map((r) => Pakket.doelPad(pad, r.target));
    expect(media(copy[0].tekening)).not.toEqual(media(source[0].tekening));
    expect(copy[0].media).toEqual(png);
    const notes = leesCelnotities(uit);
    expect(notes[1]).toEqual(notes[0]);
    const threads = leesDiscussies(uit);
    expect(threads[1][0].id).not.toBe(threads[0][0].id);
    expect(threads[1][0].berichten.map((b) => [b.auteur, b.tekst])).toEqual(
      threads[0][0].berichten.map((b) => [b.auteur, b.tekst]),
    );
    expect(
      new Set(
        threads.flatMap((s) => s.flatMap((t) => t.berichten.map((b) => b.id))),
      ).size,
    ).toBe(4);
    const charts = lijstGrafieken(uit, "xlsx"),
      p = new Pakket(uit);
    expect(charts.map((c) => c.blad)).toEqual([0, 1]);
    expect(charts[0].chartPad).not.toBe(charts[1].chartPad);
    expect(p.lees(charts[1].chartPad)).toContain("'Copy'!$B$2:$B$3");
    expect(p.lees(charts[0].chartPad)).toContain("'Blad 1'!$B$2:$B$3");
    const moved = wijzigTekenobject(uit, copy[0], { ...plek, row: 30 });
    expect(
      leesTekenobjecten(moved).find(
        (o) => o.blad === 0 && o.naam === "Picture",
      )!.plek,
    ).toEqual(plek);
    expect(
      leesTekenobjecten(moved).find(
        (o) => o.blad === 1 && o.naam === "Picture",
      )!.plek.row,
    ).toBe(30);
    const changed = wijzigDiscussie(uit, 1, {
      soort: "oplossen",
      id: threads[1][0].id,
      opgelost: true,
    });
    expect(leesDiscussies(changed)[0][0].opgelost).toBe(false);
    expect(leesDiscussies(changed)[1][0].opgelost).toBe(true);

    // Match the app's reload/save pipeline, then structurally edit the copy only.
    const anchored = metTekenAnkers(metCelnotitieAnkers(uit)),
      h = openWorkbook(anchored);
    laadTekenobjecten(h, anchored);
    laadCelnotities(h, anchored);
    h.applyOps([{ type: "insertRows", sheet: 1, at: 0, count: 2 }]);
    const saved = bewaarCelnotitieAnkers(h, bewaarTekenAnkers(h, h.save()));
    expect(
      leesTekenobjecten(saved)
        .filter((o) => o.blad === 0)
        .map((o) => o.plek),
    ).toEqual(source.map((o) => o.plek));
    expect(
      leesTekenobjecten(saved)
        .filter((o) => o.blad === 1)
        .map((o) => o.plek.row),
    ).toEqual(copy.map((o) => o.plek.row + 2));
    expect(leesCelnotities(saved)[0][0].cel).toBe("A1");
    expect(leesCelnotities(saved)[1][0].cel).toBe("A3");
    expect(leesDiscussies(saved)[0][0].cel).toBe("B2");
    expect(leesDiscussies(saved)[1][0].cel).toBe("B4");
    expect(lijstGrafieken(saved, "xlsx")).toHaveLength(2);
    h.dispose();
  });

  it("allocates workbook-unique table names/IDs and rebinds structured references", () => {
    const h = openWorkbook(bron());
    h.editCell(0, 0, 0, "Amount");
    h.editCell(0, 1, 0, "7");
    h.editCell(0, 2, 0, "8");
    const p = new Pakket(h.save()),
      { pad } = werkbladDeel(p, 0);
    const id = p.voegRelatieToe(pad, rel + "table", "xl/tables/table1.xml");
    p.schrijf(
      "xl/tables/table1.xml",
      `<table xmlns="${NS}" id="1" name="Data" displayName="Data" ref="A1:A3" totalsRowShown="0"><autoFilter ref="A1:A3"/><tableColumns count="1"><tableColumn id="1" name="Amount"/></tableColumns></table>`,
    );
    p.voegOverrideToe(
      "xl/tables/table1.xml",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml",
    );
    sectie(
      p,
      pad,
      "tableParts",
      `<tableParts count="1"><tablePart xmlns:r="${rel.slice(0, -1)}" r:id="${id}"/></tableParts>`,
    );
    const loaded = openWorkbook(p.inpakken());
    loaded.editCell(0, 1, 1, "=SUM(Data[Amount])");
    const bytes = kopieerWerkblad(loaded.save(), 0, 1, "Copy").bytes,
      q = new Pakket(bytes);
    const tables = q
      .namen()
      .filter((n) => /tables\/.*\.xml$/.test(n))
      .map((n) => leesXml(q.lees(n)));
    expect(tables.map((t) => attr(t, "id")).sort()).toEqual(["1", "2"]);
    expect(tables.map((t) => attr(t, "displayName")).sort()).toEqual([
      "Data",
      "Data_2",
    ]);
    const copy = openWorkbook(bytes);
    copy.editCell(1, 1, 0, "20");
    expect(display(copy, 1, 1, 1)).toBe("28");
    expect(display(copy, 0, 1, 1)).toBe("15");
  });

  it("duplicates scoped names, shifts existing scopes and drops the obsolete calc chain", () => {
    const h = openWorkbook(bron());
    h.applyOps([{ type: "addSheet", index: 1, name: "Other" }]);
    const p = new Pakket(h.save());
    p.schrijf(
      "xl/workbook.xml",
      p
        .lees("xl/workbook.xml")
        .replace(
          "</sheets>",
          `</sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">'Blad 1'!$A$1:$C$9</definedName><definedName name="Local" localSheetId="1">Other!$A$1</definedName><definedName name="Global">'Blad 1'!$A$1</definedName></definedNames>`,
        ),
    );
    p.schrijf(
      "xl/calcChain.xml",
      `<calcChain xmlns="${NS}"><c r="A1" i="1"/></calcChain>`,
    );
    p.voegOverrideToe(
      "xl/calcChain.xml",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.calcChain+xml",
    );
    p.voegRelatieToe("xl/workbook.xml", rel + "calcChain", "xl/calcChain.xml");
    const q = new Pakket(kopieerWerkblad(p.inpakken(), 0, 0, "Copy").bytes);
    const names = kinderen(
      kind(leesXml(q.lees("xl/workbook.xml")), "definedNames"),
      "definedName",
    );
    expect(
      names.map((n) => [attr(n, "name"), attr(n, "localSheetId"), tekstVan(n)]),
    ).toEqual([
      ["_xlnm.Print_Area", "1", "'Blad 1'!$A$1:$C$9"],
      ["Local", "2", "Other!$A$1"],
      ["Global", undefined, "'Blad 1'!$A$1"],
      ["_xlnm.Print_Area", "0", "'Copy'!$A$1:$C$9"],
    ]);
    expect(q.heeft("xl/calcChain.xml")).toBe(false);
    expect(q.lees("[Content_Types].xml")).not.toContain("calcChain.xml");
    expect(
      q.relaties("xl/workbook.xml").some((r) => r.type.endsWith("/calcChain")),
    ).toBe(false);
  });

  it("retains shared/array formulas, sheet protection, hidden metadata and unknown extensions without a dense cell scan", () => {
    const p = new Pakket(bron()),
      { pad } = werkbladDeel(p, 0);
    const marker =
      '<extLst><ext uri="keep"><custom xmlns="urn:test" attr="1 &gt; 0"><![CDATA[Blad 1!A1]]></custom></ext></extLst>';
    sectie(
      p,
      pad,
      "sheetPr",
      '<sheetPr codeName="OriginalCode"><tabColor rgb="FFFF0000"/></sheetPr>',
    );
    sectie(
      p,
      pad,
      "cols",
      '<cols><col min="10000" max="10001" hidden="1" width="25" customWidth="1"/></cols>',
    );
    sectie(
      p,
      pad,
      "sheetData",
      `<sheetData><row r="1"><c r="A1"><f t="shared" si="0" ref="A1:A2">'Blad 1'!B1*2</f><v>14</v></c><c r="C1"><f t="array" ref="C1:C2">'Blad 1'!B1:B2*3</f><v>21</v></c></row><row r="2" hidden="1" outlineLevel="1"><c r="A2"><f t="shared" si="0"/><v>16</v></c></row><row r="1048576"><c r="XFD1048576" s="0"/></row></sheetData>`,
    );
    sectie(
      p,
      pad,
      "sheetProtection",
      '<sheetProtection sheet="1" objects="1" password="ABCD"/>',
    );
    sectie(p, pad, "extLst", marker);
    const bytes = kopieerWerkblad(p.inpakken(), 0, 1, "New's").bytes,
      xml = bladXml(bytes, 1);
    expect(xml).toContain(marker);
    expect(xml).toContain('codeName="OosSheet_2"');
    expect(xml).toContain(
      '<f t="shared" si="0" ref="A1:A2">\'New\'\'s\'!B1*2</f>',
    );
    expect(xml).toContain('<f t="shared" si="0"/>');
    expect(xml).toContain("<f t=\"array\" ref=\"C1:C2\">'New''s'!B1:B2*3</f>");
    expect(xml).toContain(
      '<sheetProtection sheet="1" objects="1" password="ABCD"/>',
    );
    expect(xml).toContain(
      '<col min="10000" max="10001" hidden="1" width="25" customWidth="1"/>',
    );
    expect(xml).toContain('<row r="1048576"><c r="XFD1048576" s="0"/></row>');
    expect(bladXml(bytes, 0)).toContain('codeName="OriginalCode"');
  });

  it("refuses unsupported macro/control/PivotChart copies and missing dependent parts atomically", () => {
    for (const type of ["vbaProject", "control"]) {
      const p = new Pakket(bron()),
        { pad } = werkbladDeel(p, 0);
      p.schrijf("xl/unsupported.bin", new Uint8Array([1]));
      p.voegOverrideToe("xl/unsupported.bin", "application/octet-stream");
      p.voegRelatieToe(
        type === "vbaProject" ? "xl/workbook.xml" : pad,
        rel + type,
        "xl/unsupported.bin",
      );
      const bytes = p.inpakken(),
        before = bytes.slice();
      expect(() => kopieerWerkblad(bytes, 0, 1, "Copy")).toThrow(
        /not supported|niet ondersteund|niet-ondersteund/i,
      );
      expect(bytes).toEqual(before);
    }
    const p = new Pakket(bron()),
      { pad } = werkbladDeel(p, 0);
    p.schrijf(
      "xl/charts/chart1.xml",
      '<chartSpace xmlns="http://schemas.openxmlformats.org/drawingml/2006/chart"><pivotSource><name>Pivot</name></pivotSource></chartSpace>',
    );
    p.voegOverrideToe(
      "xl/charts/chart1.xml",
      "application/vnd.openxmlformats-officedocument.drawingml.chart+xml",
    );
    p.voegRelatieToe(pad, rel + "chart", "xl/charts/chart1.xml");
    expect(() => kopieerWerkblad(p.inpakken(), 0, 1, "Copy")).toThrow(
      /PivotChart|draaigrafiek/i,
    );
    p.verwijder("xl/charts/chart1.xml");
    expect(() => kopieerWerkblad(p.inpakken(), 0, 1, "Copy")).toThrow();
  });

  it("refuses invalid names/positions and protected workbook structure without touching the source", () => {
    const bytes = bron(),
      before = bytes.slice();
    for (const [positie, naam] of [
      [1, "Blad 1"],
      [1, "bad/name"],
      [-1, "Copy"],
      [2, "Copy"],
      [0.5, "Copy"],
    ] as const)
      expect(() => kopieerWerkblad(bytes, 0, positie, naam)).toThrow();
    expect(bytes).toEqual(before);
    const p = new Pakket(bytes);
    p.schrijf(
      "xl/workbook.xml",
      p
        .lees("xl/workbook.xml")
        .replace("<sheets>", '<workbookProtection lockStructure="1"/><sheets>'),
    );
    expect(() => kopieerWerkblad(p.inpakken(), 0, 1, "Copy")).toThrow(
      /beveiligd|protected/i,
    );
  });

  it("keeps opaque dependency bytes, external relationships and cycles intact without modifying shared workbook parts", () => {
    const p = new Pakket(bron()),
      { pad } = werkbladDeel(p, 0);
    p.schrijf("custom/item.bin", new Uint8Array([0, 255, 12]));
    p.voegOverrideToe("custom/item.bin", "application/octet-stream");
    p.voegRelatieToe(pad, "urn:test:opaque", "custom/item.bin");
    p.voegRelatieToe("custom/item.bin", "urn:test:cycle", pad);
    const url = "https://example.invalid/a?x=1&y=2";
    const relatiesPad = Pakket.relsPad(pad);
    p.schrijf(
      relatiesPad,
      p
        .lees(relatiesPad)
        .replace(
          "</Relationships>",
          `<Relationship Id="external" Type="${rel}hyperlink" Target="https://example.invalid/a?x=1&amp;y=2" TargetMode="External" custom="keep"/></Relationships>`,
        ),
    );
    p.voegRelatieToe(pad, "urn:test:global", "xl/styles.xml");
    const bytes = p.inpakken(),
      q = new Pakket(kopieerWerkblad(bytes, 0, 1, "Copy").bytes),
      copyPad = werkbladDeel(q, 1).pad;
    const opaque = q
        .relaties(copyPad)
        .find((r) => r.type === "urn:test:opaque")!,
      target = Pakket.doelPad(copyPad, opaque.target);
    expect(target).not.toBe("custom/item.bin");
    expect(q.bytes(target)).toEqual(new Uint8Array([0, 255, 12]));
    const cycle = q.relaties(target)[0];
    expect(Pakket.doelPad(target, cycle.target)).toBe(copyPad);
    expect(q.relaties(copyPad).find((r) => r.extern)?.target).toBe(url);
    expect(q.namen().filter((n) => /styles.*\.xml$/.test(n))).toEqual([
      "xl/styles.xml",
    ]);
    expect(q.lees("xl/styles.xml")).toBe(p.lees("xl/styles.xml"));
  });

  it("rejects a stale dialog, readonly editor or cancellation before replacement, including changes during saving", async () => {
    const h = openWorkbook(bron());
    let readonly = false;
    const api = {
      handle: h,
      commands: {
        getState: () =>
          readonly
            ? { disabledReason: { code: "read-only" } }
            : { enabled: true },
      },
    } as unknown as XlsxEditorApi;
    const vervang = vi.fn(),
      sluiten = vi.fn(),
      bytes = vi.fn(async () => h.save());
    const opties = {
      herlaad: { bytes, vervang },
      bron: 0,
      versie: h.version(),
      voorVervangen: sluiten,
    };
    readonly = true;
    await expect(bladKopieren(api, 1, "Copy", opties)).rejects.toThrow();
    expect(bytes).not.toHaveBeenCalled();
    readonly = false;
    h.editCell(0, 0, 0, "1");
    await expect(bladKopieren(api, 1, "Copy", opties)).rejects.toThrow();
    expect(bytes).not.toHaveBeenCalled();
    opties.versie = h.version();
    bytes.mockImplementationOnce(async () => {
      const snapshot = h.save();
      h.editCell(0, 0, 0, "2");
      return snapshot;
    });
    await expect(bladKopieren(api, 1, "Copy", opties)).rejects.toThrow();
    opties.versie = h.version();
    bytes.mockImplementationOnce(async () => {
      readonly = true;
      return h.save();
    });
    await expect(bladKopieren(api, 1, "Copy", opties)).rejects.toThrow();
    readonly = false;
    const controller = new AbortController();
    bytes.mockImplementationOnce(async () => {
      controller.abort();
      return h.save();
    });
    expect(
      await bladKopieren(api, 1, "Copy", {
        ...opties,
        signal: controller.signal,
      }),
    ).toBe(false);
    expect(vervang).not.toHaveBeenCalled();
    expect(sluiten).not.toHaveBeenCalled();
    bytes.mockImplementationOnce(async () => h.save());
    expect(await bladKopieren(api, 1, "Copy", opties)).toBe(true);
    expect(sluiten).toHaveBeenCalledTimes(1);
    expect(vervang).toHaveBeenCalledTimes(1);
    expect(sluiten.mock.invocationCallOrder[0]).toBeLessThan(
      vervang.mock.invocationCallOrder[0],
    );
    expect(
      openWorkbook(vervang.mock.calls[0][0]).sheetInfo().sheetNames,
    ).toEqual(["Blad 1", "Copy"]);
    expect(h.sheetInfo().sheetNames).toEqual(["Blad 1"]);
  });
});
