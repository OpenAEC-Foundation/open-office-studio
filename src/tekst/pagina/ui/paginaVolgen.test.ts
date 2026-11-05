import { afterEach, describe, expect, it, vi } from "vitest";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import { maakPaginaVolger } from "./paginaVolgen";

function proef() {
  let breedte = 11906;
  const lezen = vi.fn(() => [{ closingParagraphId: "final", resolved: { pageWidth: breedte, pageHeight: 16838 } }]);
  let sessie = { listSections: lezen };
  const relayout = vi.fn();
  const ref = { getEditorRef: () => ({ getYrsSession: () => sessie, relayout }) } as unknown as DocxEditorRef;
  const volger = maakPaginaVolger(() => ref);
  volger.onthoud();
  return { volger, lezen, relayout, draai: () => { breedte = 16838; }, vervang: () => { sessie = { listSections: lezen }; } };
}
afterEach(() => vi.useRealTimers());

describe("pagina-eigenschappen na een documentwijziging", () => {
  it("haalt de weergave bij na geschiedenis zonder een nieuwe bewerking toe te voegen", () => {
    vi.useFakeTimers();
    const p = proef();
    p.draai();p.volger.gewijzigd();
    vi.advanceTimersByTime(1000);
    expect(p.relayout).toHaveBeenCalledTimes(1);
    p.volger.gewijzigd();vi.advanceTimersByTime(1000);
    expect(p.relayout).toHaveBeenCalledTimes(1);
  });
  it("leest de secties niet per teken wanneer iemand blijft typen", () => {
    vi.useFakeTimers();
    const p = proef();
    for (let i = 0; i < 100; i++) { p.volger.gewijzigd();vi.advanceTimersByTime(100); }
    expect(p.lezen).toHaveBeenCalledTimes(1); // Alleen het openen.
    vi.advanceTimersByTime(1000);
    expect(p.lezen).toHaveBeenCalledTimes(2);
    expect(p.relayout).not.toHaveBeenCalled();
  });
  it("verwisselt een nieuw document niet met een gewijzigde sectie", () => {
    vi.useFakeTimers();
    const p = proef();
    p.vervang();p.draai();p.volger.gewijzigd();vi.advanceTimersByTime(1000);
    expect(p.relayout).not.toHaveBeenCalled();
  });
  it("voert na sluiten geen uitgestelde controle meer uit", () => {
    vi.useFakeTimers();
    const p = proef();
    p.draai();p.volger.gewijzigd();p.volger.stop();vi.advanceTimersByTime(1000);
    expect(p.lezen).toHaveBeenCalledTimes(1);
    expect(p.relayout).not.toHaveBeenCalled();
  });
});
