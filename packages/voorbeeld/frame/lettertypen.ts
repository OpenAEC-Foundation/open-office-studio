import * as fonts from "@betteroffice/fonts";
import type { PptxFontFace } from "@betteroffice/pptx";
import { strFromU8, unzipSync } from "fflate";

/** Alleen gebundelde bestanden; geen systeemlettertypen of externe fontdienst. */
export async function lettertypen(
  bytes: Uint8Array,
  metBytes: boolean,
): Promise<PptxFontFace[]> {
  const namen = new Set(["Calibri"]);
  let omvang = 0;
  const delen = unzipSync(bytes, {
    filter: (deel) => {
      if (
        !/^(xl\/styles\.xml|ppt\/(slides\/slide\d+|slideLayouts\/slideLayout\d+|slideMasters\/slideMaster\d+|theme\/theme\d+)\.xml)$/.test(
          deel.name,
        )
      )
        return false;
      omvang += deel.originalSize;
      if (omvang > 32 * 1024 * 1024)
        throw new Error("Te veel lettertypemetadata voor een voorbeeld.");
      return true;
    },
  });
  for (const inhoud of Object.values(delen)) {
    const xml = new DOMParser().parseFromString(
      strFromU8(inhoud),
      "application/xml",
    );
    for (const element of xml.getElementsByTagName("*")) {
      const naam =
        element.localName === "latin"
          ? element.getAttribute("typeface")
          : element.localName === "name"
            ? element.getAttribute("val")
            : null;
      if (
        naam &&
        naam.length <= 100 &&
        !naam.startsWith("+") &&
        namen.size < 24
      )
        namen.add(naam);
    }
  }
  const uit: PptxFontFace[] = [];
  await Promise.all(
    [...namen].map(async (family) => {
      for (const [bold, italic] of [
        [false, false],
        [true, false],
        [false, true],
        [true, true],
      ]) {
        const face =
          fonts.resolveBundledFamilyFace(family, bold, italic) ??
          fonts.resolveMetricCompatFace(family, bold, italic) ??
          fonts.resolveBundledFamilyFace("Carlito", bold, italic);
        if (!face)
          throw new Error("Geen gebundeld terugvallettertype beschikbaar.");
        await fonts.registerBundledFontFace(face, family);
        if (metBytes)
          uit.push({
            family,
            bold,
            italic,
            bytes: new Uint8Array(await fonts.loadBundledFontBytes(face)),
          });
      }
    }),
  );
  return uit;
}
