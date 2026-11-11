import { readFileSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  initWasm,
  openPresentation,
  type PresentationHandle,
} from "@betteroffice/pptx";
import {
  overzichtAlineas,
  tekstVerschil,
  wijzigOverzichtAlinea,
} from "./overzicht";

beforeAll(async () =>
  initWasm(
    readFileSync(
      "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
    ),
  ),
);
const boeken: PresentationHandle[] = [];
afterEach(() => boeken.splice(0).forEach((h) => h.dispose()));
function open(
  bytes: Uint8Array = readFileSync("docs/voorbeelden/Ontwerpvisie.pptx"),
) {
  const h = openPresentation(bytes);
  boeken.push(h);
  return h;
}
function voorbeeld(tekst = "Eerste titel 😀") {
  const h = open(),
    slideId = h.snapshot().slides[0].id;
  const { shapeId } = h.addTextBox(slideId, {
    name: "Overzichtproef",
    text: tekst,
    style: {},
    rect: { x: 100000, y: 100000, width: 3000000, height: 1000000 },
  });
  const a = overzichtAlineas(h.readContent()).find(
    (a) => a.shapeId === shapeId,
  )!;
  return { h, a, shapeId };
}
const tekst = (h: PresentationHandle, shapeId: string) =>
  overzichtAlineas(h.readContent())
    .filter((a) => a.shapeId === shapeId)
    .map((a) => a.tekst)
    .join("\n");
const heropendeTekst = (h: PresentationHandle) => {
  const nieuw = open(h.save());
  return tekst(
    nieuw,
    nieuw.snapshot().slides[0].shapes.find((s) => s.name === "Overzichtproef")!
      .id,
  );
};

describe("bewerkbaar presentatie-overzicht (#76)", () => {
  it("leest tekst van alle dia's", () => {
    const h = open();
    const alineas = overzichtAlineas(h.readContent());
    expect(new Set(alineas.map((a) => a.slideId)).size).toBe(3);
    expect(alineas.some((a) => a.tekst.length > 0)).toBe(true);
  });
  it.each([
    ["a😀z", "a😁z", { start: 1, end: 3, text: "😁" }],
    ["Titel", "Nieuwe titel", { start: 0, end: 1, text: "Nieuwe t" }],
    ["abc", "ab", { start: 2, end: 3, text: "" }],
    ["", "😀", { start: 0, end: 0, text: "😀" }],
  ])("berekent veilige UTF-16-grenzen voor %s → %s", (oud, nieuw, verschil) => {
    expect(tekstVerschil(oud, nieuw)).toEqual(verschil);
  });
  it("past tekst meteen toe, met Undo/Redo en PPTX heropenen", () => {
    const { h, a, shapeId } = voorbeeld();
    expect(wijzigOverzichtAlinea(h, a, "Nieuwe titel 😁")).toBe(true);
    expect(tekst(h, shapeId)).toBe("Nieuwe titel 😁");
    h.undo();
    expect(tekst(h, shapeId)).toBe(a.tekst);
    h.redo();
    expect(tekst(h, shapeId)).toBe("Nieuwe titel 😁");
    expect(heropendeTekst(h)).toBe("Nieuwe titel 😁");
  });
  it("behoudt opmaak aan weerszijden van gewijzigde tekst", () => {
    const { h, a, shapeId } = voorbeeld("AA midden ZZ");
    h.formatText(a.storyId, 0, 2, { bold: true, color: "#FF0000" });
    h.formatText(a.storyId, 10, 12, { italic: true });
    wijzigOverzichtAlinea(h, a, "AA aangepast ZZ");
    const p = h.story(a.storyId).paragraphs[0];
    expect(p.runs.find((r) => r.text.includes("AA"))?.style).toMatchObject({
      bold: true,
      color: "#FF0000",
    });
    expect(p.runs.find((r) => r.text.includes("ZZ"))?.style.italic).toBe(true);
    expect(heropendeTekst(h)).toBe("AA aangepast ZZ");
  });
  it("weigert een verouderde alinea zonder nieuwe tekst te overschrijven", () => {
    const { h, a, shapeId } = voorbeeld();
    wijzigOverzichtAlinea(h, a, "Intussen gewijzigd");
    const versie = h.version();
    expect(() => wijzigOverzichtAlinea(h, a, "Verouderde invoer")).toThrow(
      /intussen/,
    );
    expect(h.version()).toBe(versie);
    expect(tekst(h, shapeId)).toBe("Intussen gewijzigd");
  });
  it("maakt geen wijziging voor identieke invoer", () => {
    const { h, a } = voorbeeld();
    const versie = h.version();
    expect(wijzigOverzichtAlinea(h, a, a.tekst)).toBe(false);
    expect(h.version()).toBe(versie);
  });
  it("draait bij een weigering geen eerdere gebruikersbewerking terug", () => {
    const { h, a, shapeId } = voorbeeld("Bestaande tekst");
    const versie = h.version();
    const stop = vi.spyOn(h, "insertParagraphBreak").mockImplementation(() => { throw new Error("Geweigerd"); });
    try {
      expect(() => wijzigOverzichtAlinea(h, a, a.tekst + "\n")).toThrow("Geweigerd");
      expect(h.version()).toBe(versie);
      expect(tekst(h, shapeId)).toBe("Bestaande tekst");
    } finally { stop.mockRestore(); }
  });
  it("splitst ook een bestaand leeg titelvak op de juiste plek", () => {
    const h = open();
    let a = overzichtAlineas(h.readContent())[0];
    wijzigOverzichtAlinea(h, a, "Outline update 😀");
    a = overzichtAlineas(h.readContent())[0];
    const voor = tekst(h, a.shapeId);
    wijzigOverzichtAlinea(h, a, a.tekst + "\n");
    expect(tekst(h, a.shapeId)).toBe(
      a.tekst + "\n" + voor.slice(a.tekst.length),
    );
  });
  it("voegt alinea's toe als één Undo-stap en bewaart ze", () => {
    const { h, a, shapeId } = voorbeeld("Een regel");
    wijzigOverzichtAlinea(h, a, "Een\ntweede regel");
    expect(tekst(h, shapeId)).toBe("Een\ntweede regel");
    expect(heropendeTekst(h)).toBe("Een\ntweede regel");
    h.undo();
    expect(tekst(h, shapeId)).toBe("Een regel");
    h.redo();
    expect(tekst(h, shapeId)).toBe("Een\ntweede regel");
  });
});
