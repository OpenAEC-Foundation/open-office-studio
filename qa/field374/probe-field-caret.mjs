/** Read-only P4 geometry query over a retained, immutable SDK display list. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { hash } from "./contract.mjs";
import { queryAtomicFieldEndProjection } from "./field-caret-projection.mjs";

const [input, output] = process.argv.slice(2);
assert(input && output, "Usage: node probe-field-caret.mjs RETAINED_DISPLAY.json OUTPUT.json");
const bytes = await readFile(input);
const projection = await queryAtomicFieldEndProjection(bytes);
assert.equal(hash(await readFile(input)), hash(bytes));
const report = {
  ...projection,
  originalInputUnchanged: true,
};
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
