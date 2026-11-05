import { describe, expect, it } from "vitest";
import { cursorNaarScherm, kiesSpiegeldeel } from "./meten";

describe("cursor uit de Rust-weergave", () => {
  it("rekent de actuele oorsprong en zoom om naar schermpixels", () => {
    expect(
      cursorNaarScherm(
        { x: 40, y: 80, height: 16 },
        { left: 100, top: 250 },
        1.5,
      ),
    ).toEqual({ left: 160, top: 370, width: 1.5, height: 24 });
    expect(
      cursorNaarScherm(
        { x: 40, y: 80, height: 16 },
        { left: -20, top: -400 },
        0.5,
      ),
    ).toEqual({ left: 0, top: -360, width: 0.5, height: 8 });
  });
  it("biedt geen ongeldige of onzichtbare cursormaat als tabelanker aan", () => {
    for (const schaal of [0, -1, NaN, Infinity])
      expect(
        cursorNaarScherm(
          { x: 40, y: 80, height: 16 },
          { left: 0, top: 0 },
          schaal,
        ),
      ).toBeNull();
    expect(
      cursorNaarScherm({ x: NaN, y: 80, height: 16 }, { left: 0, top: 0 }, 1),
    ).toBeNull();
    expect(
      cursorNaarScherm({ x: 40, y: 80, height: 0 }, { left: 0, top: 0 }, 1),
    ).toBeNull();
  });
});

describe("cursorregel uit de spiegel", () => {
  const delen = [
    { element: "anker", start: 10, eind: 10 },
    { element: "run1", start: 10, eind: 15 },
    { element: "run2", start: 15, eind: 20 },
  ];
  it("neemt het tekstdeel waarin de positie valt", () => {
    expect(kiesSpiegeldeel(delen, 12)).toBe("run1");
    expect(kiesSpiegeldeel(delen, 15)).toBe("run2");
  });
  it("neemt aan het eind van de alinea het laatste deel", () => {
    expect(kiesSpiegeldeel(delen, 20)).toBe("run2");
  });
  it("valt in een lege alinea terug op het lege anker", () => {
    expect(
      kiesSpiegeldeel([{ element: "leeg", start: 30, eind: 30 }], 30),
    ).toBe("leeg");
    expect(kiesSpiegeldeel(delen, 40)).toBeNull();
  });
});
