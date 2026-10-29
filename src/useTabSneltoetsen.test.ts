import { describe, expect, it } from "vitest";
import { tabToets } from "./useTabSneltoetsen";
import type { Tabblad } from "./tabbladen";

const toets = (key: string, extra: Partial<KeyboardEvent> = {}) => ({
  key,
  code: extra.code ?? "",
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...extra,
});
const document = (soort: "docx" | "xlsx"): Tabblad => ({
  type: "document",
  id: 1,
  naam: "a",
  soort,
  bytes: new Uint8Array(),
  vingerafdruk: null,
  werkbestand: null,
  gereed: true,
  gewijzigd: false,
  exportFormaat: soort,
  zoom: 1,
  bron: null,
});
const context = (actief: Tabblad | null = document("docx")) => ({
  actief,
  opStart: actief === null,
  vorige: 1,
});

describe("tabbladsneltoetsen", () => {
  it("Ctrl+F6 en Ctrl+Shift+F6 wisselen van document", () => {
    expect(tabToets(toets("F6", { ctrlKey: true }), context())).toEqual({
      opdracht: "actie",
      actie: { type: "volgende" },
    });
    expect(
      tabToets(toets("F6", { ctrlKey: true, shiftKey: true }), context()),
    ).toEqual({ opdracht: "actie", actie: { type: "vorige" } });
    expect(tabToets(toets("F6"), context())).toBeNull();
  });

  it("Ctrl+N maakt een nieuw document van dezelfde soort; elders blijft Ctrl+N vrij", () => {
    expect(tabToets(toets("n", { ctrlKey: true }), context(document("xlsx")))).toEqual({
      opdracht: "nieuw",
      soort: "xlsx",
    });
    // Cmd+N op macOS, ook met Caps Lock (hoofdletter).
    expect(tabToets(toets("N", { metaKey: true }), context())).toEqual({ opdracht: "nieuw", soort: "docx" });
    // Startscherm en modules (E-mail: nieuw bericht) niet; Ctrl+Shift+N is een tekststijl (Word).
    expect(tabToets(toets("n", { ctrlKey: true }), context(null))).toBeNull();
    expect(tabToets(toets("n", { ctrlKey: true, shiftKey: true }), context())).toBeNull();
    expect(tabToets(toets("n", { ctrlKey: true, altKey: true }), context())).toBeNull();
  });

  it("F12 is Opslaan als, alleen voor documenten", () => {
    expect(tabToets(toets("F12"), context())).toEqual({
      opdracht: "opslaanAls",
    });
    expect(tabToets(toets("F12"), context(null))).toBeNull();
    expect(tabToets(toets("F12", { ctrlKey: true }), context())).toBeNull();
  });

  it("wisselt met Ctrl+Tab en Ctrl+Shift+Tab", () => {
    expect(tabToets(toets("Tab", { ctrlKey: true }), context())).toEqual({
      opdracht: "actie",
      actie: { type: "volgende" },
    });
    expect(
      tabToets(toets("Tab", { ctrlKey: true, shiftKey: true }), context()),
    ).toEqual({ opdracht: "actie", actie: { type: "vorige" } });
  });

  it("laat Ctrl+PageDown in het rekenblad aan de bladwissel", () => {
    expect(
      tabToets(toets("PageDown", { ctrlKey: true }), context(document("xlsx"))),
    ).toBeNull();
    expect(
      tabToets(toets("PageUp", { ctrlKey: true }), context(document("docx"))),
    ).toEqual({ opdracht: "actie", actie: { type: "vorige" } });
    // Ctrl+Shift+PageUp is in de presentatie een diaopdracht.
    expect(
      tabToets(toets("PageUp", { ctrlKey: true, shiftKey: true }), context()),
    ).toBeNull();
  });

  it("opent Opslaan als met Ctrl+Shift+S in een document", () => {
    expect(tabToets(toets("s", { ctrlKey: true }), context())).toEqual({
      opdracht: "opslaan",
    });
    expect(
      tabToets(toets("S", { ctrlKey: true, shiftKey: true }), context()),
    ).toEqual({ opdracht: "opslaanAls" });
    expect(
      tabToets(toets("S", { ctrlKey: true, shiftKey: true }), context(null)),
    ).toEqual({ opdracht: "opslaan" });
  });

  it("sluit met Ctrl+W en Ctrl+F4, maar niet op Start", () => {
    expect(tabToets(toets("w", { ctrlKey: true }), context())).toEqual({
      opdracht: "sluit",
    });
    expect(tabToets(toets("F4", { ctrlKey: true }), context())).toEqual({
      opdracht: "sluit",
    });
    expect(tabToets(toets("w", { ctrlKey: true }), context(null))).toBeNull();
  });

  it("kiest met Alt+cijfer een tabblad en laat Ctrl+cijfer met rust", () => {
    expect(tabToets(toets("2", { altKey: true, code: "Digit2" }), context()))
      .toEqual({ opdracht: "actie", actie: { type: "activeerIndex", index: 1 } });
    const laatste = tabToets(toets("9", { altKey: true, code: "Digit9" }), context());
    expect(laatste?.opdracht === "actie" && laatste.actie).toMatchObject({
      type: "activeerIndex",
    });
    expect(tabToets(toets("1", { ctrlKey: true, code: "Digit1" }), context()))
      .toBeNull();
  });

  it("gaat met Escape van Start terug naar het vorige tabblad", () => {
    expect(tabToets(toets("Escape"), context(null))).toEqual({
      opdracht: "terug",
    });
    expect(tabToets(toets("Escape"), context())).toBeNull();
  });
});
