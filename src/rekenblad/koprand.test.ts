import { describe, expect, it } from "vitest";
import { kopRand, kopRandBreedte } from "./koprand";

describe("selecteren naast een sleepgrens (#60)", () => {
  it.each([64, 20, 6.4, 2, .8])("houdt het midden van een spoor van %s px bereikbaar", grootte => {
    expect(kopRand(grootte, grootte / 2)).toBeNull();
    expect(kopRand(grootte, 0)).toBe("vorige");
    expect(kopRand(grootte, grootte)).toBe("huidige");
    expect(kopRandBreedte(grootte) * 2).toBeLessThanOrEqual(grootte / 2);
  });
  it("behoudt de normale vier-pixelgrens en laat ongeldige maten ongemoeid", () => {
    expect(kopRand(64, 4)).toBe("vorige");
    expect(kopRand(64, 60)).toBe("huidige");
    expect(kopRand(64, 5)).toBeNull();
    expect(kopRand(0, 0)).toBeNull();
    expect(kopRand(-1, 0)).toBeNull();
    expect(kopRand(NaN, 0)).toBeNull();
  });
});
