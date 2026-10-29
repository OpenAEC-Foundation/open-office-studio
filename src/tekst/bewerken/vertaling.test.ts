import { afterAll, describe, expect, it } from "vitest";
import { zetTaal } from "../../i18n/config";
import { naamVanOpdracht } from "./herhalen";
import { omschrijfOpmaak } from "./kwast";
import { toetsVoorProfiel } from "./profielToets";

describe("Tekst bewerken in de interfacetaal", () => {
  afterAll(() => zetTaal("nl"));

  it("vertaalt herhaalnamen en de kwastomschrijving; profieltoetsen blijven gelijk", async () => {
    const nlToets = toetsVoorProfiel("Ctrl+Space", "word");
    await zetTaal("de");
    expect(naamVanOpdracht("bold", null)).toBe("Fett");
    expect(naamVanOpdracht("fontSize", { points: 14 })).toBe("Schriftgrad 14");
    expect(omschrijfOpmaak({ bold: true, italic: true } as never)).toBe("fett, kursiv");
    expect(omschrijfOpmaak(null)).toBe("keine Formatierung");
    expect(toetsVoorProfiel("Ctrl+Space", "word")).toBe(nlToets);

    await zetTaal("nl");
    expect(naamVanOpdracht("bold", null)).toBe("Vet");
    expect(omschrijfOpmaak(null)).toBe("geen opmaak");
  });
});
