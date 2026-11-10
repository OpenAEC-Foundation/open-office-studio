import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { openWorkbook, type WorkbookHandle } from "@betteroffice/xlsx";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  bewaarVoorwaardelijkeRegels,
  leesVoorwaardelijkeRegels,
  nieuweVoorwaardelijkeRegel,
  nieuweVisueleRegel,
  voorwaardelijkVoorbeeld,
  wijzigVoorwaardelijkeRegel,
} from "./voorwaardelijke-opmaak";
import { bereidVoorwaardelijkeWeergave } from "./voorwaardelijke-weergave";

const boeken: WorkbookHandle[] = [];
afterEach(() => boeken.splice(0).forEach((h) => h.dispose()));
function boek(bytes: Uint8Array = readFileSync("public/templates/nieuw.xlsx")) {
  const h = openWorkbook(bytes);
  boeken.push(h);
  return h;
}
function api(h: WorkbookHandle, readOnly = false) {
  return {
    handle: h,
    version: async () => h.version(),
    commands: {
      getState: () => ({
        enabled: !readOnly,
        ...(readOnly ? { disabledReason: { code: "read-only" } } : {}),
      }),
    },
    focus() {},
  } as unknown as XlsxEditorApi;
}
const viewport = { x: 0, y: 0, width: 320, height: 180 };
const tekst = (h: WorkbookHandle, waarde: string) =>
  h
    .displayList(viewport)
    .commands.find((c) => c.op === "text" && c.text === waarde);

describe("voorwaardelijke regels beheren en bewaren (#67)", () => {
  it("bewaart gestileerde stop-regels als echte OOXML en maakt één undo-stap", async () => {
    const h = boek();
    h.editCell(0, 0, 0, "10");
    const r = nieuweVoorwaardelijkeRegel(
      "A1:A3",
      "A1>5",
      { fill: "#ffff00", fontColor: "#ff0000" },
      [],
    );
    r.stopIfTrue = true;
    const geschiedenis = h.historyState();
    await bewaarVoorwaardelijkeRegels(api(h), 0, [r], h.version());
    expect(h.historyState().undoDepth).toBe(geschiedenis.undoDepth + 1);
    const terug = boek(h.save());
    expect(leesVoorwaardelijkeRegels(terug, 0)[0]).toMatchObject({
      stopIfTrue: true,
      format: { fill: "#ffff00", fontColor: "#ff0000" },
      formulas: ["A1>5"],
    });
    h.undo();
    expect(h.conditionalFormats(0)).toHaveLength(0);
    h.redo();
    expect(h.conditionalFormats(0)).toHaveLength(1);
  });
  it("past prioriteit en stop-if-true toe, ververst na herschikken en undo", async () => {
    const h = boek();
    h.editCell(0, 0, 0, "10");
    const a = nieuweVoorwaardelijkeRegel(
      "A1",
      "TRUE",
      { fontColor: "#ff0000" },
      [],
    );
    a.stopIfTrue = true;
    const b = nieuweVoorwaardelijkeRegel(
      "A1",
      "TRUE",
      { fontColor: "#0000ff", italic: true },
      [a],
    );
    await bewaarVoorwaardelijkeRegels(api(h), 0, [a, b], h.version());
    bereidVoorwaardelijkeWeergave(h);
    expect(tekst(h, "10")).toMatchObject({ color: "#ff0000" });
    expect(tekst(h, "10")).not.toHaveProperty("italic", true);
    await bewaarVoorwaardelijkeRegels(api(h), 0, [b, a], h.version());
    expect(tekst(h, "10")).toMatchObject({ color: "#0000ff", italic: true });
    h.undo();
    expect(tekst(h, "10")).toMatchObject({ color: "#ff0000" });
    expect(tekst(h, "10")).not.toHaveProperty("italic", true);
  });
  it.each(["colorScale", "dataBar", "iconSet"] as const)(
    "maakt en heropent %s met zichtbare, waardegestuurde weergave",
    async (soort) => {
      const h = boek();
      h.editCells(
        0,
        [0, 50, 100].map((n, row) => ({ row, col: 0, input: String(n) })),
      );
      const r = nieuweVisueleRegel(soort, "A1:A3", "#3366cc", []);
      await bewaarVoorwaardelijkeRegels(api(h), 0, [r], h.version());
      const terug = boek(h.save());
      bereidVoorwaardelijkeWeergave(terug);
      const frame = terug.displayList(viewport);
      expect(terug.conditionalFormats(0)[0].type).toBe(soort);
      if (soort === "colorScale") {
        for (const color of ["#f8696b", "#ffeb84", "#63be7b"])
          expect(
            frame.commands.some(
              (c) => c.op === "fillRect" && c.color.toLowerCase() === color,
            ),
          ).toBe(true);
      } else if (soort === "dataBar")
        expect(
          frame.commands.filter(
            (c) =>
              c.op === "fillRect" &&
              c.color.toLowerCase() === "#3366cc" &&
              c.w > 0,
          ),
        ).toHaveLength(2);
      else
        expect(
          frame.commands.filter((c) => c.op === "text" && c.text === "●"),
        ).toHaveLength(3);
    },
  );
  it("bewaart onbekende regels en hun uitbreidingen bij het toevoegen van een regel", async () => {
    const z = unzipSync(boek().save());
    const rule =
      '<cfRule xmlns:x="urn:vendor" type="vendorRule" priority="1"><extLst><ext uri="keep"><x:data value="untouched"/></ext></extLst></cfRule>';
    z["xl/worksheets/sheet1.xml"] = strToU8(
      strFromU8(z["xl/worksheets/sheet1.xml"]).replace(
        "</worksheet>",
        `<conditionalFormatting sqref="B1:B5">${rule}</conditionalFormatting></worksheet>`,
      ),
    );
    const h = boek(zipSync(z)),
      regels = leesVoorwaardelijkeRegels(h, 0);
    const r = nieuweVoorwaardelijkeRegel("A1:A3", "A1>0", {}, regels);
    await bewaarVoorwaardelijkeRegels(api(h), 0, [...regels, r], h.version());
    const terug = leesVoorwaardelijkeRegels(boek(h.save()), 0);
    expect(terug.find((r) => r.type === "vendorRule")?.rawXml).toContain(
      '<x:data value="untouched"/>',
    );
    expect(terug).toHaveLength(2);
  });
  it("weigert verouderde vensters, alleen-lezen en beveiligde bladen zonder deelmutatie", async () => {
    const h = boek(),
      versie = h.version(),
      r = nieuweVoorwaardelijkeRegel("A1", "TRUE", {}, []);
    h.editCell(0, 0, 0, "3");
    await expect(
      bewaarVoorwaardelijkeRegels(api(h), 0, [r], versie),
    ).rejects.toThrow();
    await expect(
      bewaarVoorwaardelijkeRegels(api(h, true), 0, [r], h.version()),
    ).rejects.toThrow();
    expect(h.conditionalFormats(0)).toHaveLength(0);
    const z = unzipSync(h.save());
    z["xl/worksheets/sheet1.xml"] = strToU8(
      strFromU8(z["xl/worksheets/sheet1.xml"]).replace(
        "</sheetData>",
        '</sheetData><sheetProtection sheet="1"/>',
      ),
    );
    const beschermd = boek(zipSync(z));
    await expect(
      bewaarVoorwaardelijkeRegels(api(beschermd), 0, [r], beschermd.version()),
    ).rejects.toThrow(/beveiligd/);
    expect(beschermd.conditionalFormats(0)).toHaveLength(0);
  });
  it("maakt absolute statistiekbereiken en behoudt quotes in tekstvoorwaarden", () => {
    expect(voorwaardelijkVoorbeeld("duplicates", "B2:B20", "", "")).toBe(
      'AND(B2<>"",COUNTIF($B$2:$B$20,B2)>1)',
    );
    expect(
      voorwaardelijkVoorbeeld("containsText", "B2:B20", 'een "quote"', ""),
    ).toBe('ISNUMBER(SEARCH("een ""quote""",B2))');
    expect(voorwaardelijkVoorbeeld("bottom10", "A1:A20", "", "")).toContain(
      "SMALL($A$1:$A$20",
    );
  });
  it("ververst ook een wijziging van alleen stop-if-true en de bijbehorende undo", async () => {
    const h = boek();
    h.editCell(0, 0, 0, "10");
    const a = nieuweVoorwaardelijkeRegel(
      "A1",
      "TRUE",
      { fontColor: "#ff0000" },
      [],
    );
    const b = nieuweVoorwaardelijkeRegel("A1", "TRUE", { fill: "#abcdef" }, [
      a,
    ]);
    await bewaarVoorwaardelijkeRegels(api(h), 0, [a, b], h.version());
    bereidVoorwaardelijkeWeergave(h);
    const gevuld = () =>
      h
        .displayList({ x: 0, y: 0, width: 160, height: 80 })
        .commands.some((c) => c.op === "fillRect" && c.color === "#abcdef");
    expect(gevuld()).toBe(true);
    const regels = leesVoorwaardelijkeRegels(h, 0).map((r, i) => ({
      ...r,
      stopIfTrue: i === 0,
    }));
    await bewaarVoorwaardelijkeRegels(api(h), 0, regels, h.version());
    expect(gevuld()).toBe(false);
    h.undo();
    expect(gevuld()).toBe(true);
  });
  it("bewaart uitgebreide bronstijlen en onbekende regeluitbreidingen bij formulebewerking", async () => {
    const z = unzipSync(boek().save());
    z["xl/styles.xml"] = strToU8(
      strFromU8(z["xl/styles.xml"]).replace(
        /<dxfs[^>]*\/>|<dxfs[^>]*>[\s\S]*?<\/dxfs>/,
        '<dxfs count="1"><dxf><font><b/><color rgb="FF112233"/></font><numFmt numFmtId="165" formatCode="0.00"/><border><bottom style="thin"><color rgb="FF334455"/></bottom></border></dxf></dxfs>',
      ),
    );
    // Some minimal templates omit the differential-format table entirely.
    if (!strFromU8(z["xl/styles.xml"]).includes("<dxfs"))
      z["xl/styles.xml"] = strToU8(
        strFromU8(z["xl/styles.xml"]).replace(
          "</styleSheet>",
          '<dxfs count="1"><dxf><font><b/></font><numFmt numFmtId="165" formatCode="0.00"/></dxf></dxfs></styleSheet>',
        ),
      );
    z["xl/worksheets/sheet1.xml"] = strToU8(
      strFromU8(z["xl/worksheets/sheet1.xml"]).replace(
        "</worksheet>",
        '<conditionalFormatting sqref="A1:A3"><cfRule xmlns:v="urn:test" type="expression" priority="1" dxfId="0" stopIfTrue="1"><formula>A1&gt;5</formula><extLst><ext uri="keep"><v:payload/></ext></extLst></cfRule></conditionalFormatting></worksheet>',
      ),
    );
    const h = boek(zipSync(z)),
      r = leesVoorwaardelijkeRegels(h, 0)[0];
    expect(r.uitgebreideStijl).toBe(true);
    const nieuw = wijzigVoorwaardelijkeRegel(r, "B1:B3", "B1>7", r.format);
    expect(nieuw.rawXml).toContain("<v:payload/>");
    expect(nieuw.dxfId).toBe(r.dxfId);
    await bewaarVoorwaardelijkeRegels(api(h), 0, [nieuw], h.version());
    const terug = boek(h.save()),
      saved = unzipSync(terug.save());
    expect(leesVoorwaardelijkeRegels(terug, 0)[0]).toMatchObject({
      range: "B1:B3",
      formulas: ["B1>7"],
      stopIfTrue: true,
      uitgebreideStijl: true,
    });
    expect(strFromU8(saved["xl/styles.xml"])).toContain('formatCode="0.00"');
    expect(() =>
      wijzigVoorwaardelijkeRegel(r, "A1", "TRUE", { fill: "#ff0000" }),
    ).toThrow();
  });
});
