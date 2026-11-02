import { describe, expect, it } from "vitest";
import { maakInterneOpslag } from "./interneOpslag";

describe("interne documentopslag", () => {
  it("blijft intern zolang een overlappende export nog loopt", async () => {
    const opslag = maakInterneOpslag();
    let eerste!: () => void, tweede!: () => void;
    const a = opslag.voerUit(() => new Promise<void>((klaar) => { eerste = klaar; }));
    const b = opslag.voerUit(() => new Promise<void>((klaar) => { tweede = klaar; }));
    expect(opslag.bezig()).toBe(true);
    eerste();
    await a;
    expect(opslag.bezig()).toBe(true);
    tweede();
    await b;
    expect(opslag.bezig()).toBe(false);
  });

  it("ruimt ook na een mislukte export op", async () => {
    const opslag = maakInterneOpslag();
    await expect(opslag.voerUit(async () => { throw new Error("opslaan mislukt"); })).rejects.toThrow("opslaan mislukt");
    expect(opslag.bezig()).toBe(false);
    expect(await opslag.voerUit(async () => 42)).toBe(42);
    expect(opslag.bezig()).toBe(false);
  });
});
