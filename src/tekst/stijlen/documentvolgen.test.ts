import { afterEach, describe, expect, it, vi } from "vitest";
import type { DocxEditorRef } from "@betteroffice/docx-react";
import type { Document } from "@betteroffice/docx/types/document";
import { volgDocumentStaat } from "./documentvolgen";

const doc = (taal: string) =>
  ({
    package: {
      styles: { docDefaults: { rPr: { language: { latin: taal } } } },
    },
  }) as Document;
function editor(init: Document | null) {
  const sessie = {};
  const inhoud = new Set<(d: Document) => void>();
  const selectie = new Set<() => void>();
  const lees = vi.fn(() => init);
  const api = () =>
    ({
      getDocument: lees,
      getEditorRef: () => ({ getYrsSession: () => sessie }),
      onContentChange: (l: (d: Document) => void) => {
        inhoud.add(l);
        return () => inhoud.delete(l);
      },
      onSelectionChange: (l: () => void) => {
        selectie.add(l);
        return () => selectie.delete(l);
      },
    }) as unknown as DocxEditorRef;
  return {
    api,
    lees,
    inhoud,
    selectie,
    publiceer: (d: Document) => inhoud.forEach((l) => l(d)),
  };
}
afterEach(() => vi.useRealTimers());

describe("stijldocumenten volgen zonder projectiepoll", () => {
  it("herkent nieuwe publieke refs van dezelfde sessie en verwerkt late metadata", () => {
    vi.useFakeTimers();
    const a = editor(doc("nl-NL")),
      meld = vi.fn(),
      selectie = vi.fn();
    const stop = volgDocumentStaat(a.api, meld, selectie);
    vi.advanceTimersByTime(6000);
    expect(a.lees).toHaveBeenCalledTimes(1);
    expect(meld).toHaveBeenCalledTimes(1);
    expect(selectie).toHaveBeenCalledTimes(1);
    const nieuw = doc("fr-BE");
    a.publiceer(nieuw);
    vi.advanceTimersByTime(400);
    expect(meld).toHaveBeenLastCalledWith(nieuw, true);
    expect(a.lees).toHaveBeenCalledTimes(1);
    stop();
    expect(a.inhoud.size + a.selectie.size).toBe(0);
  });

  it("annuleert uitgestelde oude inhoud bij vervangen en stoppen", () => {
    vi.useFakeTimers();
    const a = editor(doc("nl-NL")),
      b = editor(doc("en-GB")),
      meld = vi.fn();
    let api = a.api;
    const stop = volgDocumentStaat(() => api(), meld, vi.fn());
    vi.advanceTimersByTime(350);
    const oud = [...a.inhoud][0];
    a.publiceer(doc("de-DE"));
    api = b.api;
    vi.advanceTimersByTime(250);
    expect(meld).toHaveBeenCalledTimes(2);
    oud(doc("es-ES"));
    b.publiceer(doc("fr-FR"));
    stop();
    vi.advanceTimersByTime(6000);
    expect(meld).toHaveBeenCalledTimes(2);
    expect(
      a.inhoud.size + b.inhoud.size + a.selectie.size + b.selectie.size,
    ).toBe(0);
  });

  it("ontvangt het later gereedgemelde document zonder extra initiële lezing", () => {
    vi.useFakeTimers();
    const a = editor(null),
      meld = vi.fn();
    const stop = volgDocumentStaat(a.api, meld, vi.fn());
    const gereed = doc("nl-BE");
    a.publiceer(gereed);
    vi.advanceTimersByTime(2400);
    expect(meld.mock.calls).toEqual([
      [null, false],
      [gereed, true],
    ]);
    expect(a.lees).toHaveBeenCalledTimes(1);
    stop();
  });
});
