import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { Pakket } from "../../grafieken/pakket";
import { leesNootInstellingen, voegNootIn } from "./noten";

it("reads omitted endnote numbering as ISO decimal and explicitly writes the preferred format for new endnotes", () => {
  const z = new Pakket(readFileSync("public/templates/nieuw.docx"));
  expect(leesNootInstellingen(z.inpakken(), "eindnoot").notatie).toBe(
    "decimal",
  );
  z.schrijf(
    "word/document.xml",
    z
      .lees("word/document.xml")
      .replace(
        /<w:body>/,
        "<w:body><w:p><w:r><w:t>ENDNOTE_MARKER</w:t></w:r></w:p>",
      ),
  );
  const out = voegNootIn(
    z.inpakken(),
    "ENDNOTE_MARKER",
    "eindnoot",
    "A new note",
  ).bytes;
  expect(leesNootInstellingen(out, "eindnoot").notatie).toBe("lowerRoman");
  expect(new Pakket(out).lees("word/settings.xml")).toContain(
    'w:numFmt w:val="lowerRoman"',
  );
});
