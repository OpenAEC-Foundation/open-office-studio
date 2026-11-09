import fs from "node:fs";
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
export function formuleDocx() {
  const r = t => `<m:r><m:t>${t}</m:t></m:r>`;
  const f = `<m:f><m:num>${r("α+1")}</m:num><m:den>${r("β")}</m:den></m:f>`;
  const nary = (chr, lo, hi, body) => `<m:nary><m:naryPr><m:chr m:val="${chr}"/><m:limLoc m:val="${chr === "∫" ? "subSup" : "undOvr"}"/></m:naryPr><m:sub>${r(lo)}</m:sub><m:sup>${r(hi)}</m:sup><m:e>${body}</m:e></m:nary>`;
  const matrix = '<m:m>' + [["a", "b"], ["c", "d"]].map(row => `<m:mr>${row.map(c => `<m:e>${r(c)}</m:e>`).join("")}</m:mr>`).join("") + '</m:m>';
  const inline = x => `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${x}</m:oMath>`;
  const display = x => `<w:p><m:oMathPara xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${inline(x)}</m:oMathPara></w:p>`;
  const body = `<w:p><w:r><w:t>Inline: </w:t></w:r>${inline(f)}<w:r><w:t> naast tekst</w:t></w:r></w:p>` + display(nary("∑", "i=1", "n", `<m:sSup><m:e>${r("i")}</m:e><m:sup>${r("2")}</m:sup></m:sSup>`)) + display(nary("∫", "0", "1", f + r("dx"))) + display(matrix);
  const z = unzipSync(fs.readFileSync("public/templates/nieuw.docx"));
  z["word/document.xml"] = strToU8(strFromU8(z["word/document.xml"]).replace(/<w:body>[\s\S]*?<w:sectPr/, `<w:body>${body}<w:sectPr`));
  return zipSync(z);
}
