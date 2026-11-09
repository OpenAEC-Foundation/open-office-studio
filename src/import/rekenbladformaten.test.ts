import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";
import { bereidOpenen } from "./openen";
import { bronMacros } from "./bronmacros";
import { schrijfCfb } from "./cfbschrijver";
import { uitvoerformaat } from "../formaten";
import { opslagRapport } from "./rapport";
import { Pakket } from "../grafieken/pakket";
const xlsx = readFileSync("public/templates/nieuw.xlsx");
describe("rekenbladconversie en standaard bewaren (#32/#35)", () => {
  it.each(["ods", "ots", "fods"])(
    "opent .%s via conversie en maakt van een sjabloon een nieuw XLSX-document",
    async (ext) => {
      const bytes =
        ext === "fods"
          ? strToU8("<office:document/>")
          : zipSync({
              mimetype: strToU8(
                "application/vnd.oasis.opendocument.spreadsheet",
              ),
              "content.xml": strToU8("<document/>"),
            });
      const converteer = vi.fn(async () => xlsx),
        r = await bereidOpenen(`Bron.${ext}`, bytes, { converteer });
      expect(r).toMatchObject({
        soort: "xlsx",
        naam: "Bron.xlsx",
        exportFormaat: ext === "ots" ? "xlsx" : ext,
      });
      expect(r?.alsNieuw).toBe(ext === "ots" ? true : undefined);
      expect(converteer).toHaveBeenCalledWith(bytes, ext, "xlsx", "xlsx");
      expect(uitvoerformaat("xlsx", ext)).toMatchObject({ route: "runtime" });
    },
  );
  it.each(["xls", "xlt", "xlsb"])(
    "stelt XLSX voor na .%s en waarschuwt bij expliciete XLS-uitvoer",
    async (ext) => {
      const r = await bereidOpenen(
        `Archief.${ext}`,
        new Uint8Array([1, 2, 3]),
        { converteer: async () => xlsx },
      );
      expect(r).toMatchObject({ soort: "xlsx", naam: "Archief.xlsx" });
      expect(r?.exportFormaat).toBe(ext === "xlt" ? "xlsx" : undefined);
      expect(r?.alsNieuw).toBe(ext === "xlt" ? true : undefined);
      expect(
        opslagRapport({
          soort: "xlsx",
          formaat: uitvoerformaat("xlsx", "xls")!,
          route: "runtime",
          risicos: [],
        }),
      ).not.toBeNull();
    },
  );
  it.each(["xls", "xlt"])(
    "meldt VBA in .%s zonder projectcode uit te voeren",
    async (ext) => {
      const bytes = schrijfCfb([
        { pad: "Workbook", data: new Uint8Array(32) },
        {
          pad: "_VBA_PROJECT_CUR/VBA/Module1",
          data: strToU8('Sub Auto_Open()\nShell "must never run"\nEnd Sub'),
        },
      ]);
      expect(bronMacros(bytes, ext)).toBe("vba");
      const r = await bereidOpenen(`Macros.${ext}`, bytes, {
        converteer: async () => xlsx,
      });
      expect(
        r?.rapport?.regels.find((r) => r.id === "macros")?.gevolg,
      ).toContain("niet overgenomen");
    },
  );
  it("meldt VBA in XLSB en scripts in ODS/OTS uitsluitend op onderdeelnamen", async () => {
    const b = zipSync({ "xl/vbaProject.bin": strToU8("not executed") });
    expect(bronMacros(b, "xlsb")).toBe("vba");
    const r = await bereidOpenen("Macros.xlsb", b, {
      converteer: async () => xlsx,
    });
    expect(r?.rapport?.regels.some((r) => r.id === "macros")).toBe(true);
    for (const ext of ["ods", "ots"]) {
      const bytes = zipSync({
        "Basic/Standard/Module1.xml": strToU8("not executed"),
      });
      expect(bronMacros(bytes, ext)).toBe("scripts");
      const r = await bereidOpenen(`Scripts.${ext}`, bytes, {
        converteer: async () => xlsx,
      });
      expect(
        r?.rapport?.regels.find((r) => r.id === "macros")?.gevolg,
      ).toContain("niet overgenomen");
    }
  });
  it("meldt het behouden 1904-datumsysteem na legacyconversie", async () => {
    const p = new Pakket(xlsx);
    p.schrijf(
      "xl/workbook.xml",
      p
        .lees("xl/workbook.xml")
        .replace("<workbookPr/>", '<workbookPr date1904="1"/>'),
    );
    const r = await bereidOpenen("Mac.xls", new Uint8Array([1]), {
      converteer: async () => p.inpakken(),
    });
    expect(r?.rapport?.regels.some((r) => r.onderdeel.includes("1904"))).toBe(
      true,
    );
  });
  it("zet macro-uitvoering en externe updates in het gedeelde conversieprofiel uit", () => {
    const profiel = readFileSync("src-tauri/src/conversieprofiel.xcu", "utf8");
    expect(profiel).toContain('name="DisableMacrosExecution"');
    expect(profiel).toContain('name="MacroSecurityLevel"');
    expect(profiel.indexOf('name="DefaultVersion"')).toBeLessThan(
      profiel.indexOf('name="MacroSecurityLevel"'),
    );
  });
});
