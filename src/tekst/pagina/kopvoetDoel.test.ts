import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDocx } from "@betteroffice/docx/docx";
import { zorgVoorKopVoet, zetEerstePaginaAnders, zetEvenOnevenAnders, type KopVoetSoort } from "./kopvoet";
import { kopVoetDoel, kopVoetInhoud } from "./kopvoetDoel";
import { herstelKopVoetDoel } from "../../../scripts/tekstengine-compatibiliteit";

async function proef() {
  let bytes = zetEvenOnevenAnders(zetEerstePaginaAnders(readFileSync("public/templates/nieuw.docx"), 0, true), true);
  for (const soort of ["header", "footer"] as const) bytes = zorgVoorKopVoet(bytes, 0, soort)!;
  return parseDocx(bytes, { preloadFonts: false });
}

describe("kop/voet-bewerkdoel uit het getekende onderdeel (#209)", () => {
  it.each(["header", "footer"] as KopVoetSoort[])("onderscheidt alle drie %s-varianten zonder terugval op default", async (soort) => {
    const doc = await proef();
    const refs = doc.package.document.finalSectionProperties![soort === "header" ? "headerReferences" : "footerReferences"]!;
    for (const [type, pagina] of [["first", 1], ["even", 2], ["default", 3]] as const) {
      const rId = refs.find((r) => r.type === type)!.rId;
      expect(kopVoetDoel(doc, soort, pagina, rId)).toEqual({ kind: soort, rId, pageIndex: pagina - 1, isFirstPage: type === "first" });
      expect(kopVoetInhoud(doc, soort, rId)).toBe((soort === "header" ? doc.package.headers : doc.package.footers)!.get(rId));
    }
    // De pagina kiest niet zelfstandig de variant: de layout kent ook
    // sectiegrenzen en herstartende paginanummers.
    const eerste = refs.find((r) => r.type === "first")!.rId;
    expect(kopVoetDoel(doc, soort, 4, eerste)).toMatchObject({ rId: eerste, pageIndex: 3, isFirstPage: true });
    expect(kopVoetDoel(doc, soort, 2, "verdwenen")).toBeNull();
    expect(kopVoetInhoud(null, soort, eerste)).toBeNull();
  });

  it.each(["editor", "opdrachten"] as const)("controleert alle bronankers in %s", (ingang) => {
    const pad = ingang === "editor" ? "index.mjs" : "chunk-LZ2DPBZ6.mjs";
    const bron = readFileSync(`node_modules/@betteroffice/docx-react/dist/${pad}`, "utf8");
    expect(herstelKopVoetDoel(bron, ingang)).not.toBe(bron);
    expect(() => herstelKopVoetDoel("", ingang)).toThrow("De tekstengine is gewijzigd");
    expect(() => herstelKopVoetDoel(herstelKopVoetDoel(bron, ingang), ingang)).toThrow("De tekstengine is gewijzigd");
  });
});
