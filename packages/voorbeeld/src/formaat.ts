import { strFromU8, unzipSync } from "fflate";
import type { Kantoorformaat } from "./types";

export type Herkend =
  | { soort: "kantoor"; formaat: Kantoorformaat }
  | { soort: "conversie" }
  | { soort: "onbekend" };
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/** Herken inhoud vóór een engine wordt geladen; de bestandsnaam is geen bewijs van het formaat. */
export function herkenKantoor(bytes: Uint8Array): Herkend {
  if (OLE.every((b, i) => bytes[i] === b)) return { soort: "conversie" };
  if (strFromU8(bytes.subarray(0, 5)) === "{\\rtf")
    return { soort: "conversie" };
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return { soort: "onbekend" };
  const namen = new Set<string>();
  let omvang = 0,
    aantal = 0;
  // Alleen de kleine ODF-mimetype wordt uitgepakt; documentinhoud blijft voor de gekozen engine.
  const delen = unzipSync(bytes, {
    filter: (deel) => {
      omvang += deel.originalSize;
      if (++aantal > 20_000 || omvang > 256 * 1024 * 1024)
        throw new Error(
          "Het uitgepakte document is te groot voor een voorbeeld.",
        );
      if (
        [
          "word/document.xml",
          "xl/workbook.xml",
          "ppt/presentation.xml",
          "[Content_Types].xml",
        ].includes(deel.name)
      )
        namen.add(deel.name);
      return deel.name === "mimetype" && deel.originalSize <= 256;
    },
  });
  const mime = delen.mimetype ? strFromU8(delen.mimetype).trim() : "";
  if (mime.startsWith("application/vnd.oasis.opendocument."))
    return { soort: "conversie" };
  const gevonden = (
    [
      ["word/document.xml", "docx"],
      ["xl/workbook.xml", "xlsx"],
      ["ppt/presentation.xml", "pptx"],
    ] as const
  ).filter(([pad]) => namen.has(pad));
  if (gevonden.length !== 1 || !namen.has("[Content_Types].xml"))
    return { soort: "onbekend" };
  return { soort: "kantoor", formaat: gevonden[0][1] };
}
