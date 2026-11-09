import { readFileSync } from "node:fs";
import { zipSync, unzipSync, strFromU8, strToU8 } from "fflate";

/** Small deterministic acceptance corpus: three sections, styles and both note kinds. */
export function writerFixture() {
  const z = unzipSync(readFileSync("public/templates/nieuw.docx"));
  const w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main", r = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const p = (text, style = "Normal") => `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
  function part(name, root, content, type) {
    z[`word/${name}.xml`] = strToU8(`<w:${root} xmlns:w="${w}">${content}</w:${root}>`);
    z["word/_rels/document.xml.rels"] = strToU8(strFromU8(z["word/_rels/document.xml.rels"]).replace("</Relationships>", `<Relationship Id="rIdProef${name}" Type="${r}/${type}" Target="${name}.xml"/></Relationships>`));
    z["[Content_Types].xml"] = strToU8(strFromU8(z["[Content_Types].xml"]).replace("</Types>", `<Override PartName="/word/${name}.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${type}+xml"/></Types>`));
  }
  const field = type => `<w:fldSimple w:instr=" ${type} "><w:r><w:t>OLD_${type}</w:t></w:r></w:fldSimple>`;
  part("headerProef", "hdr", p("Gedeelde kop", "AlleenKoptekst") + `<w:p>${["PAGE", "NUMPAGES", "FILENAME", "AUTHOR", "TITLE"].map(field).join('<w:r><w:t> | </w:t></w:r>')}</w:p>`, "header");
  part("footerProef", "ftr", p("Gedeelde voet"), "footer");
  for (const [type, root, kind] of [["footnotes", "footnote", "footnote"], ["endnotes", "endnote", "endnote"]]) part(type, type,
    `<w:${root} w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:${root}><w:${root} w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:${root}>` +
    [1,2,3].map(id => `<w:${root} w:id="${id}"><w:p><w:pPr><w:pStyle w:val="${kind === "footnote" ? "AlleenVoetnoot" : "AlleenEindnoot"}"/></w:pPr><w:r><w:${root}Ref/></w:r><w:r><w:t> ${kind}_${id}</w:t></w:r></w:p></w:${root}>`).join(""), type);
  const sect = i => `<w:sectPr>${i === 0 ? '<w:headerReference w:type="default" r:id="rIdProefheaderProef"/><w:footerReference w:type="default" r:id="rIdProeffooterProef"/>' : ""}<w:footnotePr><w:pos w:val="pageBottom"/><w:numFmt w:val="${["lowerRoman", "upperLetter", "decimal"][i]}"/><w:numStart w:val="${[3,7,1][i]}"/><w:numRestart w:val="eachSect"/></w:footnotePr><w:type w:val="nextPage"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708"/></w:sectPr>`;
  const body = [0,1,2].map(i => `<w:p>${i < 2 ? `<w:pPr>${sect(i)}</w:pPr>` : ""}<w:r><w:t>Section${["One", "Two", "Three"][i]}</w:t></w:r><w:r><w:footnoteReference w:id="${i+1}"/></w:r><w:r><w:endnoteReference w:id="${i+1}"/></w:r></w:p>`).join("");
  const table = `<w:tbl><w:tblPr><w:tblStyle w:val="EigenTabel"/></w:tblPr><w:tblGrid><w:gridCol w:w="2200"/><w:gridCol w:w="2200"/></w:tblGrid><w:tr>${["Table A", "Table B"].map(t => `<w:tc><w:tcPr><w:tcW w:w="2200" w:type="dxa"/></w:tcPr>${p(t)}</w:tc>`).join("")}</w:tr></w:tbl>`;
  z["word/document.xml"] = strToU8(strFromU8(z["word/document.xml"]).replace(/<w:body>[\s\S]*<\/w:body>/, `<w:body>${body}${table}${sect(2)}</w:body>`));
  const defs = ["AlleenKoptekst", "AlleenVoetnoot", "AlleenEindnoot"].map(id => `<w:style w:type="paragraph" w:styleId="${id}" w:customStyle="1"><w:name w:val="${id}"/><w:basedOn w:val="Normal"/></w:style>`).join("") + '<w:style w:type="table" w:styleId="EigenTabel" w:customStyle="1"><w:name w:val="EigenTabel"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="8" w:color="CC0000"/></w:tblBorders><w:shd w:fill="E6F2FF"/></w:tblPr></w:style>';
  z["word/styles.xml"] = strToU8(strFromU8(z["word/styles.xml"]).replace("</w:styles>", defs + "</w:styles>"));
  z["docProps/core.xml"] = strToU8(strFromU8(z["docProps/core.xml"]).replace(/<dc:title\s*\/>|<dc:title>[\s\S]*?<\/dc:title>/, "<dc:title>Writer Field Title</dc:title>").replace(/<dc:creator\s*\/>|<dc:creator>[\s\S]*?<\/dc:creator>/, "<dc:creator>Writer Test Author</dc:creator>"));
  return zipSync(z);
}
