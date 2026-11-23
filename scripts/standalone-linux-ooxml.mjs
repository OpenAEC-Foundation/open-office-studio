/** Fixture construction and file-level oracles independent of the app editors. */
import assert from "node:assert/strict";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";

export function syntheticDocument(app, template) {
  const parts = unzipSync(template);
  if (app === "writer") {
    const path = "word/document.xml",
      xml = strFromU8(parts[path]);
    const next = xml.replace(
      /(<w:body>)[\s\S]*?(<w:sectPr)/,
      "$1<w:p><w:r><w:t>Original synthetic Writer text.</w:t></w:r></w:p>$2",
    );
    assert.notEqual(next, xml);
    parts[path] = strToU8(next);
  } else if (app === "spreadsheet") {
    const path = "xl/worksheets/sheet1.xml",
      xml = strFromU8(parts[path]);
    const next = xml.replace(
      /<sheetData\s*\/>|<sheetData>[\s\S]*?<\/sheetData>/,
      '<sheetData><row r="1"><c r="A1"><v>4</v></c><c r="B1"><f>A1*3</f><v>12</v></c></row></sheetData>',
    );
    assert.notEqual(next, xml);
    parts[path] = strToU8(next);
  } else if (app === "presentation") {
    const path = "ppt/slides/slide1.xml",
      xml = strFromU8(parts[path]);
    const next = xml.includes("<a:t>")
      ? xml.replace(
          /<a:t>[\s\S]*?<\/a:t>/,
          "<a:t>Original synthetic slide</a:t>",
        )
      : xml.replace(
          /<a:p\s*\/>/,
          '<a:p><a:r><a:rPr lang="en-US"/><a:t>Original synthetic slide</a:t></a:r></a:p>',
        );
    assert.ok(next.includes("Original synthetic slide"));
    parts[path] = strToU8(next);
  } else throw new Error(`Unknown document app ${app}`);
  return zipSync(parts);
}

export function savedDocument(app, bytes, marker) {
  const parts = unzipSync(bytes);
  if (app === "writer") {
    const xml = strFromU8(parts["word/document.xml"]);
    return (
      xml.includes("Original synthetic Writer text.") &&
      xml.split(marker).length === 2
    );
  }
  if (app === "spreadsheet") {
    const xml = strFromU8(parts["xl/worksheets/sheet1.xml"]);
    const cell = (address) =>
      new RegExp(`<c\\b[^>]*\\br="${address}"[^>]*>([\\s\\S]*?)<\\/c>`).exec(
        xml,
      )?.[1] || "";
    return (
      /<v>9<\/v>/.test(cell("A1")) &&
      /<f(?:\s[^>]*)?>A1\*3<\/f>/.test(cell("B1")) &&
      /<f(?:\s[^>]*)?>A1\+B1<\/f>/.test(cell("C1"))
    );
  }
  if (app === "presentation") {
    const slides = Object.keys(parts).filter((p) =>
      /^ppt\/slides\/slide\d+\.xml$/.test(p),
    );
    const presentation = strFromU8(parts["ppt/presentation.xml"]);
    return (
      slides.length === 2 &&
      (presentation.match(/<p:sldId\b/g) || []).length === 2 &&
      slides.some((p) => strFromU8(parts[p]).includes(marker))
    );
  }
  throw new Error(`Unknown document app ${app}`);
}
