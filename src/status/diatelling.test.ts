import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  initWasm,
  openPresentation,
  type DeckSnapshot,
} from "@betteroffice/pptx";
import { DiaTelling } from "./diatelling";

beforeAll(async () => {
  await initWasm(
    readFileSync(
      "node_modules/@betteroffice/pptx/dist/generated/pptx_wasm_bg.wasm",
    ),
  );
});

describe("het aantal dia's voor de statusbalk", () => {
  it("leest het deck eenmaal bij navigatie en andere DOM-mutaties zonder documentwijziging", () => {
    const snapshot = vi.fn(() => ({ slides: [{}, {}] }) as DeckSnapshot);
    const telling = new DiaTelling({ version: () => "1", snapshot });
    for (let i = 0; i < 100; i++) expect(telling.lees()).toBe(2);
    expect(snapshot).toHaveBeenCalledTimes(1);
  });

  it("deelt geen teller tussen twee documenten met dezelfde versie", () => {
    const eerste = new DiaTelling({
      version: () => "1",
      snapshot: () => ({ slides: [{}] }) as DeckSnapshot,
    });
    const tweede = new DiaTelling({
      version: () => "1",
      snapshot: () => ({ slides: [{}, {}] }) as DeckSnapshot,
    });
    expect(eerste.lees()).toBe(1);
    expect(tweede.lees()).toBe(2);
  });

  it("probeert een mislukte lezing later opnieuw", () => {
    const snapshot = vi
      .fn()
      .mockImplementationOnce(() => {
        throw Error("Nog niet gereed");
      })
      .mockReturnValue({ slides: [] });
    const telling = new DiaTelling({ version: () => "1", snapshot });
    expect(() => telling.lees()).toThrow();
    expect(telling.lees()).toBe(0);
    expect(snapshot).toHaveBeenCalledTimes(2);
  });

  it("volgt invoegen, verwijderen en Undo/Redo met de echte presentatie-engine", () => {
    const h = openPresentation(readFileSync("public/templates/nieuw.pptx"));
    try {
      h.setUndoCaptureMode("manual");
      const telling = new DiaTelling(h);
      expect(telling.lees()).toBe(1);
      const slide = h.insertSlide(1);
      h.addUndoBoundary();
      expect(telling.lees()).toBe(2);
      h.undo();
      expect(telling.lees()).toBe(1);
      h.redo();
      expect(telling.lees()).toBe(2);
      h.deleteSlide(slide.slideId);
      expect(telling.lees()).toBe(1);
    } finally {
      h.dispose();
    }
  });
});
