import { expect, it } from "vitest";
import { MIN_KOLOM, passendInVenster } from "./logica";

it.each([
  [[10000, 230], 1000],
  [[230, 10000], 1000],
  [[10000, 230, 230], 1000],
  [[1, 10000, 1, 10000], 2000],
])(
  "houdt de minimumkolommen binnen de beschikbare paginabreedte (#48): %j",
  (breedtes, beschikbaar) => {
    const uit = passendInVenster(breedtes as number[], beschikbaar as number);
    expect(uit.reduce((som, b) => som + b, 0)).toBe(beschikbaar);
    expect(uit.every((b) => b >= MIN_KOLOM && Number.isInteger(b))).toBe(true);
  },
);
it("houdt de minimale leesbare breedte als de pagina smaller is dan alle minima samen", () => {
  expect(passendInVenster([10000, 230], 100)).toEqual([MIN_KOLOM, MIN_KOLOM]);
});
it("verdeelt de ruimte ook bij sterk uiteenlopende breedtes zonder afrondingsverlies", () => {
  for (let n = 1; n <= 12; n++) {
    const breedtes = Array.from({ length: n }, (_, i) => 2 ** (i + 1));
    const doel = n * MIN_KOLOM + 137;
    const uit = passendInVenster(breedtes, doel);
    expect(uit.reduce((som, b) => som + b, 0)).toBe(doel);
    expect(uit.every((b) => b >= MIN_KOLOM && Number.isInteger(b))).toBe(true);
  }
});
