import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { herstelVeldLettertype } from "../../../scripts/tekstengine-compatibiliteit";

const bron = vi.hoisted(() => ({ resolve: vi.fn(), systeem: vi.fn(() => false), opties: vi.fn() }));
vi.mock("../../lettertypen/provider", () => ({ maakLettertypeBron: (opties: unknown) => { bron.opties(opties); return bron; } }));
vi.mock("../../lettertypen/systeem", () => ({ opSysteem: bron.systeem }));
vi.mock("../../lettertypen/catalogus", () => ({ lettertypeBasis: () => "https://example.test/office/fonts/" }));

let faces: { family: string; bytes: unknown; descriptors: FontFaceDescriptors }[];
const add = vi.fn();
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  faces = [];
  vi.stubGlobal("document", { fonts: { add } });
  vi.stubGlobal("FontFace", class {
    constructor(public family: string, bytes: unknown, descriptors: FontFaceDescriptors) {
      faces.push({ family, bytes, descriptors });
    }
    async load() { return this; }
  });
});
afterEach(() => vi.unstubAllGlobals());

it("uses the layout provider's bytes for expanded field text, retaining geometry and the original fallback", async () => {
  const bytes = new ArrayBuffer(4), laad = vi.fn(async () => bytes);
  bron.resolve.mockReturnValue(laad);
  const { veldMetLettertype } = await import("./lettertype");
  const run = { font: "italic 700 14.667px Cambria, sans-serif", text: "long-name.docx", width: 275.985, x: 96, field: { type: "FILENAME" } };
  const uit = await veldMetLettertype(run);
  expect(bron.resolve).toHaveBeenCalledWith("Cambria", true, true);
  expect(bron.opties).toHaveBeenCalledWith({ baseUrl: "https://example.test/office/fonts/" });
  expect(faces).toEqual([{ family: "oos-veld-1", bytes, descriptors: { weight: "700", style: "italic" } }]);
  expect(add).toHaveBeenCalledOnce();
  expect(uit).toEqual({ ...run, font: 'italic 700 14.667px "oos-veld-1", Cambria, sans-serif' });
  expect(run.font).toBe("italic 700 14.667px Cambria, sans-serif");
  await Promise.all([veldMetLettertype(run), veldMetLettertype(run)]);
  expect(laad).toHaveBeenCalledOnce();
});

it("leaves literal text and document-scoped embedded aliases alone", async () => {
  bron.resolve.mockReturnValue(undefined);
  const { veldMetLettertype } = await import("./lettertype");
  const literal = { font: "14px Cambria, sans-serif" };
  const embedded = { font: '14px "docx-embedded-7", sans-serif', field: { type: "AUTHOR" } };
  expect(await veldMetLettertype(literal)).toBe(literal);
  expect(bron.resolve).not.toHaveBeenCalled();
  expect(await veldMetLettertype(embedded)).toBe(embedded);
  expect(add).not.toHaveBeenCalled();
  const original = { fallbackFont: "14px Cambria, sans-serif", field: { type: "FILENAME" } };
  bron.resolve.mockReturnValue(vi.fn(async () => new ArrayBuffer(4)));
  bron.resolve.mockClear();
  expect(await veldMetLettertype(original, new Map([["Cambria", "docx-embedded-7"]]))).toBe(original);
  expect(bron.resolve).not.toHaveBeenCalled();
});

it("prepares the shaped field fallback without changing its authoritative glyphs", async () => {
  bron.resolve.mockReturnValue(async () => new ArrayBuffer(4));
  const { veldMetLettertype } = await import("./lettertype");
  const run = { fallbackFont: "400 14.667px Cambria, sans-serif", glyphs: [{ id: 53, x: 96, advance: 10.56 }], field: { type: "FILENAME" } };
  const uit = await veldMetLettertype(run);
  expect(uit.fallbackFont).toBe('400 14.667px "oos-veld-1", Cambria, sans-serif');
  expect(uit.glyphs).toBe(run.glyphs);
  expect(uit.field).toBe(run.field);
});

it("retains the renderer on a font failure and retries instead of caching a failure", async () => {
  const laad = vi.fn().mockRejectedValueOnce(new Error("font unavailable")).mockResolvedValue(new ArrayBuffer(4));
  bron.resolve.mockReturnValue(laad);
  const { veldMetLettertype } = await import("./lettertype");
  const run = { font: "14px Caladea, serif", field: { type: "TITLE" } };
  expect(await veldMetLettertype(run)).toBe(run);
  expect((await veldMetLettertype(run)).font).toContain('"oos-veld-2"');
  expect(laad).toHaveBeenCalledTimes(2);
});

it("guards the exact installed renderer contract before adding the async field font preparation", () => {
  const source = readFileSync("node_modules/@betteroffice/docx/dist/chunk-EOFVNRML.mjs", "utf8");
  expect(herstelVeldLettertype(source)).toContain('jt(e,n.field&&!t.glyphCache?await oosVeldLettertype(n,i):n,t)');
  expect(() => herstelVeldLettertype(source.replace('case "text":Kt', 'case "text":changed'))).toThrow(/tekstengine is gewijzigd/);
});
