import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { cellRect, openWorkbook, type DisplayList } from "@betteroffice/xlsx";
import { Pakket } from "../grafieken/pakket";
import { attr, kind, leesXml, vervang } from "../grafieken/xml";
import { tagXml } from "./werkboekXml";
import { laadTabellen } from "./tabellen";
import { bereidTabelweergave } from "./tabelweergave";
import { registreerRenderProjectie } from "./renderprojectie";
import { leesIngebouwdeTabelstijl } from "./ingebouwdeTabelstijlen";

const viewport = { x: 0, y: 0, width: 600, height: 160 };
const metrics = {
  dpi: 96,
  maxDigitWidth: 7,
  defaultRowHeightPt: 15,
  fontSizePt: 11,
  fontFamily: "Calibri",
  fontAscent: 10,
  fontDescent: 3,
};
function bron(
  naam = "TableStyleMedium2",
  flags: Record<string, string> = {},
  pas?: (p: Pakket) => void,
) {
  // Equivalent default cell formats are explicit s=0, isolating lookup from #324.
  const p = new Pakket(
    new Uint8Array(
      readFileSync("src/rekenblad/testdata/tabelstijl-medium2.xlsx"),
    ),
  );
  const pad = "xl/tables/table1.xml",
    xml = p.lees(pad),
    root = leesXml(xml),
    info = kind(root, "tableStyleInfo")!;
  p.schrijf(
    pad,
    vervang(xml, [
      {
        start: info.start,
        eind: info.eind,
        tekst: tagXml(info, "", { ...info.attrs, name: naam, ...flags }),
      },
    ]),
  );
  pas?.(p);
  return p.inpakken();
}
function bereid(bytes: Uint8Array) {
  const h = openWorkbook(bytes);
  laadTabellen(h, bytes);
  const stop = bereidTabelweergave(h, bytes);
  return { h, stop };
}
function tekst(f: DisplayList, waarde: string) {
  return f.commands.find((c) => c.op === "text" && c.text === waarde);
}
function kleur(f: DisplayList, row: number, col: number) {
  const r = cellRect(f.grid!, row, col)!;
  const x = r.x + r.w / 2,
    y = r.y + r.h / 2;
  let gevonden: string | undefined;
  for (const c of f.commands)
    if (
      c.op === "fillRect" &&
      x >= c.x &&
      x < c.x + c.w &&
      y >= c.y &&
      y < c.y + c.h
    )
      gevonden = c.color;
  return gevonden;
}

it("renders Medium2 on screen, in profiled output and in print without changing source or history", () => {
  const bytes = bron(),
    h = openWorkbook(bytes);
  try {
    laadTabellen(h, bytes);
    const v = h.version(),
      history = h.historyState(),
      saved = h.save();
    const stop = bereidTabelweergave(h, bytes);
    for (const f of [
      h.displayList(viewport),
      h.displayListProfiled(viewport).displayList,
      h.printDisplayList(0, "A1:B5", metrics, false),
    ]) {
      expect(tekst(f, "Item")).toMatchObject({ color: "#ffffff", bold: true });
      expect(kleur(f, 0, 0)).toBe("#4f81bd");
      expect(kleur(f, 1, 0)).toBe("#dce6f2");
      expect(kleur(f, 2, 0)).toBe("#ffffff");
    }
    expect(h.version()).toBe(v);
    expect(h.historyState()).toEqual(history);
    expect(h.save()).toEqual(saved);
    stop();
    expect(tekst(h.displayList(viewport), "Item")).toMatchObject({
      color: "#000000",
    });
  } finally {
    h.dispose();
  }
});

it.each([
  ["TableStyleLight2", "#376092", "#ffffff", "#dce6f2", "#ffffff"],
  ["TableStyleDark2", "#ffffff", "#000000", "#376092", "#4f81bd"],
])(
  "resolves the %s family and keeps sparse stripe facets from erasing the base font",
  (naam, header, headFill, band, plain) => {
    const { h } = bereid(bron(naam));
    try {
      const f = h.displayList(viewport);
      expect(tekst(f, "Item")).toMatchObject({ color: header, bold: true });
      expect(kleur(f, 0, 0)).toBe(headFill);
      expect(kleur(f, 1, 0)).toBe(band);
      expect(kleur(f, 2, 0)).toBe(plain);
      if (naam === "TableStyleDark2")
        expect(tekst(f, "First")).toMatchObject({ color: "#ffffff" });
    } finally {
      h.dispose();
    }
  },
);

it("resolves the actual workbook theme instead of a fixed Office accent", () => {
  const { h } = bereid(
    bron("TableStyleMedium2", {}, (p) =>
      p.schrijf(
        "xl/theme/theme1.xml",
        p
          .lees("xl/theme/theme1.xml")
          .replace(
            /<a:accent1>[\s\S]*?<\/a:accent1>/,
            '<a:accent1><a:srgbClr val="112233"/></a:accent1>',
          ),
      ),
    ),
  );
  try {
    expect(kleur(h.displayList(viewport), 0, 0)).toBe("#112233");
  } finally {
    h.dispose();
  }
});

it("uses row/column band flags and first/last-column emphasis independently", () => {
  const { h } = bereid(
    bron("TableStyleMedium2", {
      showRowStripes: "0",
      showColumnStripes: "1",
      showFirstColumn: "1",
      showLastColumn: "0",
    }),
  );
  try {
    const f = h.displayList(viewport);
    expect(kleur(f, 2, 0)).toBe("#dce6f2");
    expect(kleur(f, 2, 1)).toBe("#ffffff");
    expect(tekst(f, "Second")).toMatchObject({ bold: true });
    expect((tekst(f, "3") as { bold?: boolean })?.bold ?? false).toBe(false);
    expect(kleur(f, 0, 0)).toBe("#4f81bd");
  } finally {
    h.dispose();
  }
  const last = bereid(bron("TableStyleMedium2", { showLastColumn: "1" }));
  try {
    expect(tekst(last.h.displayList(viewport), "3")).toMatchObject({
      bold: true,
    });
  } finally {
    last.h.dispose();
  }
});

it("keeps direct cell formatting and subsequent conditional formatting ahead of the preset", () => {
  const h = openWorkbook(bron());
  try {
    h.patchRangeStyle(0, "A1", { textColor: "#ff0000", fillColor: "#00ff00" });
    const bytes = h.save();
    laadTabellen(h, bytes);
    bereidTabelweergave(h, bytes);
    const f = h.displayList(viewport);
    expect(tekst(f, "Item")).toMatchObject({ color: "#ff0000" });
    expect(kleur(f, 0, 0)).toBe("#00ff00");
    registreerRenderProjectie(h, 10, (f) => ({
      ...f,
      commands: f.commands.map((c) =>
        c.op === "text" && c.text === "Item" ? { ...c, color: "#ff00ff" } : c,
      ),
    }));
    expect(tekst(h.displayList(viewport), "Item")).toMatchObject({
      color: "#ff00ff",
    });
  } finally {
    h.dispose();
  }
});

it("prefers an explicit custom definition even when its name matches a built-in", () => {
  const { h } = bereid(
    bron("TableStyleMedium2", {}, (p) => {
      const pad = "xl/styles.xml";
      p.schrijf(
        pad,
        p
          .lees(pad)
          .replace(
            /<tableStyles\b[^>]*\/>/,
            '<dxfs count="1"><dxf><font><b/><color rgb="FF112233"/></font><fill><patternFill patternType="solid"><fgColor rgb="FFAABBCC"/></patternFill></fill></dxf></dxfs><tableStyles count="1"><tableStyle name="TableStyleMedium2" count="1"><tableStyleElement type="headerRow" dxfId="0"/></tableStyle></tableStyles>',
          ),
      );
    }),
  );
  try {
    const f = h.displayList(viewport);
    expect(tekst(f, "Item")).toMatchObject({ color: "#112233", bold: true });
    expect(kleur(f, 0, 0)).toBe("#aabbcc");
    expect(kleur(f, 1, 0)).toBe("#ffffff");
  } finally {
    h.dispose();
  }
});

it("preserves unknown names and rejects inherited object-property names without inventing a style", () => {
  const bytes = bron("VendorKeepStyle"),
    { h } = bereid(bytes);
  try {
    expect(tekst(h.displayList(viewport), "Item")).toMatchObject({
      color: "#000000",
    });
    const p = new Pakket(h.save());
    expect(
      attr(
        kind(leesXml(p.lees("xl/tables/table1.xml")), "tableStyleInfo"),
        "name",
      ),
    ).toBe("VendorKeepStyle");
    expect(
      leesIngebouwdeTabelstijl(
        new Pakket(bytes),
        "xl/workbook.xml",
        "constructor",
      ),
    ).toBeUndefined();
  } finally {
    h.dispose();
  }
});
