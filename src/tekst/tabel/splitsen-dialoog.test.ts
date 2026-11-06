import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { herstelCelSplitsMinimum } from "../../../scripts/tekstengine-compatibiliteit";

const bron = readFileSync("node_modules/@betteroffice/docx/dist/utils/index.mjs", "utf8");
function waarden(bron: string, rijen: number, stroken: number) {
  const functie = bron.slice(bron.indexOf("function Dt("), bron.indexOf("async function vt("));
  return new Function(`${functie}; return Dt;`)()(rijen, stroken);
}

describe("celsplitsdialoog na rasterverfijning", () => {
  it("laat twee zichtbare kolommen toe in een cel over vier rasterstroken", async () => {
    const { a: Dialoog } = await import(/* @vite-ignore */ pathToFileURL(resolve("node_modules/@betteroffice/docx-react/dist/chunk-RHVJ6TAE.mjs")).href);
    const toon = (stand: ReturnType<typeof waarden>) => renderToStaticMarkup(createElement(Dialoog, {
      ...stand, isOpen: true, initialCols: 2, onApply() {}, onClose() {},
    }));
    // De oorspronkelijke dialoog weigert deze geldige verdeling, omdat het
    // interne raster vier stroken telt. De aangepaste metadata heft dat op.
    expect(toon(waarden(bron, 1, 4))).toContain('disabled=""');
    expect(toon(waarden(herstelCelSplitsMinimum(bron), 1, 4))).not.toContain('disabled=""');
    // Het verticale minimum en de bescherming tegen een lege 1×1-bewerking blijven gelden.
    expect(toon({ ...waarden(herstelCelSplitsMinimum(bron), 2, 4), initialRows: 1 })).toContain('disabled=""');
    const een = renderToStaticMarkup(createElement(Dialoog, {
      ...waarden(herstelCelSplitsMinimum(bron), 1, 1), initialCols: 1,
      isOpen: true, onApply() {}, onClose() {},
    }));
    expect(een).toContain('disabled=""');
  });
  it("stopt bij een andere of dubbel geladen bron", () => {
    expect(() => herstelCelSplitsMinimum("andere kern")).toThrow("splitsdialoog");
    expect(() => herstelCelSplitsMinimum(bron + bron)).toThrow("splitsdialoog");
  });
});
