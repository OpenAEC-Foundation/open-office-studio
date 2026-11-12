import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { controleerPakket } from "../pakketcontrole";
import { openRapport, opslagRapport } from "./rapport";
import { uitvoerformaat } from "../formaten";

const gevallen = [
  ["docx", "word/header1.xml", "odt"],
  ["docx", "word/footer1.xml", "odt"],
  ["docx", "word/styles.xml", "odt"],
  ["xlsx", "xl/workbook.xml", "ods"],
  ["xlsx", "xl/worksheets/sheet1.xml", "ods"],
  ["xlsx", "xl/styles.xml", "ods"],
  ["pptx", "ppt/notesSlides/notesSlide1.xml", "odp"],
  ["pptx", "ppt/slideMasters/slideMaster1.xml", "odp"],
] as const;

describe("onbekende XML buiten de hoofdtekst melden (#40)", () => {
  it.each(gevallen)(
    "meldt %s %s bij openen en converteren naar %s",
    (soort, deel, ext) => {
      const hoofddeel = {
        docx: "word/document.xml",
        xlsx: "xl/workbook.xml",
        pptx: "ppt/presentation.xml",
      }[soort];
      const bytes = zipSync({
        [hoofddeel]: strToU8("<root/>"),
        [deel]: strToU8(
          '<root xmlns:v="urn:voorbeeld:uitbreiding"><v:inhoud/></root>',
        ),
      });
      const origineel = bytes.slice();
      const { risicos } = controleerPakket(bytes, soort);
      expect(risicos).toContain("onbekende_extensies");
      expect(
        openRapport({ soort, risicos, route: "engine", bronformaat: soort }),
      ).not.toBeNull();
      expect(
        opslagRapport({
          soort,
          risicos,
          route: "runtime",
          formaat: uitvoerformaat(soort, ext)!,
        }),
      ).not.toBeNull();
      expect(bytes).toEqual(origineel);
    },
  );
  it("verwisselt commentaar, CDATA, media en gewone naamruimten niet met extensies", () => {
    const bytes = zipSync({
      "xl/workbook.xml": strToU8("<workbook/>"),
      "xl/worksheets/sheet1.xml": strToU8(
        `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><!-- <x xmlns:v="urn:voorbeeld"/> --><![CDATA[<x xmlns:v="urn:voorbeeld"/>]]></worksheet>`,
      ),
      "xl/media/afbeelding.svg": strToU8('<svg xmlns="urn:voorbeeld"/>'),
    });
    expect(controleerPakket(bytes, "xlsx").risicos).not.toContain(
      "onbekende_extensies",
    );
  });
});
