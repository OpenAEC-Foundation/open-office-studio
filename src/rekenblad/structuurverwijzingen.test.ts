import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  openWorkbook,
  type WorkbookHandle,
  type XlsxCellValue,
} from "@betteroffice/xlsx";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const books: WorkbookHandle[] = [];
afterEach(() => books.splice(0).forEach((book) => book.dispose()));
type Axis = "Rows" | "Cols";
const axes: Axis[] = ["Rows", "Cols"];
function book(source = "Bron") {
  const h = openWorkbook(
    new Uint8Array(readFileSync("public/templates/nieuw.xlsx")),
  );
  books.push(h);
  h.applyOps([
    { type: "renameSheet", sheet: 0, name: source },
    { type: "addSheet", index: 1, name: "Observer" },
  ]);
  return h;
}
function seed(h: WorkbookHandle, axis: Axis, formula: string, alias = false) {
  h.applyOps([
    {
      type: "setDefinedName",
      name: "GlobalBlock",
      refers_to: formula,
      scope: null,
    },
    {
      type: "setDefinedName",
      name: "LocalBlock",
      refers_to: formula,
      scope: 0,
    },
    ...(alias
      ? [
          {
            type: "setDefinedName",
            name: "AliasBlock",
            refers_to: "GlobalBlock",
            scope: null,
          },
          {
            type: "setDefinedName",
            name: "AliasLocal",
            refers_to: "LocalBlock",
            scope: 0,
          },
        ]
      : []),
  ]);
  h.editCells(0, [
    ...[1, 2, 3, 4].map((n, i) => ({
      row: axis === "Rows" ? i : 0,
      col: axis === "Cols" ? i : 0,
      input: String(n),
    })),
    { row: 99, col: 25, input: `=SUM(${alias ? "AliasLocal" : "LocalBlock"})` },
  ]);
  h.editCells(1, [
    { row: 0, col: 0, input: `=SUM(${alias ? "AliasBlock" : "GlobalBlock"})` },
    { row: 1, col: 0, input: `=SUM(${formula})` },
  ]);
}
function snapshot(h: WorkbookHandle, row = 99, col = 25) {
  const read = h.readCells({
    ranges: [
      {
        sheetId: h.sheetInfo().sheetIds[1],
        range: { kind: "a1", a1: "A1:A2" },
      },
      {
        sheetId: h.sheetInfo().sheetIds[0],
        range: { kind: "rowCol", start: { row, col }, end: { row, col } },
      },
    ],
  });
  if (!read.ok) throw new Error(read.failure.message);
  return {
    names: h.listDefinedNames().items,
    cells: read.ranges.flatMap((range) => range.cells.flat()),
  };
}
function values(
  state: ReturnType<typeof snapshot>,
  expected: number | "error",
) {
  const value: XlsxCellValue =
    expected === "error"
      ? { kind: "error", value: "#REF!" }
      : { kind: "number", value: expected };
  expect(state.cells.map((cell) => cell.value)).toEqual([value, value, value]);
}
function roundtrip(
  h: WorkbookHandle,
  axis: Axis,
  after: ReturnType<typeof snapshot>,
  delta: number,
) {
  const reopened = openWorkbook(h.save());
  books.push(reopened);
  expect(
    snapshot(
      reopened,
      99 + (axis === "Rows" ? delta : 0),
      25 + (axis === "Cols" ? delta : 0),
    ),
  ).toEqual(after);
}
function range(axis: Axis, first: number, last: number) {
  return axis === "Rows"
    ? `$A$${first + 1}:$A$${last + 1}`
    : `$${String.fromCharCode(65 + first)}$1:$${String.fromCharCode(65 + last)}$1`;
}

describe.each(axes)("structural formula/name remapping: %s (#60)", (axis) => {
  it.each([
    {
      name: "insert before",
      action: "insert",
      at: 0,
      count: 1,
      first: 0,
      last: 2,
      expected: 6,
      mapped: [1, 3],
    },
    {
      name: "insert inside",
      action: "insert",
      at: 1,
      count: 1,
      first: 0,
      last: 2,
      expected: 6,
      mapped: [0, 3],
    },
    {
      name: "insert after",
      action: "insert",
      at: 3,
      count: 1,
      first: 0,
      last: 2,
      expected: 6,
      mapped: [0, 2],
    },
    {
      name: "delete first",
      action: "delete",
      at: 0,
      count: 1,
      first: 0,
      last: 2,
      expected: 5,
      mapped: [0, 1],
    },
    {
      name: "delete inside",
      action: "delete",
      at: 1,
      count: 1,
      first: 0,
      last: 2,
      expected: 4,
      mapped: [0, 1],
    },
    {
      name: "delete last",
      action: "delete",
      at: 2,
      count: 1,
      first: 0,
      last: 2,
      expected: 3,
      mapped: [0, 1],
    },
    {
      name: "delete before",
      action: "delete",
      at: 0,
      count: 1,
      first: 1,
      last: 3,
      expected: 9,
      mapped: [0, 2],
    },
    {
      name: "delete all",
      action: "delete",
      at: 0,
      count: 3,
      first: 0,
      last: 2,
      expected: "error",
      mapped: null,
    },
  ] as const)(
    "$name retains global/local bindings, formulas, save and Undo/Redo",
    (c) => {
      const h = book();
      seed(h, axis, `'Bron'!${range(axis, c.first, c.last)}`);
      const before = snapshot(h),
        delta = c.action === "insert" ? c.count : -c.count;
      values(before, c.first === 1 ? 9 : 6);
      h.applyOps([
        { type: c.action + axis, sheet: 0, at: c.at, count: c.count },
      ]);
      const read = () =>
        snapshot(
          h,
          99 + (axis === "Rows" ? delta : 0),
          25 + (axis === "Cols" ? delta : 0),
        );
      const after = read();
      values(after, c.expected);
      const names = after.names.filter((name) =>
        ["GlobalBlock", "LocalBlock"].includes(name.name),
      );
      expect(names).toHaveLength(2);
      for (const name of names)
        expect(name.refersTo.replace(/^'Bron'!/, "Bron!")).toBe(
          c.mapped ? `Bron!${range(axis, c.mapped[0], c.mapped[1])}` : "#REF!",
        );
      roundtrip(h, axis, after, delta);
      h.undo();
      expect(snapshot(h)).toEqual(before);
      h.redo();
      expect(read()).toEqual(after);
    },
  );

  it.each([
    "case_upper",
    "case_lower",
    "escaped_sheet",
    "cross_sheet_expression",
    "alias_chain",
    "whole_axis",
    "offset_fixed_size",
    "index_fixed_position",
    "sum_expression",
  ])(
    "insertion preserves the independently expected meaning of %s",
    (variant) => {
      const source = variant === "escaped_sheet" ? "Bron ' Één" : "Bron",
        prefix = `'${source.replaceAll("'", "''")}'!`,
        whole = axis === "Rows" ? "$A:$A" : "$1:$1";
      let formula = prefix + range(axis, 0, 2),
        expectedBefore = 6,
        expectedAfter = 6;
      if (variant === "case_upper") formula = formula.replace("Bron", "BRON");
      if (variant === "case_lower") formula = formula.replace("Bron", "bron");
      if (variant === "cross_sheet_expression") {
        formula = `SUM(${formula})+SUM('Other'!${range(axis, 0, 2)})`;
        expectedBefore = expectedAfter = 66;
      }
      if (variant === "whole_axis") {
        formula = prefix + whole;
        expectedBefore = expectedAfter = 10;
      }
      if (variant === "offset_fixed_size") {
        formula = `OFFSET(${prefix}$A$1,0,0,${axis === "Rows" ? 3 : 1},${axis === "Cols" ? 3 : 1})`;
        expectedAfter = 3;
      }
      if (variant === "index_fixed_position") {
        formula = `INDEX(${prefix + whole},${axis === "Rows" ? 3 : 1}${axis === "Cols" ? ",3" : ""})`;
        expectedBefore = 3;
        expectedAfter = 2;
      }
      if (variant === "sum_expression") formula = `SUM(${formula})`;
      const h = book(source);
      h.applyOps([{ type: "addSheet", index: 2, name: "Other" }]);
      h.editCells(
        2,
        [10, 20, 30, 400].map((n, i) => ({
          row: axis === "Rows" ? i : 0,
          col: axis === "Cols" ? i : 0,
          input: String(n),
        })),
      );
      seed(h, axis, formula, variant === "alias_chain");
      const before = snapshot(h);
      values(before, expectedBefore);
      h.applyOps([{ type: "insert" + axis, sheet: 0, at: 1, count: 1 }]);
      const after = snapshot(
        h,
        axis === "Rows" ? 100 : 99,
        axis === "Cols" ? 26 : 25,
      );
      values(after, expectedAfter);
      roundtrip(h, axis, after, 1);
      h.undo();
      expect(snapshot(h)).toEqual(before);
      h.redo();
      expect(
        snapshot(h, axis === "Rows" ? 100 : 99, axis === "Cols" ? 26 : 25),
      ).toEqual(after);
    },
  );

  it.each([false, true])(
    "remaps imported disjoint areas, parenthesized=%s",
    (grouped) => {
      const original = book();
      seed(original, axis, "'Bron'!$A$1");
      const parts = unzipSync(original.save()),
        area = "'Bron'!$A$1,'Bron'!" + (axis === "Rows" ? "$A$3" : "$C$1"),
        formula = grouped ? `(${area})` : area;
      parts["xl/workbook.xml"] = strToU8(
        strFromU8(parts["xl/workbook.xml"]).replace(
          /(<definedName\b[^>]*name="(?:GlobalBlock|LocalBlock)"[^>]*>)[\s\S]*?(<\/definedName>)/g,
          (_match, start, end) => start + formula + end,
        ),
      );
      const h = openWorkbook(zipSync(parts));
      books.push(h);
      const names = () =>
        h
          .listDefinedNames()
          .items.filter((name) =>
            ["GlobalBlock", "LocalBlock"].includes(name.name),
          );
      const before = names();
      h.applyOps([{ type: "insert" + axis, sheet: 0, at: 1, count: 1 }]);
      const after = names(),
        expected = "Bron!$A$1,Bron!" + (axis === "Rows" ? "$A$4" : "$D$1");
      expect(after).toHaveLength(2);
      for (const name of after)
        expect(name.refersTo.replaceAll("'Bron'!", "Bron!")).toBe(
          grouped ? `(${expected})` : expected,
        );
      const reopened = openWorkbook(h.save());
      books.push(reopened);
      expect(
        reopened
          .listDefinedNames()
          .items.filter((name) =>
            ["GlobalBlock", "LocalBlock"].includes(name.name),
          ),
      ).toEqual(after);
      h.undo();
      expect(names()).toEqual(before);
      h.redo();
      expect(names()).toEqual(after);
    },
  );
});
