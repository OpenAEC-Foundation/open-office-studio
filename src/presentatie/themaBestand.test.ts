import { describe, expect, it } from "vitest";
import { THEMAS } from "./ontwerp";
import {
  leesThemaBestand,
  schrijfThemaBestand,
  themaBestandsnaam,
  THEMA_BESTAND_MAX,
} from "./themaBestand";
const encode = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));
const pakket = (thema: unknown = THEMAS[0]) => ({
  formaat: "OpenOfficeStudio.Theme",
  versie: 1,
  thema,
});
describe("aangepaste thema's uitwisselen (#78)", () => {
  it("roundtrips all twelve colors, both fonts, background and Unicode name", () => {
    const t = {
      ...THEMAS[1],
      naam: "Huisstijl 🏢 / 日本語",
      kop: "Liberation Sans",
      tekst: "Noto Sans",
    };
    expect(leesThemaBestand(schrijfThemaBestand(t))).toEqual(t);
  });
  it("writes a detached, normalized design without unknown fields or document content", () => {
    const t = {
      ...THEMAS[1],
      naam: " Custom ",
      kleuren: THEMAS[1].kleuren.map((c) => c.toLowerCase()),
      privateSlides: ["secret"],
    };
    const b = schrijfThemaBestand(t);
    expect(new TextDecoder().decode(b)).not.toContain("secret");
    const r = leesThemaBestand(b);
    expect(r.naam).toBe("Custom");
    expect(r.kleuren).toEqual(THEMAS[1].kleuren);
    r.kleuren[0] = "#FF0000";
    expect(t.kleuren[0]).not.toBe("#FF0000");
  });
  it("accepts UTF-8 BOM, whitespace and Windows newlines", () => {
    const text =
      "\uFEFF" + JSON.stringify(pakket(), null, 2).replaceAll("\n", "\r\n");
    expect(leesThemaBestand(new TextEncoder().encode(text))).toEqual(THEMAS[0]);
  });
  it("rejects unknown versions, missing fields, malformed JSON and invalid UTF-8", () => {
    for (const v of [
      { ...pakket(), versie: 2 },
      { ...pakket(), formaat: "other" },
      null,
      [],
      { ...pakket(), thema: { naam: "Incomplete" } },
    ])
      expect(() => leesThemaBestand(encode(v))).toThrow("invalid");
    expect(() => leesThemaBestand(new Uint8Array([255]))).toThrow("invalid");
    expect(() => leesThemaBestand(new TextEncoder().encode("{"))).toThrow(
      "invalid",
    );
  });
  it("rejects unsafe color/font/name values and oversized files", () => {
    for (const t of [
      { ...THEMAS[0], kop: "Bad\u0000Font" },
      { ...THEMAS[0], naam: "" },
      { ...THEMAS[0], kleuren: ["#000000"] },
      { ...THEMAS[0], achtergrond: "url(https://example.invalid/)" },
      { ...THEMAS[0], kleuren: THEMAS[0].kleuren.map(() => null) },
    ])
      expect(() => leesThemaBestand(encode(pakket(t)))).toThrow("invalid");
    expect(() =>
      leesThemaBestand(new Uint8Array(THEMA_BESTAND_MAX + 1)),
    ).toThrow("tooLarge");
  });
  it("generates bounded Windows-safe filenames without splitting Unicode pairs", () => {
    expect(themaBestandsnaam("CON/Brand:*?")).toBe(
      "theme-CON_Brand___.oos-theme",
    );
    expect(themaBestandsnaam(" ")).toBe("theme-theme.oos-theme");
    expect(Array.from(themaBestandsnaam("🏢".repeat(100))).length).toBe(
      80 + "theme-.oos-theme".length,
    );
    expect(themaBestandsnaam("Name. ")).toBe("theme-Name.oos-theme");
  });
});
