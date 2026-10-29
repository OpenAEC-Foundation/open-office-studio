import { describe, expect, it } from "vitest";
import { zetTaal } from "../i18n/config";
import {
  datumTekst,
  selectieBegin,
  tekenVervangingen,
  telTekst,
  tijdTekst,
  volgendeHoofdletters,
  wijzigHoofdletters,
} from "./tekst-logica";

const OBJECT = String.fromCharCode(0xfffc);

describe("woorden tellen", () => {
  it("telt woorden, tekens en gevulde alinea's", () => {
    expect(
      telTekst(["Ruimte voor ideeën.", "", "Een heldere basis — 3 punten"]),
    ).toEqual({
      woorden: 8,
      tekens: 19 + 28,
      tekensZonderSpaties: 17 + 23,
      alineas: 2,
    });
  });
  it("negeert inline objecten en losse leestekens", () => {
    expect(telTekst([`Zie ${OBJECT} figuur – hier`]).woorden).toBe(3);
    expect(telTekst([`a${OBJECT}b`]).tekens).toBe(2);
  });
  it("telt vaste spaties als woordscheiding", () => {
    expect(telTekst([`10${String.fromCharCode(0xa0)}km`]).woorden).toBe(2);
  });
});

describe("hoofdletters wijzigen", () => {
  it("zet om naar hoofdletters en kleine letters", () => {
    expect(wijzigHoofdletters("Open Tekst", "hoofdletters")).toBe("OPEN TEKST");
    expect(wijzigHoofdletters("Open Tekst", "kleine")).toBe("open tekst");
  });
  it("maakt elk woord met hoofdletter, ook de IJ", () => {
    expect(wijzigHoofdletters("het ijzeren HEK van o’brien", "titel")).toBe(
      "Het IJzeren Hek Van O’brien",
    );
  });
  it("begint elke zin met een hoofdletter", () => {
    expect(wijzigHoofdletters("EERSTE ZIN. tweede zin! derde", "zin")).toBe(
      "Eerste zin. Tweede zin! Derde",
    );
  });
  it("wisselt hoofd- en kleine letters", () => {
    expect(wijzigHoofdletters("Open 3D", "wisselen")).toBe("oPEN 3d");
  });
  it("rouleert zoals Shift+F3", () => {
    expect(volgendeHoofdletters("twee woorden")).toBe("Twee Woorden");
    expect(volgendeHoofdletters("Twee Woorden")).toBe("Twee woorden");
    expect(volgendeHoofdletters("Twee woorden")).toBe("TWEE WOORDEN");
    expect(volgendeHoofdletters("TWEE WOORDEN")).toBe("twee woorden");
    expect(volgendeHoofdletters("123")).toBe("123");
  });
});

describe("datum en tijd", () => {
  const moment = new Date(2026, 9, 26, 9, 5);
  it("schrijft Nederlandse notatie", () => {
    expect(datumTekst(moment)).toBe("26-10-2026");
    expect(datumTekst(moment, true)).toBe("26 oktober 2026");
    expect(tijdTekst(moment)).toBe("09:05");
  });
  it("volgt de interfacetaal op het moment van invoegen", async () => {
    await zetTaal("en");
    try {
      expect(datumTekst(moment)).toBe("26/10/2026");
    } finally {
      await zetTaal("nl");
    }
    expect(datumTekst(moment)).toBe("26-10-2026");
  });
});

describe("selectie vervangen", () => {
  it("maakt per gewijzigd teken een vervanging", () => {
    expect(tekenVervangingen("aB c", "AB C", 10)).toEqual([
      { begin: 10, eind: 11, tekst: "A" },
      { begin: 13, eind: 14, tekst: "C" },
    ]);
    expect(tekenVervangingen("straße", "STRASSE")).toBeNull();
  });
  it("vindt het begin van de selectie", () => {
    expect(selectieBegin("de ruimte en de ruimte", "ruimte", "de ")).toBe(3);
    expect(
      selectieBegin("de ruimte en de ruimte", "ruimte", "de ruimte en de "),
    ).toBe(16);
    expect(selectieBegin("de ruimte en de ruimte", "ruimte")).toBeNull();
    expect(selectieBegin("één ruimte", "ruimte")).toBe(4);
    expect(selectieBegin("tekst", "")).toBeNull();
  });
});
