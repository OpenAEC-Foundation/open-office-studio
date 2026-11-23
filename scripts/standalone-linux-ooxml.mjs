/** Fixture construction and file-level oracles independent of the app editors. */
import assert from "node:assert/strict";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { DOMParser } from "@xmldom/xmldom";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const X = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const nodes = (doc, ns, local) =>
  Array.from(doc.getElementsByTagNameNS(ns, local));
function documentPart(parts, path) {
  assert.ok(parts[path], `Missing XML part ${path}`);
  return new DOMParser().parseFromString(
    strFromU8(parts[path]),
    "application/xml",
  );
}

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
    const xml = nodes(documentPart(parts, "word/document.xml"), W, "t")
      .map((n) => n.textContent)
      .join("");
    return (
      xml.includes("Original synthetic Writer text.") &&
      xml.split(marker).length === 2
    );
  }
  if (app === "spreadsheet") {
    const cells = nodes(
      documentPart(parts, "xl/worksheets/sheet1.xml"),
      X,
      "c",
    );
    const value = (address, field) => {
      const cell = cells.find((c) => c.getAttribute("r") === address);
      return cell ? nodes(cell, X, field)[0]?.textContent : undefined;
    };
    const numeric = (address) => {
      const cell = cells.find((c) => c.getAttribute("r") === address);
      return cell && [null, "", "n"].includes(cell.getAttribute("t"));
    };
    return (
      ["A1", "B1", "C1"].every(numeric) &&
      value("A1", "v") === "9" &&
      value("B1", "f") === "A1*3" &&
      value("C1", "f") === "A1+B1" &&
      value("B1", "v") !== undefined &&
      Number(value("B1", "v")) === 27 &&
      value("C1", "v") !== undefined &&
      Number(value("C1", "v")) === 36
    );
  }
  if (app === "presentation") {
    const slides = Object.keys(parts).filter((p) =>
      /^ppt\/slides\/slide\d+\.xml$/.test(p),
    );
    const slideIds = nodes(
      documentPart(parts, "ppt/presentation.xml"),
      P,
      "sldId",
    );
    const rels = nodes(
      documentPart(parts, "ppt/_rels/presentation.xml.rels"),
      "http://schemas.openxmlformats.org/package/2006/relationships",
      "Relationship",
    );
    return (
      slides.length === 2 &&
      slideIds.length === 2 &&
      slideIds.every((id) => {
        const rel = rels.find(
          (r) => r.getAttribute("Id") === id.getAttributeNS(R, "id"),
        );
        return rel && parts[`ppt/${rel.getAttribute("Target")}`];
      }) &&
      slides.some((p) =>
        nodes(documentPart(parts, p), A, "t")
          .map((n) => n.textContent)
          .join("")
          .includes(marker),
      )
    );
  }
  throw new Error(`Unknown document app ${app}`);
}
