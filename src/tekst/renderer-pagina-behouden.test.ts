import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bron = readFileSync(new URL("../../node_modules/@betteroffice/docx-react/dist/chunk-LZ2DPBZ6.mjs", import.meta.url), "utf8");
const b = bron.indexOf("function Z4("), e = bron.indexOf("var wm=", b);
if (b < 0 || e < 0) throw Error("Controleer de paginaomsluiting na een engine-update.");
const pagina = Symbol("bestaande pagina"), a11y = Symbol("toegankelijkheid");
const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
const Z4 = new Function("jsxs", "jsx", "Fragment", "ZP", "lm", "ru", `return ${bron.slice(b, e)}`)(jsx, jsx, Symbol("fragment"), pagina, a11y, Symbol("foutpaneel"));

function proef(status: string, queryError: Error | null, displayList: object | null = {}) {
  const frame = {}, children = {}, error = queryError ?? new Error("Indelen mislukt");
  const uit = Z4({ renderer: { status, queryError, displayList, frame, error }, interactive: true, a11y: {}, children });
  return { uit, displayList, frame, children };
}

describe("bestaande pagina bij een queryfout", () => {
  it("behoudt dezelfde paginacomponent en bron bij een queryfout", () => {
    const p = proef("error", new Error("Query gestopt")), inhoud = p.uit.props.children;
    expect(inhoud[0].type).toBe(pagina);
    expect(inhoud[0].props.displayList).toBe(p.displayList);
    expect(inhoud[0].props.frame).toBe(p.frame);
    expect(inhoud[0].props.interactive).toBe(false);
    expect(inhoud[1]).toBe(p.children);
    expect(inhoud[2].props.active).toBe(false);
  });

  it("behoudt gewone interactieve pagina’s", () => {
    const p = proef("ready", null);
    expect(p.uit.props.children[0].type).toBe(pagina);
    expect(p.uit.props.children[0].props.interactive).toBe(true);
    expect(p.uit.props.children[2].props.active).toBe(true);
  });

  it("behoudt de foutweergave als er nog geen pagina bestaat", () => {
    const p = proef("error", new Error("Query gestopt"), null);
    expect(p.uit.props.children[0].type).toBe("div");
    expect(p.uit.props.children[0].props["data-testid"]).toBe("canvas-renderer-error");
  });

  it("verbergt een echte indelingsfout niet met een oude pagina", () => {
    const p = proef("error", null);
    expect(p.uit.props.children[0].type).toBe("div");
    expect(p.uit.props.children[0].props["data-testid"]).toBe("canvas-renderer-error");
  });

  it("toont tijdens een nieuwe laadfase geen onbewezen oude pagina", () => {
    const p = proef("loading", null);
    expect(p.uit.props.children[0]).toBeNull();
  });
});
