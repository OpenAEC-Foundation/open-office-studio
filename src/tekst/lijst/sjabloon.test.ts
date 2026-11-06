import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { expect, it } from "vitest";

it("gebruikt zichtbare Unicode-bolletjes in de opsommingen van een nieuw document (#122)", () => {
  const xml = strFromU8(unzipSync(readFileSync("public/templates/nieuw.docx"))["word/numbering.xml"]);
  const niveaus = [...xml.matchAll(/<w:lvl\b[^>]*>([\s\S]*?)<\/w:lvl>/g)]
    .map((m) => m[1]).filter((s) => /<w:numFmt\b[^>]*w:val="bullet"/.test(s));
  expect(niveaus.length).toBeGreaterThan(0);
  for (const niveau of niveaus) {
    expect(niveau).toContain('<w:lvlText w:val="•"');
    expect(niveau).toMatch(/<w:rFonts\b[^>]*w:ascii="Arial"/);
    expect(niveau).not.toContain("\uf0b7");
  }
});
