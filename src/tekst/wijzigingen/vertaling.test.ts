import { afterAll, describe, expect, it } from "vitest";
import { zetTaal } from "../../i18n/config";
import { taalNaam } from "../info/taal";
import { regelSoortNamen } from "../eenheden";
import { soortNaam, weergaveNaam } from "./logica";
import { meldingen, resultaatNaam } from "./vergelijken";

describe("Tekst: wijzigingen en info in de interfacetaal", () => {
  afterAll(() => zetTaal("nl"));

  it("toont Engels na een taalwissel en Nederlands daarna weer", async () => {
    await zetTaal("en");
    expect(soortNaam("trIns")).toBe("Row inserted");
    expect(weergaveNaam("eenvoudig")).toBe("Simple Markup");
    expect(resultaatNaam("Plan v1.docx", "Plan v2.docx")).toBe("Comparison Plan v1 – Plan v2.docx");
    expect(taalNaam("nl-BE")).toBe("Dutch (Belgium)");
    expect(regelSoortNamen.anderhalf).toBe("1.5 lines");
    const d = { code: "paragraph-move", severity: "warning", message: "engine", locations: [] } as never;
    expect(meldingen([d])[0].tekst).toMatch(/Paragraphs were moved/);

    await zetTaal("nl");
    expect(soortNaam("trIns")).toBe("Rij ingevoegd");
    expect(taalNaam("nl-BE")).toBe("Nederlands (België)");
    expect(regelSoortNamen.anderhalf).toBe("1,5 regel");
  });
});
