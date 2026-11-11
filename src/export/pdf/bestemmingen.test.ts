import { afterEach, expect, it, vi } from "vitest";
import { schrijfPdf, veiligeUrl } from "./schrijver";
import { maakPdf } from "./index";
import type { AfdrukDocument, Koppeling } from "../../afdrukken/model";

const text = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);
const pageIds = (pdf: string) => [...pdf.matchAll(/(\d+) 0 obj\n<< \/Type \/Page \/Parent/g)].map(m => Number(m[1]));
afterEach(() => vi.unstubAllGlobals());

it("writes forward/backward internal destinations without relaxing external URL safety", () => {
  const link = { x: 10, y: 20, breedte: 40, hoogte: 12 };
  const pdf = text(schrijfPdf({ paginas: [
    { breedte: 200, hoogte: 300, vector: "", koppelingen: [
      { ...link, url: "#Target", doel: { pagina: 1, x: 35, y: 50 } },
      { ...link, url: "#Missing" },
      { ...link, url: "#OutOfRange", doel: { pagina: 8, x: 0, y: 0 } },
      { ...link, url: "#Invalid", doel: { pagina: 1, x: Number.NaN, y: 50 } },
      { ...link, url: "#Outside", doel: { pagina: 1, x: 0, y: 999 } },
      { ...link, url: "javascript:alert(1)" },
      { ...link, url: "https://example.invalid/safe" },
    ] },
    { breedte: 220, hoogte: 400, vector: "", koppelingen: [{ ...link, url: "#Back", doel: { pagina: 0, x: 25, y: 60 } }] },
  ] }));
  const ids = pageIds(pdf);
  expect(ids).toHaveLength(2);
  expect(pdf).toContain(`/Dest [${ids[1]} 0 R /XYZ 35 350 0]`);
  expect(pdf).toContain(`/Dest [${ids[0]} 0 R /XYZ 25 240 0]`);
  expect(pdf.match(/\/Subtype \/Link/g)).toHaveLength(3);
  expect(pdf).toContain("/URI (https://example.invalid/safe)");
  expect(pdf).not.toContain("/URI (#");
  expect(pdf).not.toContain("javascript:");
  expect(veiligeUrl("#Target")).toBeNull();
});

it.each([[0, 1], [1, 0], [0], [1]])("remaps or removes internal targets in the actual PDF page selection %j", async (...indexen) => {
  class Canvas {
    width = 2; height = 2;
    getContext() { return { fillStyle: "", fillRect() {}, drawImage() {} }; }
    toBlob(callback: (blob: Blob) => void) { callback(new Blob([new Uint8Array([255, 216, 255, 217])], { type: "image/jpeg" })); }
  }
  vi.stubGlobal("document", { createElement: () => new Canvas() });
  const original: Koppeling = { x: 10, y: 20, breedte: 30, hoogte: 12, url: "#Target", doel: { pagina: 1, x: 25, y: 40 } };
  const doc: AfdrukDocument = { titel: "Range", paginas: [0, 1].map(i => ({ breedte: 200, hoogte: 300,
    teken: async () => ({ canvas: new Canvas() as unknown as HTMLCanvasElement, tekst: [], koppelingen: i === 0 ? [original] : [] }),
  })) };
  const pdf = text(await maakPdf(doc, { indexen, vector: false, kwaliteit: "klein" }));
  const ids = pageIds(pdf);
  expect(ids).toHaveLength(indexen.length);
  if (indexen.includes(0) && indexen.includes(1)) {
    expect(pdf).toContain(`/Dest [${ids[indexen.indexOf(1)]} 0 R /XYZ 25 260 0]`);
  } else expect(pdf).not.toContain("/Subtype /Link");
  expect(original.doel!.pagina).toBe(1);
});
