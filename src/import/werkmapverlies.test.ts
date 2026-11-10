import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { controleerPakket, risicoBeleid } from "../pakketcontrole";
import { Pakket } from "../grafieken/pakket";
import { opslagRapport } from "./rapport";
import { uitvoerformaat } from "../formaten";
const basis = readFileSync("public/templates/nieuw.xlsx");
describe("confirmed modern workbook-structure conversion loss (#32/#35/#72)", () => {
  it("warns on runtime output while native XLSX saving remains allowed", () => {
    const bytes = readFileSync(
      "src/import/testbestanden/modern-workbook-protection.xlsx",
    );
    const risico = controleerPakket(bytes, "xlsx").risicos;
    expect(risico).toContain("werkmapstructuur");
    expect(risicoBeleid(risico, "xlsx", "engine").opslaanGeblokkeerd).toBe(
      false,
    );
    expect(
      opslagRapport({
        soort: "xlsx",
        formaat: uitvoerformaat("xlsx", "xlsx")!,
        route: "engine",
        risicos: risico,
      }),
    ).toBeNull();
    for (const ext of ["ods", "ots", "xls", "xlt"]) {
      const r = opslagRapport({
        soort: "xlsx",
        formaat: uitvoerformaat("xlsx", ext)!,
        route: "runtime",
        risicos: risico,
      });
      expect(
        r?.regels.find((r) => r.onderdeel.includes("Werkmapstructuur"))?.gevolg,
      ).toContain("verloren");
    }
  });
  it("does not claim confirmed hash loss for an empty tag, unlocked structure or legacy hash", () => {
    for (const protection of [
      "<workbookProtection/>",
      '<workbookProtection lockStructure="0" workbookAlgorithmName="SHA-512" workbookHashValue="x"/>',
      '<workbookProtection lockStructure="1" workbookPassword="AB12"/>',
    ]) {
      const p = new Pakket(basis);
      p.schrijf(
        "xl/workbook.xml",
        p.lees("xl/workbook.xml").replace("<workbookProtection/>", protection),
      );
      expect(controleerPakket(p.inpakken(), "xlsx").risicos).not.toContain(
        "werkmapstructuur",
      );
    }
  });
});
