import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Pakket } from "../grafieken/pakket";
import { leesXml } from "../grafieken/xml";
import { leesDxfStijlen } from "./voorwaardelijke-dxf";
import { kleurTint } from "./kleurtint";
const p = () =>
  new Pakket(new Uint8Array(readFileSync("public/templates/nieuw.xlsx")));
const styles = (xml: string) =>
  leesXml(
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${xml}</styleSheet>`,
  );
describe("shared read-only DXF parser", () => {
  it("resolves independent sparse style facets, explicit false values and the custom indexed palette", () => {
    const pakket = p(),
      input = styles(
        '<numFmts><numFmt numFmtId="180" formatCode="0.000%"/></numFmts><dxfs><dxf><font><b val="0"/><i/><u val="none"/><strike val="false"/><color indexed="0"/></font><fill><patternFill patternType="solid"><fgColor indexed="1"/></patternFill></fill><border><left/><bottom style="mediumDashDot"><color rgb="FF112233"/></bottom></border><numFmt numFmtId="180"/></dxf><dxf><font><b/></font></dxf></dxfs><colors><indexedColors><rgbColor rgb="FF123456"/><rgbColor rgb="FFABCDEF"/></indexedColors></colors>',
      );
    expect(leesDxfStijlen(pakket, "xl/workbook.xml", input)).toEqual([
      {
        bold: false,
        italic: true,
        underline: false,
        strike: false,
        fontColor: "#123456",
        fill: "#abcdef",
        numFmt: "0.000%",
        borders: {
          bottom: { width: 2, style: "mediumDashDot", color: "#112233" },
        },
      },
      { bold: true },
    ]);
  });
  it("resolves workbook theme/system colours and tint, without substituting unrelated resources", () => {
    const pakket = p();
    const rel = pakket
      .relaties("xl/workbook.xml")
      .find((r) => r.type.endsWith("/theme"));
    const path = rel
      ? Pakket.doelPad("xl/workbook.xml", rel.target)
      : "xl/theme/theme1.xml";
    if (!rel)
      pakket.voegRelatieToe(
        "xl/workbook.xml",
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme",
        path,
      );
    pakket.schrijf(
      path,
      '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:clrScheme><a:accent1><a:sysClr val="window" lastClr="4F81BD"/></a:accent1></a:clrScheme></a:themeElements></a:theme>',
    );
    const result = leesDxfStijlen(
      pakket,
      "xl/workbook.xml",
      styles(
        '<dxfs><dxf><font><color theme="4" tint="0.4"/></font><fill><patternFill patternType="solid"><fgColor indexed="2"/></patternFill></fill><border><right style="double"><color auto="1"/></right></border></dxf></dxfs>',
      ),
    );
    expect(result[0]).toEqual({
      fontColor: "#95b3d7",
      fill: "#ff0000",
      borders: { right: { style: "double", width: 3, color: "#000000" } },
    });
    expect(kleurTint("4f81bd", -0.25)).toBe("#376092");
    expect(kleurTint("ffffff", -1)).toBe("#000000");
    expect(kleurTint("000000", 1)).toBe("#ffffff");
  });
  it("keeps unmodelled/invalid facets absent, and explicit format codes take precedence over IDs", () => {
    expect(
      leesDxfStijlen(
        p(),
        "xl/workbook.xml",
        styles(
          '<dxfs><dxf><font><color indexed="99"/></font><fill><gradientFill/></fill><numFmt numFmtId="10" formatCode="0.0%"/></dxf><dxf><numFmt numFmtId="10"/></dxf><dxf><numFmt numFmtId="9999"/></dxf></dxfs>',
        ),
      ),
    ).toEqual([{ numFmt: "0.0%" }, { numFmt: "0.00%" }, {}]);
  });
  it("localizes implicit date formats only for a literal, global workbook-region setting", () => {
    const pakket = p(),
      input = styles(
        '<dxfs><dxf><numFmt numFmtId="14"/></dxf><dxf><numFmt numFmtId="22"/></dxf></dxfs>',
      );
    const xml = pakket.lees("xl/workbook.xml");
    pakket.schrijf(
      "xl/workbook.xml",
      xml.replace(
        /<definedNames\s*\/>/,
        '<definedNames><definedName name="_OpenAEC_NumberLocale" hidden="1">"nl-NL"</definedName></definedNames>',
      ),
    );
    expect(leesDxfStijlen(pakket, "xl/workbook.xml", input)).toEqual([
      { numFmt: "dd-mm-yyyy" },
      { numFmt: "dd-mm-yyyy h:mm" },
    ]);
    pakket.schrijf("xl/workbook.xml", xml);
    expect(leesDxfStijlen(pakket, "xl/workbook.xml", input)).toEqual([
      { numFmt: "m/d/yy" },
      { numFmt: "m/d/yy h:mm" },
    ]);
  });
});
