import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { herstelAlgemeneRegio } from "../../scripts/rekenbladengine-compatibiliteit";
import { passendAlgemeen } from "./algemeenPassend";
const bron = readFileSync(
  "node_modules/@betteroffice/xlsx/dist/index.js",
  "utf8",
);
// De werkelijke afrondingsfuncties uit het vastgezette pakket; geen kopie van
// hun implementatie. De aansluitingscontrole bewaakt de volledige bronhash.
const begin = bron.indexOf("function Ie(");
const einde = bron.indexOf("var w;", begin);
const pas = Function(`${bron.slice(begin, einde)}; return Ie;`)() as Parameters<
  typeof passendAlgemeen
>[0];
const context = {
  measureText: (s: string) => ({
    width: [...s].reduce(
      (som, c) => som + (c === "." ? 2 : c === "," ? 8 : 10),
      0,
    ),
  }),
};

describe("Algemene getalnotatie in een smalle kolom", () => {
  it("sluit uitsluitend aan op de gecontroleerde tekenlaag", () => {
    expect(herstelAlgemeneRegio(bron)).toContain(
      'oosPassendAlgemeen(Ie,n.general,n.width,e,n.decimal??".")',
    );
    expect(() => herstelAlgemeneRegio(bron + " ")).toThrow();
  });
  it("meet de werkelijke komma, ook wanneer een punt minder breed is", () => {
    expect(passendAlgemeen(pas, 1234.56789, 65, context, ".")).toBe("1234.57");
    expect(passendAlgemeen(pas, 1234.56789, 65, context, ",")).toBe("1234,6");
  });
  it("behoudt teken en exponent bij wetenschappelijke notatie", () => {
    expect(passendAlgemeen(pas, -123456789.123, 90, context, ",")).toBe(
      "-1,23E+08",
    );
  });
  it("laat de bestaande overloopweigering intact", () => {
    expect(passendAlgemeen(pas, 123456789, 10, context, ",")).toBeUndefined();
    expect(passendAlgemeen(pas, NaN, 90, context, ",")).toBeUndefined();
  });
});
