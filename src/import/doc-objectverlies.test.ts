import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { uitvoerformaat } from "../formaten";
import { verliesrapport } from "../export/bewaar";

const metObject = zipSync({
  "word/document.xml": strToU8("<document/>"),
  "word/embeddings/oleObject1.pptx": new Uint8Array([1, 2, 3]),
});
const zonderObject = zipSync({
  "word/document.xml": strToU8("<document/>"),
});

describe("waarschuwing voor bewerkbare objecten bij DOC-export (#34)", () => {
  it("meldt het gemeten objectverlies naast de algemene oude-formaatwaarschuwing", () => {
    const rapport = verliesrapport(
      metObject,
      "docx",
      uitvoerformaat("docx", "doc")!,
      "runtime",
    )!;
    const object = rapport.regels.find(
      (r) => r.onderdeel === "Ingebedde objecten",
    );
    expect(object).toBeDefined();
    expect(object!.gevolg).toContain("verloren");
    expect(object!.gevolg).toContain("origineel blijft ongewijzigd");
    expect(rapport.regels.map((r) => r.onderdeel)).toContain(
      "Ouder binair formaat",
    );
  });

  it("meldt geen objectverlies als het document geen object bevat", () => {
    const rapport = verliesrapport(
      zonderObject,
      "docx",
      uitvoerformaat("docx", "doc")!,
      "runtime",
    )!;
    expect(rapport.regels.map((r) => r.onderdeel)).toEqual([
      "Ouder binair formaat",
    ]);
  });

  it("behoudt de DOCX-opslagroute zonder waarschuwing voor dit gemeten conversieverlies", () => {
    expect(
      verliesrapport(
        metObject,
        "docx",
        uitvoerformaat("docx", "docx")!,
        "engine",
      ),
    ).toBeNull();
  });

  it("past de DOC-meting niet toe op ODT", () => {
    expect(
      verliesrapport(
        metObject,
        "docx",
        uitvoerformaat("docx", "odt")!,
        "runtime",
      ),
    ).toBeNull();
  });
});
