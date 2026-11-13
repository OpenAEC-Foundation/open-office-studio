import { describe, expect, it } from "vitest";
import { sleepGreep, type Greep } from "./logica";

describe("bijsnijgrepen blijven aan hun eigen kant (#49)", () => {
  const begin = { top: 0.1, right: 0.2, bottom: 0.3, left: 0.15 };
  it.each([
    ["w", 2, 0, { ...begin, left: 0.75 }],
    ["o", -2, 0, { ...begin, right: 0.8 }],
    ["n", 0, 2, { ...begin, top: 0.65 }],
    ["z", 0, -2, { ...begin, bottom: 0.85 }],
    ["no", -2, 2, { ...begin, top: 0.65, right: 0.8 }],
    ["zw", 2, -2, { ...begin, bottom: 0.85, left: 0.75 }],
  ] as const)("greep %s laat de tegenoverliggende randen staan", (greep, dx, dy, verwacht) => {
    expect(sleepGreep(begin, greep as Greep, dx, dy)).toEqual(verwacht);
  });
  it("kan vanaf de grens terugschuiven zonder de andere kant te veranderen", () => {
    const grens = sleepGreep(begin, "w", 2, 0);
    expect(sleepGreep(grens, "w", -0.1, 0)).toEqual({ ...begin, left: 0.65 });
  });
  it("bewaart de zichtbare maat bij verplaatsen aan de afbeeldingsrand", () => {
    expect(sleepGreep(begin, "verplaats", 2, -2)).toEqual({
      top: 0, right: 0, bottom: 0.4, left: 0.35,
    });
  });
});
