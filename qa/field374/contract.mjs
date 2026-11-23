/** Shared source-preservation oracle for the SDK and actual browser regressions. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { DOMParser } from "@xmldom/xmldom";

export const MARKER = " -- STW30 EDIT 2026-11-23";
export const hash = value => createHash("sha256").update(value).digest("hex");
export const dataRoot = fileURLToPath(new URL("./", import.meta.url));
const python = process.env.OOS_FIELD_PYTHON || (process.platform === "win32" ? "python" : "python3");
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
export async function fixture(name) {
  const bytes = await readFile(join(dataRoot, name));
  const pins = { "source.stw": "5a5b633ee371836a48c7496fc35ae261f35025d7edb3ec74439c5f58b369f1e2",
    "converted.docx": "b29d6adc44aec4ee64d25555f0aa5560afb0ad24973f2b491789b6bb08e7c992",
    "windows-resaved.docx": "4dcb51f93bd88f3d4bd3a9956f53cff23613235fe222632734b8090f9ea18310" };
  assert.equal(hash(bytes), pins[name], `Original immutable fixture ${name}`); return bytes;
}
export async function prepareOracle(root) {
  await fixture("source.stw");
  const output = join(root, "source-oracle.json");
  execFileSync(python, ["-B", join(dataRoot, "oracle.py"), "source", join(dataRoot, "source.stw"), "--report", output], { timeout: 20000 });
  return output;
}
export async function auditDocx(bytes, root, name, sourceOracle, marker) {
  const path = join(root, name + ".docx"), report = join(root, name + "-oracle.json");
  await writeFile(path, bytes);
  execFileSync(python, ["-B", join(dataRoot, "oracle.py"), "audit", path, "--oracle", sourceOracle, "--marker", marker, "--report", report], { timeout: 20000 });
  const zip = unzipSync(bytes), xml = new DOMParser().parseFromString(strFromU8(zip["word/document.xml"]), "application/xml");
  const paragraph = xml.getElementsByTagNameNS(W, "body")[0].getElementsByTagNameNS(W, "p")[0];
  const instruction = [...paragraph.getElementsByTagNameNS(W, "instrText")].map(e => e.textContent.trim());
  assert.deepEqual(instruction, ["DOCVARIABLE Report"], "Keep the original field; no flattening");
  assert.equal([...paragraph.getElementsByTagNameNS(W, "t")].map(e => e.textContent).join(""), "Report Title" + marker);
  // Inspect the actual field-result boundary as well as paragraph text: the
  // edit belongs after fldChar/end, never inside or in place of the cache.
  let fieldState = null, cached = "", outside = "", fieldEnds = 0;
  for (const node of paragraph.getElementsByTagName("*")) {
    if (node.namespaceURI !== W) continue;
    if (node.localName === "fldChar") {
      const type = node.getAttributeNS(W, "fldCharType");
      if (type === "begin") { assert.equal(fieldState, null); fieldState = "instruction"; }
      else if (type === "separate") { assert.equal(fieldState, "instruction"); fieldState = "result"; }
      else if (type === "end") { assert.equal(fieldState, "result"); fieldState = null; fieldEnds++; }
    } else if (node.localName === "t") {
      if (fieldState === "result") cached += node.textContent;
      else { assert.equal(fieldState, null); outside += node.textContent; }
    }
  }
  assert.equal(fieldState, null); assert.equal(fieldEnds, 1);
  assert.equal(cached, "Report Title", "Retain original cached field result exactly");
  assert.equal(outside, marker, "Keep adjacent edit outside the atomic field");
  const styles = new DOMParser().parseFromString(strFromU8(zip["word/styles.xml"]), "application/xml");
  const titleStyle = [...styles.getElementsByTagNameNS(W, "style")].find(e => e.getAttributeNS(W, "styleId") === "Title");
  assert(titleStyle, "Retain the original Title style");
  const rpr = titleStyle.getElementsByTagNameNS(W, "rPr")[0]; assert(rpr);
  assert.equal(rpr.getElementsByTagNameNS(W, "spacing")[0]?.getAttributeNS(W, "val"), "80", "Keep source tracking80twips");
  assert.equal(rpr.getElementsByTagNameNS(W, "sz")[0]?.getAttributeNS(W, "val"), "64", "Keep source32pt size");
  assert(rpr.getElementsByTagNameNS(W, "caps").length, "Keep source allCaps");
  const audit = JSON.parse(await readFile(report, "utf8"));
  return { ...audit, originalTitleFieldAndCachedTextRetained: true, titleStyle: { trackingTwips: 80, sizePt: 32, allCaps: true } };
}
