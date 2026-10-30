import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { kiesStudio, staatDocumentToe, studios } from "./model";
import { StudioStart } from "./StudioStart";
import { venstertitel } from "../venstertitel";

describe("gerichte studio-installaties", () => {
  it("heeft zeven verschillende namen, programma's en installatie-identiteiten", () => {
    expect(studios).toHaveLength(7);
    for (const veld of ["naam", "programma", "identifier"] as const)
      expect(new Set(studios.map((s) => s[veld])).size).toBe(7);
    expect(() => kiesStudio("onbekend")).toThrow();
  });
  it.each([
    ["writer", "docx"],
    ["spreadsheet", "xlsx"],
    ["presentation", "pptx"],
  ] as const)(
    "%s accepteert alleen de eigen documentsoort",
    (sleutel, eigen) => {
      for (const soort of ["docx", "xlsx", "pptx"] as const)
        expect(staatDocumentToe(kiesStudio(sleutel), soort)).toBe(
          soort === eigen,
        );
    },
  );
  it("behoudt bijlagevoorbeelden in Email en verhindert documenten in Notition", () => {
    for (const soort of ["docx", "xlsx", "pptx"] as const) {
      expect(staatDocumentToe(kiesStudio("email"), soort)).toBe(true);
      expect(staatDocumentToe(kiesStudio("notition"), soort)).toBe(false);
      expect(staatDocumentToe(kiesStudio(), soort)).toBe(true);
    }
  });
  it.each(["writer", "spreadsheet", "presentation", "email", "notition"])(
    "%s toont een eigen startscherm zonder suite-ingangen",
    (sleutel) => {
      const studio = kiesStudio(sleutel);
      const html = renderToStaticMarkup(
        <StudioStart
          studio={studio}
          bezig={false}
          open={() => {}}
          nieuw={() => {}}
          voorbeeld={() => {}}
          openModule={() => {}}
        />,
      );
      expect(html).toContain(studio.naam);
      expect(html).not.toContain("Database Studio");
      for (const ander of studios.filter((s) => s !== studio))
        expect(html).not.toContain(ander.naam);
    },
  );
  it("houdt de productnaam vast in de venstertitel", () => {
    const t = (sleutel: string, waarden?: Record<string, string>) =>
      waarden ? `${waarden.document} — ${waarden.app}` : sleutel;
    expect(venstertitel(null, t, "Open Writer Studio")).toBe(
      "Open Writer Studio",
    );
    expect(
      venstertitel(
        {
          type: "document",
          naam: "Brief.docx",
          soort: "docx",
          gewijzigd: true,
        },
        t,
        "Open Writer Studio",
      ),
    ).toContain("Brief.docx • — Open Writer Studio");
  });
});
