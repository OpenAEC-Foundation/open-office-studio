import { describe, expect, it } from "vitest";
import { frameAdres } from "./protocol";
import { herkenKantoor } from "./formaat";
import { strToU8, zipSync } from "fflate";

const pakket = (namen: string[]) =>
  zipSync(Object.fromEntries(namen.map((n) => [n, strToU8("<proef/>")])));
describe("zelfstandige alleen-lezen voorbeelden", () => {
  it("houdt de renderer bij dezelfde webapp en diens submap", () => {
    expect(
      frameAdres(
        "./openaec-voorbeeld/",
        "https://proef.invalid/y/mail",
        "eigen-sessie",
      ).href,
    ).toBe(
      "https://proef.invalid/y/openaec-voorbeeld/frame/index.html#sessie=eigen-sessie",
    );
    expect(() =>
      frameAdres(
        "https://anders.invalid/assets/",
        "https://proef.invalid/y/",
        "s",
      ),
    ).toThrow(/dezelfde oorsprong/);
    expect(() =>
      frameAdres(
        "http://proef.invalid/assets/",
        "https://proef.invalid/y/",
        "s",
      ),
    ).toThrow(/dezelfde oorsprong/);
  });
  it("houdt ook een Tauri-renderer bij dezelfde protocolhost", () => {
    expect(
      frameAdres("/voorbeeld/", "tauri://localhost/index.html", "s").href,
    ).toBe("tauri://localhost/voorbeeld/frame/index.html#sessie=s");
    expect(() =>
      frameAdres("tauri://ander/", "tauri://localhost/index.html", "s"),
    ).toThrow(/dezelfde oorsprong/);
  });
  for (const [pad, formaat] of [
    ["word/document.xml", "docx"],
    ["xl/workbook.xml", "xlsx"],
    ["ppt/presentation.xml", "pptx"],
  ]) {
    it(`herkent echte pakketonderdelen voor ${formaat} zonder op een extensie te vertrouwen`, () => {
      expect(herkenKantoor(pakket(["[Content_Types].xml", pad]))).toEqual({
        soort: "kantoor",
        formaat,
      });
    });
  }
  it("weigert een dubbelzinnig of onvolledig pakket", () => {
    expect(
      herkenKantoor(
        pakket(["[Content_Types].xml", "word/document.xml", "xl/workbook.xml"]),
      ),
    ).toEqual({ soort: "onbekend" });
    expect(herkenKantoor(pakket(["word/document.xml"]))).toEqual({
      soort: "onbekend",
    });
  });
  it("houdt oude en OpenDocument-formaten buiten de moderne engines", () => {
    expect(
      herkenKantoor(
        new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      ),
    ).toEqual({ soort: "conversie" });
    expect(
      herkenKantoor(
        zipSync({
          mimetype: strToU8("application/vnd.oasis.opendocument.text"),
        }),
      ),
    ).toEqual({ soort: "conversie" });
    expect(herkenKantoor(strToU8("geen kantoorbestand"))).toEqual({
      soort: "onbekend",
    });
    expect(herkenKantoor(strToU8("{\\rtf1 een oud tekstdocument}"))).toEqual({
      soort: "conversie",
    });
  });
  it("weigert een uitpakbom vóór een engine of documentinhoud wordt geladen", () => {
    const bytes = pakket(["[Content_Types].xml", "word/document.xml"]);
    const view = new DataView(bytes.buffer);
    // ZIP central-directory originalSize; er wordt geen grote inhoud aangemaakt.
    for (let i = 0; i < bytes.length - 46; i++) {
      if (view.getUint32(i, true) === 0x02014b50) {
        view.setUint32(i + 24, 300 * 1024 * 1024, true);
        break;
      }
    }
    expect(() => herkenKantoor(bytes)).toThrow(
      /uitgepakte document is te groot/,
    );
  });
});
