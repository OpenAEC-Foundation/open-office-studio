import { describe, expect, it, vi } from "vitest";
import type { Document } from "@betteroffice/docx/types/document";
import { volgTabAfstand } from "./tabafstand";

const document = (waarde?: number) =>
  ({ package: { settings: { defaultTabStop: waarde } } }) as Document;

describe("tabafstand zonder herhaalde documentprojectie", () => {
  it("verwerkt ook latere metadata binnen dezelfde versie en ruimt op", () => {
    let publiceer!: (document: Document) => void;
    const stop = vi.fn();
    const ref = {
      getDocument: vi.fn(() => document(708)),
      onContentChange: (listener: typeof publiceer) => {
        publiceer = listener;
        return stop;
      },
    };
    const meld = vi.fn();
    const weg = volgTabAfstand(ref, meld);
    // Gewone tekstprojecties veranderen de documentinstelling niet.
    for (let i = 0; i < 30; i++) publiceer(document(708));
    expect(meld.mock.calls).toEqual([[708]]);
    // Een metadata-publicatie mag niet op documentversie worden weggefilterd.
    publiceer(document(1440));
    publiceer(document(0));
    publiceer(document(-1));
    expect(meld.mock.calls).toEqual([[708], [1440], [720]]);
    expect(ref.getDocument).toHaveBeenCalledTimes(1);
    weg();
    publiceer(document(2880));
    expect(meld).toHaveBeenCalledTimes(3);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("volgt een aanvankelijk ontbrekend document en isoleert editors", () => {
    let publiceer!: (document: Document) => void;
    const a = vi.fn(),
      b = vi.fn();
    const wegA = volgTabAfstand(
      {
        getDocument: () => null,
        onContentChange: (l) => {
          publiceer = l;
          return () => {};
        },
      },
      a,
    );
    const wegB = volgTabAfstand(
      {
        getDocument: () => document(1800),
        onContentChange: () => () => {},
      },
      b,
    );
    publiceer(document(360));
    expect(a.mock.calls).toEqual([[720], [360]]);
    expect(b.mock.calls).toEqual([[1800]]);
    wegA();
    wegB();
  });

  it("laat geen luisteraar achter wanneer de eerste lezing mislukt", () => {
    const stop = vi.fn();
    expect(() =>
      volgTabAfstand(
        {
          getDocument: () => {
            throw new Error("gesloten");
          },
          onContentChange: () => stop,
        },
        vi.fn(),
      ),
    ).toThrow("gesloten");
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
