import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { datumTekst } from "./RecenteBestanden";
import { zetTaal } from "./i18n/config";

beforeEach(() => {
  vi.stubEnv("TZ", "Europe/Amsterdam");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await zetTaal("nl");
});

describe("kalenderdagen bij recente bestanden en herstelkopieën (#13)", () => {
  it.each([false, true])(
    "toont het eerste uur van de 25-uursdag als gisteren (in zin: %s)",
    (inZin) => {
      const gisteren = new Date(2026, 9, 25, 0, 30);
      const nu = new Date(2026, 9, 26, 12);
      expect(gisteren.getTimezoneOffset()).toBe(-120);
      expect(nu.getTimezoneOffset()).toBe(-60);
      expect(datumTekst(gisteren.getTime(), nu.getTime(), inZin)).toMatch(
        inZin ? /^gisteren/ : /^Gisteren/,
      );
    },
  );
  it("noemt de laatste avond vóór een 23-uursdag niet gisteren", () => {
    const datum = new Date(2026, 2, 28, 23, 30);
    const nu = new Date(2026, 2, 30, 12);
    expect(datum.getTimezoneOffset()).toBe(-60);
    expect(nu.getTimezoneOffset()).toBe(-120);
    expect(datumTekst(datum.getTime(), nu.getTime())).not.toMatch(/^Gisteren/);
    expect(datumTekst(datum.getTime(), nu.getTime())).toMatch(/28/);
  });
  it("toont een toekomstige kalenderdag als datum, niet als vandaag", () => {
    expect(
      datumTekst(
        new Date(2026, 10, 10, 8).getTime(),
        new Date(2026, 10, 9, 12).getTime(),
      ),
    ).not.toMatch(/^Vandaag/);
  });
  it("houdt vandaag en gisteren correct rond de jaargrens", () => {
    const nu = new Date(2027, 0, 1, 12).getTime();
    expect(datumTekst(new Date(2027, 0, 1, 0).getTime(), nu)).toMatch(
      /^Vandaag/,
    );
    expect(datumTekst(new Date(2026, 11, 31, 0).getTime(), nu)).toMatch(
      /^Gisteren/,
    );
    expect(
      datumTekst(new Date(2026, 11, 30, 23, 59).getTime(), nu),
    ).not.toMatch(/^Gisteren/);
  });
  it("gebruikt ook de Engelse relatieve tekst bij de wintertijdgrens", async () => {
    await zetTaal("en");
    expect(
      datumTekst(
        new Date(2026, 9, 25, 0, 30).getTime(),
        new Date(2026, 9, 26, 12).getTime(),
      ),
    ).toMatch(/^Yesterday/);
  });
});
