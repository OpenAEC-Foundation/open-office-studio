import { describe, expect, it } from "vitest";
import { breedteInCel } from "./opdrachten";
import type { Sessie } from "../gedeeld/engine";

function sessie(story: string, samengevoegd = false) {
  const payload = {
    grid: [1000, 2000, 3000], tblPr: { cellMargins: { left: 100, right: 120 } },
    rows: [{ trPr: { gridBefore: 1 }, cells: [{ story, tcPr: { colspan: samengevoegd ? 2 : 1, margins: { left: 150 } } }] }],
  };
  return {
    version: () => "1",
    tablePayload: () => null,
    storySegments: () => [{ kind: "embed", embedKind: "table", payload }],
  } as unknown as Sessie;
}

describe("breedte van een geneste tabel", () => {
  it("vindt een tabel ook nadat eerdere tabellen zijn verwijderd", () => {
    const story = "body:t7:r0c1";
    expect(breedteInCel(sessie(story), story)).toBe(2000 - 150 - 120);
  });
  it("telt samengevoegde kolommen mee en herkent gekopieerde celverhalen", () => {
    const story = "body:t7:r0c1~2";
    expect(breedteInCel(sessie(story, true), story)).toBe(2000 + 3000 - 150 - 120);
  });
  it("gebruikt geen celbreedte in een gewone alinea", () => {
    expect(breedteInCel(sessie("body:t7:r0c1"), "body")).toBeNull();
  });
});
