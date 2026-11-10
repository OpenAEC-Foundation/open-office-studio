import { readFileSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  initWasm,
  openPresentation,
  type PresentationHandle,
} from "@betteroffice/pptx";
import type { PptxEditorApi } from "@betteroffice/pptx-react";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  objectKaders,
  pasObjectKadersToe,
  schikObjecten,
  zichtKader,
  type ObjectKader,
} from "./objecten";

beforeAll(async () =>
  initWasm(
    readFileSync(
      "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
    ),
  ),
);
const handles: PresentationHandle[] = [];
afterEach(() => handles.splice(0).forEach((h) => h.dispose()));
const kader = (
  id: string,
  x: number,
  y: number,
  width = 100,
  height = 50,
  draaiing = 0,
): ObjectKader => ({ id, naam: id, rect: { x, y, width, height }, draaiing });
function boek() {
  const h = openPresentation(
    readFileSync("docs/voorbeelden/Ontwerpvisie.pptx"),
  );
  handles.push(h);
  const slideId = h.snapshot().slides[0].id;
  const ids = [0, 1, 2].map(
    (i) =>
      h.addShape(slideId, {
        name: `Proef ${i}`,
        geometry: "rect",
        rect: {
          x: 100000 + i * 1200000,
          y: 200000 + i * 300000,
          width: 500000 + i * 100000,
          height: 300000,
        },
      }).shapeId,
  );
  const api = {
    handle: h,
    version: async () => h.version(),
    applyEdits: async (r) => h.applyEdits(r),
  } as Pick<PptxEditorApi, "handle" | "version" | "applyEdits">;
  return {
    h,
    api,
    slideId,
    ids,
    objecten: () =>
      objectKaders(h.snapshot().slides[0].shapes).filter((o) =>
        ids.includes(o.id),
      ),
  };
}
describe("objecten uitlijnen en verdelen (#80)", () => {
  it.each([
    ["links", "x", 10],
    ["rechts", "x", 210],
    ["centreren", "x", 110],
    ["boven", "y", 20],
    ["onder", "y", 120],
    ["midden", "y", 70],
  ] as const)("lijnt %s uit op de selectie", (op, as, waarde) => {
    const r = schikObjecten(
      [kader("a", 10, 20), kader("b", 210, 120)],
      op,
      "selectie",
      1000,
      1000,
    );
    expect(r.get("a")?.[as]).toBe(waarde);
    expect(r.get("b")?.[as]).toBe(waarde);
  });
  it("lijnt gedraaide zichtbare randen uit", () => {
    const a = kader("a", 50, 60, 100, 40, 90);
    const rect = schikObjecten([a], "links", "dia", 1000, 1000).get("a")!;
    expect(zichtKader({ ...a, rect }).x).toBeCloseTo(0);
    expect(rect.width).toBe(100);
    expect(rect.height).toBe(40);
  });
  it("verdeelt verschillende breedtes met gelijke tussenruimte", () => {
    const os = [
      kader("a", 10, 0, 100),
      kader("b", 200, 0, 200),
      kader("c", 800, 0, 50),
    ];
    const r = schikObjecten(os, "horizontaal", "selectie", 1000, 1000);
    expect(r.get("a")?.x).toBe(10);
    expect(r.get("c")?.x).toBe(800);
    expect(r.get("b")!.x - 110).toBe(800 - r.get("b")!.x - 200);
  });
  it("verdeelt verticaal over de dia", () => {
    const r = schikObjecten(
      [kader("a", 20, 40), kader("b", 30, 100), kader("c", 60, 170)],
      "verticaal",
      "dia",
      1000,
      1000,
    );
    expect(r.get("a")?.y).toBe(0);
    expect(r.get("b")?.y).toBe(475);
    expect(r.get("c")?.y).toBe(950);
  });
  it("maakt van een meervoudige uitlijning één Undo-stap", async () => {
    const b = boek(),
      voor = b.objecten();
    await pasObjectKadersToe(
      b.api,
      b.slideId,
      schikObjecten(voor, "links", "selectie", 10000000, 8000000),
    );
    expect(b.objecten().map((o) => o.rect.x)).toEqual([100000, 100000, 100000]);
    b.h.undo();
    expect(b.objecten()).toEqual(voor);
    b.h.redo();
    expect(b.objecten().map((o) => o.rect.x)).toEqual([100000, 100000, 100000]);
    const opnieuw = openPresentation(b.h.save());
    handles.push(opnieuw);
    expect(
      opnieuw
        .snapshot()
        .slides[0].shapes.filter((s) => s.name.startsWith("Proef "))
        .map((s) => s.x),
    ).toEqual([100000, 100000, 100000]);
  });
  it("past exacte maten toe en weigert verouderde geometrie", async () => {
    const b = boek(),
      o = b.objecten()[0];
    const rect = { x: -12345, y: 67890, width: 765432, height: 234567 };
    await pasObjectKadersToe(
      b.api,
      b.slideId,
      new Map([[o.id, rect]]),
      new Map([[o.id, o.rect]]),
    );
    expect(b.objecten()[0].rect).toEqual(rect);
    const versie = b.h.version();
    await expect(
      pasObjectKadersToe(
        b.api,
        b.slideId,
        new Map([[o.id, { ...rect, x: 999 }]]),
        new Map([[o.id, o.rect]]),
      ),
    ).rejects.toThrow();
    expect(b.h.version()).toBe(versie);
  });
  it("bewerkt ook geometrie die van de indeling is geërfd", async () => {
    const delen = unzipSync(readFileSync("public/templates/nieuw.pptx"));
    delen["ppt/slides/slide1.xml"] = strToU8(
      strFromU8(delen["ppt/slides/slide1.xml"]).replace(
        /<a:xfrm\b[^>]*>[\s\S]*?<\/a:xfrm>/g,
        "",
      ),
    );
    const h = openPresentation(zipSync(delen));
    handles.push(h);
    const slideId = h.snapshot().slides[0].id;
    const api = {
      handle: h,
      version: async () => h.version(),
      applyEdits: async (r) => h.applyEdits(r),
    } as Pick<PptxEditorApi, "handle" | "version" | "applyEdits">;
    const shape = h
      .snapshot()
      .slides[0].shapes.find((s) => s.inherited && (!s.width || !s.height));
    expect(shape).toBeDefined();
    const o = objectKaders([shape!])[0];
    await pasObjectKadersToe(
      api,
      slideId,
      new Map([[o.id, { ...o.rect, x: o.rect.x + 100000 }]]),
    );
    expect(h.snapshot().slides[0].shapes.find((s) => s.id === o.id)?.x).toBe(
      o.rect.x + 100000,
    );
  });
  it("weigert ongeldige maten zonder wijziging", async () => {
    const b = boek(),
      o = b.objecten()[0],
      versie = b.h.version();
    await expect(
      pasObjectKadersToe(
        b.api,
        b.slideId,
        new Map([[o.id, { ...o.rect, width: 0 }]]),
      ),
    ).rejects.toThrow();
    expect(b.h.version()).toBe(versie);
  });
});
