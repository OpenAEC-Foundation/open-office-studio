/** Query the pinned current WASM; never opens or changes a document/session. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { hash } from "./contract.mjs";

export async function queryAtomicFieldEndProjection(bytes) {
  const frame = JSON.parse(bytes);
  const field = frame.pages.flatMap(page => page.primitives)
    .find(run => run.text === "Report Title" && run.field?.instruction === "DOCVARIABLE Report");
  assert(field); assert.equal(field.docEnd - field.docStart, 1);
  const wasm = await readFile("vendor/tekstengine/docx_layout_bg.wasm");
  assert.equal(hash(wasm), "c5a59ce0d980cd7f85775aaf283bcac1c19fba976b47bbe08c0387e2ca7d2569");
  const layout = await import(pathToFileURL(resolve("node_modules/@betteroffice/docx/dist/wasm-layout.mjs")));
  await layout.preloadLayoutWasm(wasm);
  const forward = JSON.parse(layout.rangeRectsJson(bytes.toString("utf8"), field.docEnd, field.docEnd + 1));
  const backward = JSON.parse(layout.rangeRectsJson(bytes.toString("utf8"), field.docEnd - 1, field.docEnd));
  assert.equal(forward.length, 0); assert.equal(backward.length, 1);
  return {
    kind: "Read-only immutable-display geometry evidence; no keyboard or native acceptance pass",
    inputSha256: hash(bytes), wasmSha256: hash(wasm), field,
    forwardAtFieldEnd: forward, backwardFullAtomicField: backward,
    semanticFieldEnd: field.docEnd, fullPaintAdvanceEnd: field.x + field.width,
    queriedCaretEdge: backward[0].x + backward[0].width,
    sourceFormulaFirstCollapsedStop: field.x + field.width / field.text.length,
  };
}
