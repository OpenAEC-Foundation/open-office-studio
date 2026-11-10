import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cellRect,
  openWorkbook,
  type WorkbookHandle,
  type XlsxReadRequest,
} from "@betteroffice/xlsx";
import { Pakket } from "../grafieken/pakket";
import { kind, leesXml } from "../grafieken/xml";
import { bereidVoorwaardelijkeWeergave } from "./voorwaardelijke-weergave";
import { werkbladDeel } from "./pakket";
import { sectie } from "./werkboekXml";
import { metBeginregio } from "./werkmapregio";
import { kleurTint } from "./bladEigenschappen";

const viewport = { x: 0, y: 0, width: 400, height: 220 };
const boeken: WorkbookHandle[] = [];
afterEach(() => boeken.splice(0).forEach((h) => h.dispose()));
function fixture() {
  const h = openWorkbook(
    metBeginregio(
      new Uint8Array(readFileSync("public/templates/nieuw.xlsx")),
      "en-US",
    ),
  );
  h.editCells(0, [
    { row: 0, col: 0, input: "0.125" },
    { row: 1, col: 0, input: "0.5" },
    { row: 2, col: 0, input: "=RAND()" },
  ]);
  const p = new Pakket(h.save());
  h.dispose();
  const { werkmap, pad } = werkbladDeel(p, 0),
    s = p.relaties(werkmap).find((r) => r.type.endsWith("/styles"))!,
    style = Pakket.doelPad(werkmap, s.target);
  const dxf =
    '<dxf><font><color theme="4" tint="0.4"/><u/><strike/></font><fill><patternFill patternType="solid"><fgColor theme="5" tint="-0.25"/></patternFill></fill><numFmt numFmtId="165" formatCode="0.0%"/><border><bottom style="double"><color indexed="2"/></bottom></border></dxf>';
  let xml = p.lees(style);
  const root = leesXml(xml),
    dxfs = kind(root, "dxfs");
  xml = dxfs
    ? xml.slice(0, dxfs.start) +
      `<dxfs count="1">${dxf}</dxfs>` +
      xml.slice(dxfs.eind)
    : xml.replace(
        "</styleSheet>",
        `<dxfs count="1">${dxf}</dxfs></styleSheet>`,
      );
  p.schrijf(style, xml);
  sectie(
    p,
    pad,
    "conditionalFormatting",
    '<conditionalFormatting sqref="A1:A2"><cfRule type="expression" priority="1" dxfId="0"><formula>A1&lt;0.3</formula></cfRule></conditionalFormatting>',
  );
  // Pin the theme colours so the expected tint does not depend on the template.
  const themeRel = p.relaties(werkmap).find((r) => r.type.endsWith("/theme"));
  const theme = themeRel
    ? Pakket.doelPad(werkmap, themeRel.target)
    : "xl/theme/theme1.xml";
  if (!themeRel)
    p.voegRelatieToe(
      werkmap,
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme",
      theme,
    );
  p.schrijf(
    theme,
    p
      .lees(theme)
      .replace(/(<a:accent1>\s*<a:srgbClr val=")[^"]*/, "$14F81BD")
      .replace(/(<a:accent2>\s*<a:srgbClr val=")[^"]*/, "$1C0504D"),
  );
  p.voegOverrideToe(
    theme,
    "application/vnd.openxmlformats-officedocument.theme+xml",
  );
  const bytes = p.inpakken(),
    loaded = openWorkbook(bytes);
  boeken.push(loaded);
  return { h: loaded, bytes, style };
}

describe("imported conditional DXF rendering (#67)", () => {
  it("applies theme/tint colours, underline/strike, number formatting and the specified border only on matching cells", () => {
    const { h } = fixture();
    const before = h.displayList(viewport),
      version = h.version(),
      history = h.historyState();
    bereidVoorwaardelijkeWeergave(h);
    const frame = h.displayList(viewport),
      a1 = cellRect(frame.grid, 0, 0)!;
    const matching = frame.commands.find(
      (c) => c.op === "text" && c.text === "12.5%",
    );
    expect(matching).toMatchObject({
      color: kleurTint("4f81bd", 0.4),
      underline: true,
      strike: true,
    });
    expect(
      frame.commands.find((c) => c.op === "text" && c.text === "0.5"),
    ).toMatchObject({ color: "#000000" });
    expect(frame.commands).toContainEqual({
      op: "fillRect",
      ...a1,
      color: kleurTint("c0504d", -0.25),
      clip: a1,
    });
    expect(
      frame.commands.some(
        (c) =>
          c.op === "line" &&
          c.color === "#ff0000" &&
          c.style === "double" &&
          Math.abs(c.y1 - (a1.y + a1.h)) < 0.1,
      ),
    ).toBe(true);
    expect(h.version()).toBe(version);
    expect(h.historyState()).toEqual(history);
    const volatile = before.commands.find(
      (c) => c.op === "text" && c.clip?.y === cellRect(before.grid, 2, 0)!.y,
    );
    expect(volatile?.op).toBe("text");
    if (volatile?.op === "text")
      expect(
        h
          .displayList(viewport)
          .commands.find((c) => c.op === "text" && c.text === volatile.text),
      ).toEqual(volatile);
  });

  it("probes the existing readonly formatter without changing volatile values or history", () => {
    const { h } = fixture(),
      version = h.version(),
      history = h.historyState();
    const request = {
      ranges: [],
      formulaQueries: [
        {
          sheetId: h.sheetInfo().sheetIds[0],
          origin: { row: 0, col: 0 },
          target: { row: 0, col: 0 },
          formula: 'TEXT(A1,"0.0%")',
        },
      ],
    } as unknown as XlsxReadRequest;
    const result = h.readCells(request) as ReturnType<
      WorkbookHandle["readCells"]
    > & { formulaResults?: unknown[] };
    expect(result.formulaResults).toEqual([{ kind: "text", value: "12.5%" }]);
    expect(h.version()).toBe(version);
    expect(h.historyState()).toEqual(history);
  });

  it("recalculates after editing and Undo without saving a whole workbook during ordinary typing", () => {
    const { h, style } = fixture();
    bereidVoorwaardelijkeWeergave(h);
    h.displayList(viewport);
    const save = vi.spyOn(h, "save");
    h.editCell(0, 0, 0, "0.2");
    expect(
      h
        .displayList(viewport)
        .commands.some((c) => c.op === "text" && c.text === "20.0%"),
    ).toBe(true);
    expect(
      h
        .displayListProfiled(viewport)
        .displayList.commands.some(
          (c) => c.op === "text" && c.text === "20.0%",
        ),
    ).toBe(true);
    expect(save).not.toHaveBeenCalled();
    h.editCell(0, 0, 0, "0.8");
    expect(
      h
        .displayList(viewport)
        .commands.some((c) => c.op === "text" && c.text === "0.8"),
    ).toBe(true);
    h.undo();
    expect(
      h
        .displayList(viewport)
        .commands.some((c) => c.op === "text" && c.text === "20.0%"),
    ).toBe(true);
    const xml = new Pakket(h.save()).lees(style);
    expect(xml).toContain('formatCode="0.0%"');
    expect(xml).toContain('tint="0.4"');
    expect(xml).toContain('bottom style="double"');
  });

  it("merges matching rules per facet and border side while StopIfTrue suppresses lower-priority styles", () => {
    const { bytes, style } = fixture(),
      p = new Pakket(bytes);
    const other =
      '<dxf><font><color rgb="FF00FF00"/></font><numFmt numFmtId="166" formatCode="0.000"/><border><left style="thin"><color rgb="FF00AA00"/></left><bottom style="thin"><color rgb="FF000000"/></bottom></border></dxf>';
    p.schrijf(
      style,
      p
        .lees(style)
        .replace("</dxfs>", other + "</dxfs>")
        .replace('dxfs count="1"', 'dxfs count="2"'),
    );
    const { pad } = werkbladDeel(p, 0);
    p.schrijf(
      pad,
      p
        .lees(pad)
        .replace(
          "</conditionalFormatting>",
          '<cfRule type="expression" priority="2" dxfId="1"><formula>TRUE</formula></cfRule></conditionalFormatting>',
        ),
    );
    const h = openWorkbook(p.inpakken());
    boeken.push(h);
    bereidVoorwaardelijkeWeergave(h);
    let frame = h.displayList(viewport),
      rect = cellRect(frame.grid, 0, 0)!;
    expect(
      frame.commands.find((c) => c.op === "text" && c.text === "12.5%"),
    ).toMatchObject({ color: "#95b3d7" });
    expect(
      frame.commands.find((c) => c.op === "text" && c.text === "0.500"),
    ).toMatchObject({ color: "#00ff00" });
    expect(
      frame.commands.some(
        (c) =>
          c.op === "line" &&
          c.color === "#00aa00" &&
          c.x1 === rect.x &&
          c.y1 === rect.y,
      ),
    ).toBe(true);
    p.schrijf(
      pad,
      p.lees(pad).replace('priority="1"', 'priority="1" stopIfTrue="1"'),
    );
    const stopped = openWorkbook(p.inpakken());
    boeken.push(stopped);
    bereidVoorwaardelijkeWeergave(stopped);
    frame = stopped.displayList(viewport);
    rect = cellRect(frame.grid, 0, 0)!;
    expect(
      frame.commands.some(
        (c) =>
          c.op === "line" &&
          c.color === "#00aa00" &&
          c.x1 === rect.x &&
          c.y1 === rect.y,
      ),
    ).toBe(false);
    expect(
      frame.commands.some((c) => c.op === "text" && c.text === "12.5%"),
    ).toBe(true);
  });

  it("replaces the matching segment of a thick base border, retaining its neighbouring segment and frozen dividers", () => {
    const { bytes, style } = fixture(),
      p = new Pakket(bytes);
    p.schrijf(
      style,
      p.lees(style).replace('bottom style="double"', 'bottom style="thin"'),
    );
    const h = openWorkbook(p.inpakken());
    boeken.push(h);
    h.patchRangeStyle(0, "A1:B1", {
      border: { preset: "bottom", style: "double", color: "#0000ff" },
    });
    h.applyOps([
      {
        type: "setFreezePane",
        sheet: 0,
        pane: { rows: 1, cols: 1, top_left: { row: 1, col: 1 } },
      },
    ]);
    const before = h.displayList(viewport),
      rect = cellRect(before.grid, 0, 0)!;
    bereidVoorwaardelijkeWeergave(h);
    const frame = h.displayList(viewport);
    const blue = frame.commands.filter(
      (c) => c.op === "line" && c.color === "#0000ff",
    );
    expect(
      blue.some(
        (c) =>
          c.op === "line" &&
          Math.abs(c.y1 - rect.y - rect.h) < 0.51 &&
          c.x1 < rect.x + rect.w - 0.1 &&
          c.x2 > rect.x + 0.1,
      ),
    ).toBe(false);
    expect(
      blue.some(
        (c) => c.op === "line" && c.x1 >= rect.x + rect.w - 0.1 && c.x2 > c.x1,
      ),
    ).toBe(true);
    const dividers = before.commands.filter(
      (c) => c.op === "line" && c.color === "#8a8a8a" && c.width === 2,
    );
    expect(dividers.length).toBe(2);
    for (const c of dividers) expect(frame.commands).toContainEqual(c);
  });

  it("uses the same styles when printing and keeps source cells, raw DXF XML and unrelated parts intact", () => {
    const { h, style } = fixture();
    const before = h.save(),
      version = h.version(),
      history = h.historyState();
    bereidVoorwaardelijkeWeergave(h);
    const frame = h.printDisplayList(
      0,
      "A1:A2",
      {
        dpi: 96,
        maxDigitWidth: 7,
        defaultRowHeightPt: 15,
        fontSizePt: 11,
        fontFamily: "Calibri",
        fontAscent: 10,
        fontDescent: 3,
      },
      false,
    );
    expect(
      frame.commands.find((c) => c.op === "text" && c.text === "12.5%"),
    ).toMatchObject({ underline: true, strike: true, color: "#95b3d7" });
    expect(
      frame.commands.some(
        (c) => c.op === "line" && c.style === "double" && c.color === "#ff0000",
      ),
    ).toBe(true);
    expect(h.version()).toBe(version);
    expect(h.historyState()).toEqual(history);
    expect(h.cell(0, 0, 0).input).toBe("0.125");
    const saved = new Pakket(h.save()),
      source = new Pakket(before);
    expect(saved.lees(style)).toBe(source.lees(style));
    expect(saved.lees("xl/theme/theme1.xml")).toBe(
      source.lees("xl/theme/theme1.xml"),
    );
  });

  it("retains native numeric overflow layout for narrow formatted cells", () => {
    const { h } = fixture();
    h.applyOps([{ type: "setColWidth", sheet: 0, col: 0, width: 3 }]);
    bereidVoorwaardelijkeWeergave(h);
    const text = h
      .displayList(viewport)
      .commands.find((c) => c.op === "text" && c.text === "12.5%");
    expect(text?.op === "text" && text.numberFormat).toMatchObject({
      overflow: true,
      parts: [],
    });
    if (text?.op === "text") {
      expect(text.numberFormat?.general).toBeUndefined();
      expect(text.numberFormat!.width).toBeLessThan(25);
    }
  });

  it("splits long format-query payloads by UTF-8 bytes and never mutates source cells", () => {
    const { bytes, style } = fixture(),
      p = new Pakket(bytes),
      pad = werkbladDeel(p, 0).pad;
    p.schrijf(
      style,
      p
        .lees(style)
        .replace(
          'formatCode="0.0%"',
          `formatCode="&quot;${"L".repeat(6800)}&quot;0.0%"`,
        ),
    );
    p.schrijf(
      pad,
      p
        .lees(pad)
        .replace('sqref="A1:A2"', 'sqref="A1:K20"')
        .replace("A1&lt;0.3", "TRUE"),
    );
    const h = openWorkbook(p.inpakken());
    boeken.push(h);
    h.editCells(
      0,
      Array.from({ length: 220 }, (_, i) => ({
        row: Math.floor(i / 11),
        col: i % 11,
        input: "0.125",
      })),
    );
    bereidVoorwaardelijkeWeergave(h);
    const reads = vi.spyOn(h, "readCells"),
      version = h.version(),
      history = h.historyState();
    expect(() =>
      h.displayList({ x: 0, y: 0, width: 1000, height: 440 }),
    ).not.toThrow();
    const requests = reads.mock.calls
      .map(([r]) => r as unknown as { formulaQueries?: { formula: string }[] })
      .filter((r) =>
        r.formulaQueries?.some((q) => q.formula.startsWith("IF(OR(ISNUMBER")),
      );
    expect(requests.length).toBeGreaterThan(1);
    for (const r of requests)
      expect(
        r.formulaQueries!.reduce(
          (n, q) => n + new TextEncoder().encode(q.formula).length,
          0,
        ),
      ).toBeLessThanOrEqual(1048576);
    expect(h.version()).toBe(version);
    expect(h.historyState()).toEqual(history);
    expect(h.cell(0, 0, 0).input).toBe("0.125");
  });
});
