import fs from "node:fs";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
fs.mkdirSync(".local", { recursive: true });
const p = unzipSync(fs.readFileSync("public/templates/nieuw.docx"));
const xml = strFromU8(p["word/document.xml"]);
const section = xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/)?.[0] ?? "";
const sentence =
  "Dit is een vaste Nederlandse proefzin voor het meten van Writer tijdens typen en bladeren. ";
const paragraphs = Array.from(
  { length: 600 },
  (_, i) =>
    `<w:p><w:r><w:rPr><w:lang w:val="nl-NL"/></w:rPr><w:t xml:space="preserve">Paragraaf ${String(i).padStart(4, "0")}. ${sentence.repeat(4)}</w:t></w:r></w:p>`,
).join("");
p["word/document.xml"] = strToU8(
  xml.replace(
    /<w:body>[\s\S]*<\/w:body>/,
    `<w:body>${paragraphs}${section}</w:body>`,
  ),
);
fs.writeFileSync(".local/performance-600.docx", zipSync(p));
console.log(
  "Created 600 paragraphs",
  fs.statSync(".local/performance-600.docx").size,
  "bytes",
);
