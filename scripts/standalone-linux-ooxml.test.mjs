import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { syntheticDocument, savedDocument } from "./standalone-linux-ooxml.mjs";

const marker = "SYNTHETIC_SAVED_MARKER";
test("Writer oracle requires exactly one typed marker and retained original text", async () => {
  const parts = unzipSync(
    syntheticDocument("writer", await readFile("public/templates/nieuw.docx")),
  );
  assert.equal(savedDocument("writer", zipSync(parts), marker), false);
  const xml = strFromU8(parts["word/document.xml"]);
  parts["word/document.xml"] = strToU8(
    xml.replace("Original synthetic", `${marker} Original synthetic`),
  );
  assert.equal(savedDocument("writer", zipSync(parts), marker), true);
  parts["word/document.xml"] = strToU8(
    xml.replace("Original synthetic", `${marker} ${marker} Original synthetic`),
  );
  assert.equal(savedDocument("writer", zipSync(parts), marker), false);
});

test("Spreadsheet oracle rejects correct values in the wrong cells or missing formulas", async () => {
  const parts = unzipSync(
    syntheticDocument(
      "spreadsheet",
      await readFile("public/templates/nieuw.xlsx"),
    ),
  );
  const path = "xl/worksheets/sheet1.xml",
    xml = strFromU8(parts[path]);
  assert.equal(savedDocument("spreadsheet", zipSync(parts), marker), false);
  const edited = xml
    .replace("<v>4</v>", "<v>9</v>")
    .replace("</row>", '<c r="C1"><f>A1+B1</f><v>36</v></c></row>');
  parts[path] = strToU8(edited);
  assert.equal(savedDocument("spreadsheet", zipSync(parts), marker), true);
  parts[path] = strToU8(edited.replace('r="A1"', 'r="D1"'));
  assert.equal(savedDocument("spreadsheet", zipSync(parts), marker), false);
});

test("Presentation oracle requires saved text and a real second slide relationship", async () => {
  const parts = unzipSync(
    syntheticDocument(
      "presentation",
      await readFile("public/templates/nieuw.pptx"),
    ),
  );
  const path = "ppt/slides/slide1.xml";
  assert.equal(savedDocument("presentation", zipSync(parts), marker), false);
  parts[path] = strToU8(
    strFromU8(parts[path]).replace("Original synthetic slide", marker),
  );
  assert.equal(savedDocument("presentation", zipSync(parts), marker), false);
  parts["ppt/slides/slide2.xml"] = parts[path];
  parts["ppt/presentation.xml"] = strToU8(
    strFromU8(parts["ppt/presentation.xml"]).replace(
      "</p:sldIdLst>",
      '<p:sldId id="257" r:id="synthetic-slide2"/></p:sldIdLst>',
    ),
  );
  assert.equal(savedDocument("presentation", zipSync(parts), marker), true);
});
