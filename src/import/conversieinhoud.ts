import { strFromU8, unzipSync } from "fflate";
import type { Soort } from "../editors";

/**
 * Call only after controleerPakket has enforced the ZIP size/path limits.
 * A conservative warning for a converter's empty Writer/Impress result:
 * absence of text alone is insufficient (images, tables and shapes count).
 * Spreadsheet XML is deliberately not inflated again to scan large cell data.
 */
export function conversieZonderInhoud(
  bytes: Uint8Array,
  soort: Soort,
): boolean {
  if (soort === "xlsx") return false;
  let media = false;
  const delen = unzipSync(bytes, {
    filter: (f) => {
      if (/^(word|ppt)\/media\//.test(f.name)) media = true;
      return soort === "docx"
        ? /^word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml$/.test(
            f.name,
          )
        : /^ppt\/slides\/slide\d+\.xml$/.test(f.name);
    },
  });
  if (media) return false;
  for (const bytes of Object.values(delen)) {
    const xml = strFromU8(bytes).replace(/<!--[\s\S]*?-->/g, "");
    // Entity-encoded characters are still non-empty text; no XML is executed.
    for (const tekst of xml.matchAll(
      /<(?:[\w.-]+:)?t\b[^>]*>([^<]*)<\/(?:[\w.-]+:)?t>/g,
    ))
      if (tekst[1].trim()) return false;
    const elementen =
      soort === "docx"
        ? "drawing|pict|object|tbl|oMath|oMathPara|altChunk|fldChar|fldSimple"
        : "sp|pic|graphicFrame|cxnSp|grpSp";
    if (new RegExp(`<(?:[\\w.-]+:)?(?:${elementen})(?=[\\s/>])`).test(xml))
      return false;
  }
  return true;
}
