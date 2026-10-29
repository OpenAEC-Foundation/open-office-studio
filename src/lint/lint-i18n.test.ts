import { afterEach, describe, expect, it } from "vitest";
import i18next, { zetTaal } from "../i18n/config";
import { bladnaamFout, nieuweBladnaam } from "./rekenblad-logica";
import { datumTekst, specialeTekens } from "./presentatie-opdrachten";

describe("rekenblad- en presentatielint in het Engels", () => {
  afterEach(async () => {
    await zetTaal("nl");
  });

  it("geeft bladnamen en meldingen in de interfacetaal", async () => {
    await zetTaal("en");
    expect(nieuweBladnaam(["Sheet1"])).toBe("Sheet2");
    expect(bladnaamFout("", [])).toBe("Give the sheet a name.");
    expect(bladnaamFout("a", ["A"])).toBe('A sheet named "a" already exists.');
  });

  it("schrijft datum en tijd in de notatie van de interfacetaal", async () => {
    await zetTaal("en");
    const moment = new Date(2026, 9, 6, 9, 5);
    expect(datumTekst(moment, "datum")).toBe("06/10/2026");
    expect(datumTekst(moment, "tijd")).toBe("09:05");
  });

  it("heeft voor elk speciaal teken een naam in nl en en", async () => {
    for (const taal of ["nl", "en"] as const) {
      await zetTaal(taal);
      for (const { sleutel } of specialeTekens)
        expect(
          i18next.exists(`ribbon:presentation.characters.${sleutel}`),
        ).toBe(true);
    }
  });
});
