import { describe, expect, it, vi } from "vitest";
import {
  createDisplayListQueries,
  isDisplayListQuerySourceDead,
  onDisplayListQuerySourceFailure,
} from "@betteroffice/docx/layout/render";

type Bron = NonNullable<Parameters<typeof createDisplayListQueries>[1]>;
type Lijst = Parameters<typeof createDisplayListQueries>[0];

function pagina(pageIndex: number): Lijst["pages"][number] {
  return { pageIndex, width: 794, height: 1123, primitives: [] };
}

function proef() {
  let volgende = 0;
  const bron = {
    openDisplayList: vi.fn(() => ++volgende),
    closeDisplayList: vi.fn(),
    updateDisplayList: vi.fn(),
    hasDisplayListSession: () => true,
    hasDisplayListUpdate: () => true,
    hitTestRegionsByHandle: vi.fn(() => "null"),
    hitTestRegionsJson: vi.fn(() => "null"),
    buildDisplayListJson: vi.fn(() => "{}"),
    verticalMoveJson: vi.fn(() => "null"),
    rangeRectsJson: vi.fn(() => "[]"),
  };
  const gedeeld = pagina(0);
  const eerste = createDisplayListQueries({ pages: [gedeeld, pagina(1)] }, bron as Bron);
  eerste.prime();
  return {
    bron,
    eerste,
    vervangen: () => createDisplayListQueries({ pages: [gedeeld, pagina(1)] }, bron as Bron, eerste),
  };
}

describe("levensduur van de gedeelde Writer-renderer", () => {
  it("opent na een gewone fout bij handle-overdracht een nieuwe handle", () => {
    const p = proef();
    const melding = vi.spyOn(console, "warn").mockImplementation(() => {});
    const afmelden = onDisplayListQuerySourceFailure(() => { throw Error("Geen Wasm-trap verwacht"); });
    const tweede = p.vervangen();
    try {
      p.bron.updateDisplayList.mockImplementationOnce(() => { throw Error("Onbekende handle"); });
      tweede.prime();
      expect(p.bron.closeDisplayList).toHaveBeenCalledExactlyOnceWith(1);
      expect(p.bron.openDisplayList).toHaveBeenCalledTimes(2);
      expect(isDisplayListQuerySourceDead(p.bron as Bron)).toBe(false);
      expect(tweede.isReady()).toBe(true);
      expect(tweede.sourceState()).toEqual({ status: "ready" });
    } finally { tweede.dispose(); p.eerste.dispose(); afmelden(); melding.mockRestore(); }
  });

  it("gebruikt een door een overdrachtstrap beschadigde Wasm-instantie nergens opnieuw", () => {
    const p = proef();
    const fout = new WebAssembly.RuntimeError("Out of bounds memory access");
    const melden = vi.fn();
    const afmelden = onDisplayListQuerySourceFailure(melden);
    const melding = vi.spyOn(console, "error").mockImplementation(() => {});
    const waarschuwing = vi.spyOn(console, "warn").mockImplementation(() => {});
    const tweede = p.vervangen();
    try {
      p.bron.updateDisplayList.mockImplementation(() => { throw fout; });
      tweede.prime();
      expect(isDisplayListQuerySourceDead(p.bron as Bron)).toBe(true);
      expect(melden).toHaveBeenCalledExactlyOnceWith(fout);
      for (const q of [p.eerste, tweede]) {
        expect(q.isReady()).toBe(false);
        expect(q.sourceState()).toEqual({ status: "error", error: fout });
        expect(q.hitTestRegions(0, 0, 0)).toBeNull();
        q.prime();
      }
      expect(p.bron.openDisplayList).toHaveBeenCalledTimes(1);
      expect(p.bron.updateDisplayList).toHaveBeenCalledTimes(1);
      expect(p.bron.closeDisplayList).not.toHaveBeenCalled();
      expect(p.bron.hitTestRegionsJson).not.toHaveBeenCalled();
      expect(p.bron.hitTestRegionsByHandle).not.toHaveBeenCalled();
      expect(melding).toHaveBeenCalledTimes(1);
      expect(waarschuwing).not.toHaveBeenCalled();
    } finally { tweede.dispose(); p.eerste.dispose(); afmelden(); melding.mockRestore(); waarschuwing.mockRestore(); }
  });

  it("meldt een paginatrap aan bestaande en nieuwe lezers, met behoud van een onafhankelijke bron", () => {
    const p = proef(), onafhankelijk = proef();
    const fout = new WebAssembly.RuntimeError("Out of bounds memory access");
    const melding = vi.spyOn(console, "error").mockImplementation(() => {});
    const melden = vi.fn(), afmelden = onDisplayListQuerySourceFailure(melden);
    let later: ReturnType<typeof createDisplayListQueries> | undefined;
    try {
      p.bron.updateDisplayList.mockImplementation(() => { throw fout; });
      expect(p.eerste.hitTestRegions(0, 0, 0)).toBeNull();
      later = createDisplayListQueries({ pages: [pagina(0)] }, p.bron as Bron);
      for (const q of [p.eerste, later]) {
        expect(q.isReady()).toBe(false);
        expect(q.sourceState()).toEqual({ status: "error", error: fout });
        q.hitTestRegions(0, 0, 0);
      }
      expect(p.bron.openDisplayList).toHaveBeenCalledTimes(1);
      expect(melden).toHaveBeenCalledExactlyOnceWith(fout);
      expect(onafhankelijk.eerste.isReady()).toBe(true);
      onafhankelijk.eerste.hitTestRegions(0, 0, 0);
      expect(onafhankelijk.bron.hitTestRegionsByHandle).toHaveBeenCalledTimes(1);
      expect(isDisplayListQuerySourceDead(onafhankelijk.bron as Bron)).toBe(false);
    } finally { later?.dispose(); p.eerste.dispose(); onafhankelijk.eerste.dispose(); afmelden(); melding.mockRestore(); }
  });

  it("behoudt na een gewone paginalaadfout de JSON-terugval", () => {
    const p = proef();
    const melding = vi.spyOn(console, "warn").mockImplementation(() => {});
    const melden = vi.fn(), afmelden = onDisplayListQuerySourceFailure(melden);
    try {
      p.bron.updateDisplayList.mockImplementationOnce(() => { throw Error("Pagina niet meer in de handle"); });
      expect(p.eerste.hitTestRegions(0, 0, 0)).toBeNull();
      expect(p.bron.closeDisplayList).toHaveBeenCalledExactlyOnceWith(1);
      expect(p.bron.hitTestRegionsJson).toHaveBeenCalledTimes(1);
      expect(p.eerste.isReady()).toBe(true);
      expect(p.eerste.sourceState()).toEqual({ status: "ready" });
      expect(melden).not.toHaveBeenCalled();
    } finally { p.eerste.dispose(); afmelden(); melding.mockRestore(); }
  });

  it("houdt na een openingsfout de oorspronkelijke trap voor volgende lezers vast", () => {
    const p = proef();
    const fout = new WebAssembly.RuntimeError("Openen mislukt");
    const melding = vi.spyOn(console, "error").mockImplementation(() => {});
    const tweede = createDisplayListQueries({ pages: [pagina(0)] }, p.bron as Bron);
    try {
      p.bron.openDisplayList.mockImplementation(() => { throw fout; });
      tweede.prime();
      for (const q of [p.eerste, tweede]) {
        expect(q.sourceState()).toEqual({ status: "error", error: fout });
        expect(q.isReady()).toBe(false);
        q.hitTestRegions(0, 0, 0);
        q.dispose();
      }
      expect(p.bron.openDisplayList).toHaveBeenCalledTimes(2);
      expect(p.bron.closeDisplayList).not.toHaveBeenCalled();
      expect(p.bron.updateDisplayList).not.toHaveBeenCalled();
    } finally { tweede.dispose(); p.eerste.dispose(); melding.mockRestore(); }
  });

  it("herkent ook een RuntimeError aan zijn naam en laat afmeldingen werken", () => {
    const p = proef();
    const fout = Object.assign(new Error("Trap met foutnaam"), { name: "RuntimeError" });
    const melding = vi.spyOn(console, "error").mockImplementation(() => {});
    const vervallen = vi.fn(), afmelden = onDisplayListQuerySourceFailure(vervallen);
    afmelden();
    const tweede = p.vervangen();
    try {
      p.bron.updateDisplayList.mockImplementation(() => { throw fout; });
      tweede.prime();
      expect(tweede.sourceState()).toEqual({ status: "error", error: fout });
      expect(p.bron.openDisplayList).toHaveBeenCalledTimes(1);
      expect(p.bron.closeDisplayList).not.toHaveBeenCalled();
      expect(vervallen).not.toHaveBeenCalled();
    } finally { tweede.dispose(); p.eerste.dispose(); melding.mockRestore(); }
  });
});
