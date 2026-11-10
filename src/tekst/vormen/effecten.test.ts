import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tekenVormEffect } from "./effecten";
import { herstelVormEffecten } from "../../../scripts/tekstengine-compatibiliteit";
describe("vormeffecten in dezelfde Canvas- en afdrukroute (#56)", () => {
  it("zet OOXML-kleur, dekking en EMU om zonder de bron te wijzigen", () => {
    const e = {
      kind: "shadow",
      color: { rgb: "2468AB" },
      opacity: 0.3,
      blurRadius: 38100,
      distance: 19050,
      direction: 45,
    };
    expect(tekenVormEffect(e)).toMatchObject({
      color: "rgba(36,104,171,0.3)",
      blurRadius: 4,
      distance: 2,
      direction: 45,
    });
    expect(e.color).toEqual({ rgb: "2468AB" });
    expect(e.blurRadius).toBe(38100);
  });
  it("behoudt reeds opgeloste displaylijst-effecten", () => {
    const e = { kind: "glow", color: "#00ff00", blurRadius: 4 };
    expect(tekenVormEffect(e)).toBe(e);
  });
  it("verwerkt alpha uit een opgeslagen/geïmporteerde kleur", () => {
    expect(
      tekenVormEffect({
        kind: "shadow",
        color: { rgb: "000000", transforms: [{ kind: "alpha", value: 0.3 }] },
        blurRadius: 9525,
      }),
    ).toMatchObject({ color: "rgba(0,0,0,0.3)", blurRadius: 1 });
  });
  it("gebruikt dezelfde standaardthemakleuren en gecachete rgb als de vormvulling", () => {
    expect(
      tekenVormEffect({ color: { themeColor: "accent4" }, size: 19050 }),
    ).toMatchObject({ color: "rgba(255,192,0,1)", size: 2 });
    expect(
      tekenVormEffect({
        color: { rgb: "833C0B", themeColor: "accent2", themeShade: "80" },
      }),
    ).toMatchObject({ color: "rgba(131,60,11,1)" });
  });
  it("bewaakt de ene productie-painter voor scherm, print en PDF", () => {
    const s = readFileSync(
      "node_modules/@betteroffice/docx/dist/chunk-EOFVNRML.mjs",
      "utf8",
    );
    expect(herstelVormEffecten(s)).toContain(
      "let t=oosVormEffect(n.effects?.find(",
    );
    expect(() => herstelVormEffecten("anders")).toThrow();
    expect(() => herstelVormEffecten(s + s)).toThrow();
  });
});
