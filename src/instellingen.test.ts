import { describe, expect, it } from "vitest";
import { normaliseerInstellingen, pasToe, standaardInstellingen } from "./instellingen";

describe("instellingen", () => {
  it("valt terug op standaarden bij onbekende of beschadigde gegevens", () => {
    expect(normaliseerInstellingen(null)).toEqual(standaardInstellingen);
    expect(normaliseerInstellingen("tekst")).toEqual(standaardInstellingen);
    const raar = normaliseerInstellingen({
      thema: "paars",
      opslagformaat: { docx: "exe", xlsx: "ods" },
      lint: { compact: "ja" },
      statusbalk: { zoom: false },
      emailExterneInhoud: "altijd",
    });
    expect(raar.thema).toBe("forge");
    expect(raar.opslagformaat).toEqual({ docx: "docx", xlsx: "ods", pptx: "pptx" });
    expect(raar.lint.compact).toBe(false);
    expect(raar.statusbalk.zoom).toBe(false);
    expect(raar.statusbalk.tekst).toBe(true);
    expect(raar.emailExterneInhoud).toBe("account");
  });

  it("voegt geneste wijzigingen samen", () => {
    const na = pasToe(standaardInstellingen, { lint: { compact: true }, thema: "systeem" });
    expect(na.lint).toEqual({ compact: true, ingeklapt: false });
    expect(na.thema).toBe("systeem");
    expect(pasToe(na, { opslagformaat: { pptx: "odp" } }).opslagformaat).toEqual({
      docx: "docx",
      xlsx: "xlsx",
      pptx: "odp",
    });
  });
  it("behoudt oude statuskeuzes en bewaart de vijf selectiestatistieken afzonderlijk", () => {
    const oud = normaliseerInstellingen({ statusbalk: { rekenblad: false, zoom: true } });
    expect(oud.statusbalk.rekenblad).toBe(false);
    expect(oud.rekenbladStatistiek).toEqual({ gemiddelde: true, aantal: true, som: true, minimum: false, maximum: false });
    const aangepast = pasToe(oud, { rekenbladStatistiek: { minimum: true, aantal: false } });
    expect(normaliseerInstellingen(JSON.parse(JSON.stringify(aangepast))).rekenbladStatistiek)
      .toEqual({ gemiddelde: true, aantal: false, som: true, minimum: true, maximum: false });
    expect(normaliseerInstellingen({ rekenbladStatistiek: { minimum: "ja", maximum: true } }).rekenbladStatistiek)
      .toEqual({ gemiddelde: true, aantal: true, som: true, minimum: false, maximum: true });
  });
});
