import { expect, it } from "vitest";
import { cellRect, openWorkbook, type DisplayList } from "@betteroffice/xlsx";
import { Pakket } from "../grafieken/pakket";
import { kind, kinderen, leesXml } from "../grafieken/xml";
import { laadTabellen } from "./tabellen";
import { bereidTabelweergave } from "./tabelweergave";
import { werkmap } from "./werkboekXml";
import { tabelstandaardBron } from "./testdata/tabelstandaard";
import { bereidVoorwaardelijkeWeergave } from "./voorwaardelijke-weergave";
import { sectie } from "./werkboekXml";

const viewport = { x: 0, y: 0, width: 400, height: 150 };
const metrics = {
  dpi: 96,
  maxDigitWidth: 7,
  defaultRowHeightPt: 15,
  fontSizePt: 11,
  fontFamily: "Calibri",
  fontAscent: 10,
  fontDescent: 3,
};
function routes(h: ReturnType<typeof openWorkbook>) {
  return [
    h.displayList(viewport),
    h.displayListProfiled(viewport).displayList,
    h.printDisplayList(0, "A1:B3", metrics, false),
  ];
}
function fill(frame: DisplayList, row: number, col: number) {
  const rect = cellRect(frame.grid!, row, col)!;
  const x = rect.x + rect.w / 2,
    y = rect.y + rect.h / 2;
  return frame.commands
    .filter(
      (c) =>
        c.op === "fillRect" &&
        c.x <= x &&
        c.y <= y &&
        c.x + c.w >= x &&
        c.y + c.h >= y,
    )
    .at(-1);
}
it("renders identical custom-DXF facets for explicit and implicit default cells in every route", () => {
  const pairs = [false, true].map((implicit) => {
    const bytes = tabelstandaardBron(implicit),
      h = openWorkbook(bytes);
    try {
      laadTabellen(h, bytes);
      expect(
        h
          .captureFormat(0, "A1:B3")
          .sourceStyles?.every((s) => (implicit ? s === null : s !== null)),
      ).toBe(true);
      const version = h.version(),
        history = h.historyState(),
        saved = h.save();
      const stop = bereidTabelweergave(h, bytes);
      const frames = routes(h);
      for (const frame of frames) {
        expect(fill(frame, 0, 0)).toMatchObject({ color: "#365f91" });
        expect(fill(frame, 1, 0)).toMatchObject({ color: "#dce6f1" });
        expect(
          frame.commands.find((c) => c.op === "text" && c.text === "Item"),
        ).toMatchObject({ bold: true, color: "#ffffff" });
      }
      expect(h.version()).toBe(version);
      expect(h.historyState()).toEqual(history);
      expect(h.save()).toEqual(saved);
      stop();
      const restored = h
        .displayList(viewport)
        .commands.find((c) => c.op === "text" && c.text === "Item");
      expect(restored).toMatchObject({ color: "#000000" });
      expect(restored?.op === "text" && restored.bold).not.toBe(true);
      return frames.map((frame) => frame.commands);
    } finally {
      h.dispose();
    }
  });
  expect(pairs[0]).toEqual(pairs[1]);
});

it("keeps an inherited row or column fill on missing cells, with row precedence", () => {
  const p = new Pakket(tabelstandaardBron(true)),
    wb = werkmap(p);
  const stylePath = Pakket.doelPad(
    wb.pad,
    p.relaties(wb.pad).find((r) => r.type.endsWith("/styles"))!.target,
  );
  const root = leesXml(p.lees(stylePath));
  const rowFill = kinderen(kind(root, "fills"), "fill").length,
    colFill = rowFill + 1;
  const rowStyle = kinderen(kind(root, "cellXfs"), "xf").length,
    colStyle = rowStyle + 1;
  p.schrijf(
    stylePath,
    p
      .lees(stylePath)
      .replace(
        /<fills count="(\d+)">/,
        (_s, n) => `<fills count="${Number(n) + 2}">`,
      )
      .replace(
        "</fills>",
        '<fill><patternFill patternType="solid"><fgColor rgb="FF00AA00"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFAA00AA"/></patternFill></fill></fills>',
      )
      .replace(
        /<cellXfs count="(\d+)">/,
        (_s, n) => `<cellXfs count="${Number(n) + 2}">`,
      )
      .replace(
        "</cellXfs>",
        `<xf fontId="0" fillId="${rowFill}" borderId="0" numFmtId="0" applyFill="1"/><xf fontId="0" fillId="${colFill}" borderId="0" numFmtId="0" applyFill="1"/></cellXfs>`,
      ),
  );
  const sheet = wb.bladen[0].pad;
  p.schrijf(
    sheet,
    p
      .lees(sheet)
      .replace(/<c\b[^>]*\br="B[12]"[^>]*>[\s\S]*?<\/c>/g, "")
      .replace(
        "<sheetData>",
        `<cols><col min="2" max="2" style="${colStyle}"/></cols><sheetData>`,
      )
      .replace('<row r="2"', `<row s="${rowStyle}" customFormat="1" r="2"`),
  );
  const bytes = p.inpakken(),
    h = openWorkbook(bytes);
  try {
    laadTabellen(h, bytes);
    const captured = h.captureFormat(0, "B1:B2");
    expect(captured.sourceStyles).toEqual([null, null]);
    expect(captured.formats.map((f) => (f as { fill: unknown }).fill)).toEqual([
      { Solid: { Rgb: "#aa00aa" } },
      { Solid: { Rgb: "#00aa00" } },
    ]);
    const saved = h.save(),
      version = h.version(),
      history = h.historyState();
    bereidTabelweergave(h, bytes);
    for (const frame of routes(h)) {
      expect(fill(frame, 0, 0)).toMatchObject({ color: "#365f91" });
      expect(fill(frame, 0, 1)).toMatchObject({ color: "#aa00aa" });
      expect(fill(frame, 1, 1)).toMatchObject({ color: "#00aa00" });
    }
    expect(h.save()).toEqual(saved);
    expect(h.version()).toBe(version);
    expect(h.historyState()).toEqual(history);
  } finally {
    h.dispose();
  }
});

it("retains mixed direct font/fill facets while default cells receive the table and later CF wins", () => {
  const p = new Pakket(tabelstandaardBron(true)),
    wb = werkmap(p);
  const path = Pakket.doelPad(
    wb.pad,
    p.relaties(wb.pad).find((r) => r.type.endsWith("/styles"))!.target,
  );
  const xml = p.lees(path),
    root = leesXml(xml);
  const fonts = kinderen(kind(root, "fonts"), "font").length,
    fills = kinderen(kind(root, "fills"), "fill").length,
    xfs = kinderen(kind(root, "cellXfs"), "xf").length,
    dxfs = kinderen(kind(root, "dxfs"), "dxf").length;
  p.schrijf(
    path,
    xml
      .replace(
        /<fonts count="(\d+)">/,
        (_s, n) => `<fonts count="${Number(n) + 1}">`,
      )
      .replace(
        "</fonts>",
        '<font><name val="Calibri"/><sz val="11"/><color rgb="FF990000"/></font></fonts>',
      )
      .replace(
        /<fills count="(\d+)">/,
        (_s, n) => `<fills count="${Number(n) + 1}">`,
      )
      .replace(
        "</fills>",
        '<fill><patternFill patternType="solid"><fgColor rgb="FFCCFFCC"/></patternFill></fill></fills>',
      )
      .replace(
        /<cellXfs count="(\d+)">/,
        (_s, n) => `<cellXfs count="${Number(n) + 2}">`,
      )
      .replace(
        "</cellXfs>",
        `<xf fontId="${fonts}" fillId="0" applyFont="1"/><xf fontId="0" fillId="${fills}" applyFill="1"/></cellXfs>`,
      )
      .replace(
        /<dxfs count="(\d+)">/,
        (_s, n) => `<dxfs count="${Number(n) + 1}">`,
      )
      .replace(
        "</dxfs>",
        '<dxf><font><color rgb="FF00AA00"/></font><fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/></patternFill></fill></dxf></dxfs>',
      ),
  );
  const sheet = wb.bladen[0].pad;
  p.schrijf(
    sheet,
    p
      .lees(sheet)
      .replace('<c r="B1"', `<c s="${xfs}" r="B1"`)
      .replace('<c r="A2"', `<c s="${xfs + 1}" r="A2"`)
      .replace('<c r="B2"', '<c s="0" r="B2"'),
  );
  sectie(
    p,
    sheet,
    "conditionalFormatting",
    `<conditionalFormatting sqref="A1"><cfRule type="expression" priority="1" dxfId="${dxfs}"><formula>TRUE()</formula></cfRule></conditionalFormatting>`,
  );
  const bytes = p.inpakken(),
    h = openWorkbook(bytes);
  try {
    laadTabellen(h, bytes);
    const before = h.save(),
      version = h.version(),
      history = h.historyState();
    bereidTabelweergave(h, bytes);
    for (const frame of routes(h)) {
      expect(
        frame.commands.find((c) => c.op === "text" && c.text === "Item"),
      ).toMatchObject({ bold: true, color: "#ffffff" });
      expect(
        frame.commands.find((c) => c.op === "text" && c.text === "Amount"),
      ).toMatchObject({ color: "#990000" });
      expect(fill(frame, 0, 1)).toMatchObject({ color: "#365f91" });
      expect(fill(frame, 1, 0)).toMatchObject({ color: "#ccffcc" });
      expect(fill(frame, 1, 1)).toMatchObject({ color: "#dce6f1" });
    }
    bereidVoorwaardelijkeWeergave(h);
    for (const frame of routes(h)) {
      expect(
        frame.commands.find((c) => c.op === "text" && c.text === "Item"),
      ).toMatchObject({ color: "#00aa00" });
      expect(fill(frame, 0, 0)).toMatchObject({ color: "#ffff00" });
    }
    expect(h.save()).toEqual(before);
    expect(h.version()).toBe(version);
    expect(h.historyState()).toEqual(history);
  } finally {
    h.dispose();
  }
});

it("keeps implicit formatting after a value edit, Undo, Redo and save/reopen", () => {
  let bytes = tabelstandaardBron(true);
  for (let pass = 0; pass < 2; pass++) {
    const h = openWorkbook(bytes);
    try {
      laadTabellen(h, bytes);
      bereidTabelweergave(h, bytes);
      const before = h.historyState();
      if (pass === 0) {
        h.editCell(0, 1, 1, "42");
        expect(h.cell(0, 1, 1).input).toBe("42");
        h.undo();
        expect(h.cell(0, 1, 1).input).toBe("2");
        h.redo();
        expect(h.cell(0, 1, 1).input).toBe("42");
      }
      const history = h.historyState(),
        version = h.version(),
        saved = h.save();
      for (const frame of routes(h))
        expect(fill(frame, 1, 1)).toMatchObject({ color: "#dce6f1" });
      expect(h.historyState()).toEqual(history);
      expect(h.version()).toBe(version);
      expect(h.save()).toEqual(saved);
      if (pass === 1) {
        expect(h.cell(0, 1, 1).input).toBe("42");
        expect(h.historyState()).toEqual(before);
      }
      bytes = saved;
    } finally {
      h.dispose();
    }
  }
});

it.each([
  "none",
  "solid",
  "pattern",
  "rgb-font",
  "empty-color",
  "underline",
  "0",
  "false",
])(
  "matches explicit XF0 with an implicit cell for default variant %s",
  (variant) => {
    const frames: unknown[] = [];
    for (const implicit of [false, true]) {
      const p = new Pakket(tabelstandaardBron(implicit)),
        wb = werkmap(p);
      const path = Pakket.doelPad(
        wb.pad,
        p.relaties(wb.pad).find((r) => r.type.endsWith("/styles"))!.target,
      );
      let xml = p.lees(path);
      if (["none", "solid", "pattern"].includes(variant)) {
        const content =
          variant === "none"
            ? '<patternFill patternType="none"/>'
            : variant === "solid"
              ? '<patternFill patternType="solid"><fgColor rgb="FFF0F0F0"/></patternFill>'
              : '<patternFill patternType="gray125"><fgColor rgb="FF123456"/><bgColor rgb="FFF0F0F0"/></patternFill>';
        xml = xml.replace(
          /(<fills[^>]*>)<fill>[\s\S]*?<\/fill>/,
          `$1<fill>${content}</fill>`,
        );
      } else if (variant === "rgb-font")
        xml = xml.replace('<color theme="1"/>', '<color rgb="FF123456"/>');
      else if (variant === "empty-color")
        xml = xml.replace('<color theme="1"/>', "<color/>");
      else if (variant === "underline")
        xml = xml.replace("<font>", '<font><u val="single"/>');
      else
        xml = xml.replace(
          /(<cellXfs[^>]*><xf\b)/,
          `$1 applyFont="${variant}" applyFill="${variant}"`,
        );
      p.schrijf(path, xml);
      if (!implicit)
        p.schrijf(
          wb.bladen[0].pad,
          p.lees(wb.bladen[0].pad).replace(/\bs="\d+"/g, 's="0"'),
        );
      const bytes = p.inpakken(),
        h = openWorkbook(bytes);
      try {
        laadTabellen(h, bytes);
        const before = h.save(),
          version = h.version(),
          history = h.historyState();
        bereidTabelweergave(h, bytes);
        const actual = routes(h);
        for (const frame of actual) {
          expect(fill(frame, 0, 0)).toMatchObject({ color: "#365f91" });
          expect(
            frame.commands.find((c) => c.op === "text" && c.text === "Item"),
          ).toMatchObject({ bold: true, color: "#ffffff" });
        }
        frames.push(actual.map((frame) => frame.commands));
        expect(h.save()).toEqual(before);
        expect(h.version()).toBe(version);
        expect(h.historyState()).toEqual(history);
      } finally {
        h.dispose();
      }
    }
    expect(frames[0]).toEqual(frames[1]);
  },
);
