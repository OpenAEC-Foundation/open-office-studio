import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { bronAfbeelding } from "./afbeeldingen";
import { herstelVormAfbeeldingen } from "../../../scripts/tekstengine-compatibiliteit";

describe("ingebedde rasterafbeeldingen in hybride Writer-sessies", () => {
  it("volgt de native archiefvolgorde inclusief onbekende mediadelen", () => {
    const bron = zipSync({
      "word/document.xml": strToU8("document"),
      "word/media/": new Uint8Array(),
      "word/media/z.bin": new Uint8Array([0]),
      "word/media/z.png": new Uint8Array([1, 2]),
      "WORD/MEDIA/a.JPEG": new Uint8Array([3, 4]),
    });
    expect(bronAfbeelding(bron, "media:0")).toBeNull();
    expect(bronAfbeelding(bron, "media:1")).toEqual({
      bytes: new Uint8Array([1, 2]),
      mimeType: "image/png",
    });
    expect(bronAfbeelding(bron, "media:2")).toEqual({
      bytes: new Uint8Array([3, 4]),
      mimeType: "image/jpeg",
    });
  });
  it("scheidt dezelfde tokens van verschillende documenten en accepteert geen URL of relId", () => {
    const a = zipSync({ "word/media/a.png": new Uint8Array([1]) });
    const b = zipSync({ "word/media/b.png": new Uint8Array([2]) });
    expect(bronAfbeelding(a, "media:0")?.bytes).toEqual(new Uint8Array([1]));
    expect(bronAfbeelding(b, "media:0")?.bytes).toEqual(new Uint8Array([2]));
    expect(bronAfbeelding(b.buffer as ArrayBuffer, "media:0")?.bytes).toEqual(
      new Uint8Array([2]),
    );
    expect(bronAfbeelding(a, "media:0")?.bytes).toEqual(new Uint8Array([1]));
    for (const t of [
      "https://example.com/a.png",
      "rId1",
      "media:00",
      "media:-1",
      "media:1",
      "media:1e0",
    ])
      expect(bronAfbeelding(a, t)).toBeNull();
  });
  it("laat transcodes aan de native lezer en weigert beschadigde of ontbrekende bronnen", () => {
    const bron = zipSync({
      "word/media/a.svg": strToU8("<svg/>"),
      "word/media/b.emf": new Uint8Array([1]),
    });
    expect(bronAfbeelding(bron, "media:0")).toBeNull();
    expect(bronAfbeelding(bron, "media:1")).toBeNull();
    expect(bronAfbeelding(new Uint8Array([1, 2]), "media:0")).toBeNull();
    expect(bronAfbeelding(null, "media:0")).toBeNull();
  });
  it("bewaakt de exacte native media-aansluiting", () => {
    const bron = readFileSync(
      "node_modules/@betteroffice/docx-react/dist/index.mjs",
      "utf8",
    );
    const uit = herstelVormAfbeeldingen(bron);
    expect(uit).toContain("e?.mediaSource?.(t)??oosBronAfbeelding(n,t)");
    expect(() =>
      herstelVormAfbeeldingen(bron.replace("he=nS($)", "he=anders($)")),
    ).toThrow();
    expect(() => herstelVormAfbeeldingen(bron + bron)).toThrow();
  });
});
