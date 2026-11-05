import { describe, expect, it } from "vitest";
import { minimaleSchuifpositie } from "./schuifpositie";

describe("schuifpositie bij verticale celuitlijning (#133)", () => {
  it("behoudt de oude positie wanneer de cursor daar volledig zichtbaar blijft", () => {
    // Gemeten in de interface: 108 → 154; de nieuwe cursor past bij beide posities.
    expect(minimaleSchuifpositie(108, 154, 35, 52, 490)).toBe(108);
  });
  it("schuift naar boven tot de cursor met een kleine vrije rand zichtbaar is", () => {
    expect(minimaleSchuifpositie(108, 154, -100, -83, 490)).toBe(46);
    expect(minimaleSchuifpositie(108, 0, 2, 19, 490)).toBe(0);
  });
  it("schuift naar beneden tot de onderkant van de cursor zichtbaar is", () => {
    expect(minimaleSchuifpositie(108, 154, 650, 667, 490)).toBe(339);
  });
});
