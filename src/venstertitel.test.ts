import { describe, expect, it } from "vitest";
import i18next, { zetTaal } from "./i18n/config";
import { titelbron, titelModule, venstertitel } from "./venstertitel";

const t = (sleutel: string, waarden?: Record<string, string>) => i18next.t(sleutel, waarden);

describe("venstertitel", () => {
  it("toont op Start alleen de appnaam", () => {
    expect(venstertitel(null, t)).toBe("Open Office Studio");
  });

  it("zet de module tussen haakjes achter document en app", () => {
    const document = (naam: string, soort: "docx" | "xlsx" | "pptx") =>
      titelbron({ type: "document", naam, soort, gewijzigd: false });
    expect(venstertitel(document("Ontwerpnotitie.docx", "docx"), t)).toBe(
      "Ontwerpnotitie.docx — Open Office Studio (Tekst)",
    );
    expect(venstertitel(document("Begroting.xlsx", "xlsx"), t)).toBe(
      "Begroting.xlsx — Open Office Studio (Rekenblad)",
    );
    expect(venstertitel(document("Visie.pptx", "pptx"), t)).toBe(
      "Visie.pptx — Open Office Studio (Presentatie)",
    );
  });

  it("geeft modules zonder document hun naam tussen haakjes", () => {
    const module = (m: "notities" | "database" | "email") =>
      titelbron({ type: "module", module: m, gewijzigd: false });
    expect(venstertitel(module("notities"), t)).toBe("Open Office Studio (Notities)");
    expect(venstertitel(module("database"), t)).toBe("Open Office Studio (Database)");
    expect(venstertitel(module("email"), t)).toBe("Open Office Studio (E-mail)");
  });

  it("zet een wijzigingsstip achter een gewijzigd document of module", () => {
    expect(
      venstertitel(
        titelbron({ type: "document", naam: "Ontwerpnotitie.docx", soort: "docx", gewijzigd: true }),
        t,
      ),
    ).toBe("Ontwerpnotitie.docx • — Open Office Studio (Tekst)");
    expect(
      venstertitel(titelbron({ type: "module", module: "database", gewijzigd: true }), t),
    ).toBe("Open Office Studio (Database) •");
  });

  it("volgt de interfacetaal via common:modules", async () => {
    await zetTaal("en");
    try {
      expect(
        venstertitel(
          titelbron({ type: "document", naam: "Plan.xlsx", soort: "xlsx", gewijzigd: false }),
          t,
        ),
      ).toBe("Plan.xlsx — Open Office Studio (Spreadsheet)");
    } finally {
      await zetTaal("nl");
    }
  });

  it("kent de module van elk soort tabblad", () => {
    expect(titelModule(null)).toBeNull();
    expect(titelModule({ type: "document", naam: "a", soort: "pptx", gewijzigd: false })).toBe(
      "presentatie",
    );
    expect(titelModule({ type: "module", module: "email", gewijzigd: false })).toBe("email");
    expect(titelbron(undefined)).toBeNull();
  });
});
