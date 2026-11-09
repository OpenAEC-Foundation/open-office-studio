import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { openWorkbook } from "@betteroffice/xlsx";
import { Pakket } from "../grafieken/pakket";
import { attr, kind, kinderen, leesXml } from "../grafieken/xml";
import {
  maakCelStijl,
  wijzigCelStijl,
  pasCelStijlToe,
  leesCelStijlen,
} from "./celstijlen";
import { werkmap, NS } from "./werkboekXml";
import { zetBereikStijlen } from "./celStijlenXml";
const bron = new Uint8Array(readFileSync("public/templates/nieuw.xlsx"));
const stylePad = (p: Pakket) => {
  const wb = werkmap(p);
  return Pakket.doelPad(
    wb.pad,
    p.relaties(wb.pad).find((r) => r.type.endsWith("/styles"))!.target,
  );
};
describe("named cell styles (#73)", () => {
  it("offers named built-ins and persists the proper IDs when applied", () => {
    expect(leesCelStijlen(bron).map((s) => s.naam)).toEqual(
      expect.arrayContaining(["Good", "Bad", "Neutral", "Heading 1", "Total"]),
    );
    for (const [naam, builtinId] of [
      ["Good", 26],
      ["Bad", 27],
      ["Neutral", 28],
      ["Heading 1", 16],
      ["Total", 25],
    ] as const) {
      const bytes = pasCelStijlToe(bron, naam, 0, "B2:C3"),
        p = new Pakket(bytes),
        stijl = leesCelStijlen(bytes).find((s) => s.naam === naam)!;
      expect(stijl).toMatchObject({ builtinId });
      expect(stijl.xfId).not.toBe(null);
      const h = openWorkbook(bytes);
      try {
        const f = h.selectionFormatting(0, "B2:C3");
        if (naam === "Heading 1" || naam === "Total") expect(f.bold).toBe(true);
        if (naam === "Good") expect(f.fillColor?.toLowerCase()).toBe("#c6efce");
      } finally {
        h.dispose();
      }
      const ws = leesXml(p.lees(werkmap(p).bladen[0].pad)),
        cells = kinderen(kind(ws, "sheetData"), "row").flatMap((r) =>
          kinderen(r, "c"),
        );
      const xfs = kinderen(kind(leesXml(p.lees(stylePad(p))), "cellXfs"), "xf");
      for (const c of cells.filter((c) =>
        ["B2", "C2", "B3", "C3"].includes(attr(c, "r")!),
      ))
        expect(Number(attr(xfs[Number(attr(c, "s"))], "xfId"))).toBe(
          stijl.xfId,
        );
    }
  });
  it("creates a style from a cell and modifies the applied style while preserving values and other ZIP parts", () => {
    const h = openWorkbook(bron);
    let bytes: Uint8Array;
    try {
      h.editCell(0, 1, 1, "=1+2");
      h.patchRangeStyle(0, "B2", { bold: true, textColor: "#123456" });
      bytes = h.save();
    } finally {
      h.dispose();
    }
    const p = new Pakket(bytes);
    p.schrijf("customXml/style-probe.xml", "<keep/>");
    bytes = p.inpakken();
    bytes = maakCelStijl(bytes, "My project", 0, "B2");
    expect(
      leesCelStijlen(bytes).find((s) => s.naam === "My project")!.opmaak,
    ).toMatchObject({ bold: true, textColor: "#123456" });
    bytes = pasCelStijlToe(bytes, "My project", 0, "B2:D4");
    bytes = wijzigCelStijl(bytes, "My project", {
      fontSize: 18,
      fillColor: "#ABCDEF",
      numberFormat: "0.000",
    });
    const reopened = openWorkbook(bytes);
    try {
      expect(reopened.cell(0, 1, 1).input).toBe("=1+2");
      expect(reopened.selectionFormatting(0, "D4")).toMatchObject({
        fontSize: 18,
        bold: true,
        fillColor: "#abcdef",
      });
    } finally {
      reopened.dispose();
    }
    expect(new Pakket(bytes).lees("customXml/style-probe.xml")).toBe("<keep/>");
    expect(
      leesCelStijlen(bytes).find((s) => s.naam === "My project")!.opmaak
        .numberFormat,
    ).toBe("0.000");
  });
  it("retains per-cell locked/hidden protection when applying a different style", () => {
    const h = openWorkbook(bron);
    let bytes: Uint8Array;
    try {
      const f = h.captureFormat(0, "B2");
      f.formats = f.formats.map((v) => ({
        ...(v as object),
        protection: { locked: false, hidden: true },
      }));
      h.applyFormat(0, "B2", f);
      bytes = h.save();
    } finally {
      h.dispose();
    }
    bytes = pasCelStijlToe(bytes, "Good", 0, "B2:C2");
    const reopened = openWorkbook(bytes);
    try {
      expect(reopened.captureFormat(0, "B2").formats[0]).toMatchObject({
        protection: { locked: false, hidden: true },
      });
      expect(reopened.captureFormat(0, "C2").formats[0]).toMatchObject({
        protection: { locked: true, hidden: false },
      });
    } finally {
      reopened.dispose();
    }
  });
  it("updates inherited facets but preserves a later direct font override", () => {
    let bytes = pasCelStijlToe(bron, "Heading 1", 0, "B2:C2");
    const h = openWorkbook(bytes);
    try {
      h.patchRangeStyle(0, "C2", { fontSize: 21 });
      bytes = h.save();
    } finally {
      h.dispose();
    }
    bytes = wijzigCelStijl(bytes, "Heading 1", {
      fontSize: 17,
      fillColor: "#EEEEFF",
    });
    const reopened = openWorkbook(bytes);
    try {
      expect(reopened.selectionFormatting(0, "B2").fontSize).toBe(17);
      expect(reopened.selectionFormatting(0, "C2").fontSize).toBe(21);
      expect(reopened.selectionFormatting(0, "C2").fillColor).toBe("#eeeeff");
    } finally {
      reopened.dispose();
    }
  });
  it("refuses duplicates, invalid formatting, huge selections and protected-sheet formatting", () => {
    const bytes = maakCelStijl(bron, "Project", 0, "A1");
    expect(() => maakCelStijl(bytes, "project", 0, "A1")).toThrow(
      "duplicateName",
    );
    expect(() => wijzigCelStijl(bytes, "Project", { fontSize: 0 })).toThrow(
      "invalidFormat",
    );
    expect(() => pasCelStijlToe(bytes, "Project", 0, "A1:Z100000")).toThrow(
      "selectionTooLarge",
    );
    const p = new Pakket(bytes),
      pad = werkmap(p).bladen[0].pad;
    p.schrijf(
      pad,
      p
        .lees(pad)
        .replace("</worksheet>", '<sheetProtection sheet="1"/></worksheet>'),
    );
    expect(() => pasCelStijlToe(p.inpakken(), "Project", 0, "A1")).toThrow(
      "protectedSheet",
    );
  });
  it("assigns a 100000-cell range in one XML pass and retains implicit source cell positions", () => {
    const p = new Pakket(bron),
      pad = werkmap(p).bladen[0].pad;
    p.schrijf(
      pad,
      `<worksheet xmlns="${NS}"><sheetData><row><c t="inlineStr"><is><t>First</t></is></c><c t="inlineStr"><is><t>Second</t></is></c></row><row r="3"><c r="E3"><v>42</v></c></row></sheetData><extLst><ext uri="keep"/></extLst></worksheet>`,
    );
    zetBereikStijlen(
      p,
      pad,
      { top: 0, bottom: 999, right: 99, left: 0 },
      () => 0,
    );
    const h = openWorkbook(p.inpakken());
    try {
      expect(h.cell(0, 0, 0).input).toBe("First");
      expect(h.cell(0, 0, 1).input).toBe("Second");
      expect(h.cell(0, 2, 4).input).toBe("42");
    } finally {
      h.dispose();
    }
    expect(p.lees(pad)).toContain('uri="keep"');
  });
});
