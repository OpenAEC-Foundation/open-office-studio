import { describe, expect, it, vi } from "vitest";
import type { YrsSession } from "@betteroffice/docx/yrs";
import { AlineaOffsets } from "./offsets";
import { naarRauw } from "./sessie";

function lezer() {
  let versie = "1";
  const lengths = new Map([
    ["a", 3],
    ["b", 5],
  ]);
  const paragraphSpans = vi.fn(() =>
    [...lengths].map(([paraId, length]) => ({ paraId, length })),
  );
  const storySegments = vi.fn(
    () =>
      [
        { kind: "text", text: "abc", attributes: {} },
        { kind: "pilcrow", paraId: "a", properties: {}, attributes: {} },
        { kind: "text", text: "xx", attributes: { del: { author: "test" } } },
        { kind: "text", text: "def", attributes: {} },
        { kind: "pilcrow", paraId: "b", properties: {}, attributes: {} },
      ] as ReturnType<YrsSession["storySegments"]>,
  );
  return {
    version: () => versie,
    paragraphSpans,
    storySegments,
    lengths,
    wijzig: () => {
      versie = String(Number(versie) + 1);
    },
  };
}

describe("begrensde spelling-offsetcache", () => {
  it("leest gewone alinea's eenmaal per versie en laadt daarvoor geen tekstsegmenten", () => {
    const bron = lezer(),
      cache = new AlineaOffsets();
    for (let i = 0; i < 100; i++)
      expect(cache.segmenten(bron, "body", "a", 3)).toBeNull();
    expect(bron.paragraphSpans).toHaveBeenCalledTimes(1);
    expect(bron.storySegments).not.toHaveBeenCalled();
  });
  it("hergebruikt één segmentlezing voor alle afwijkende offsets in hetzelfde verhaal", () => {
    const bron = lezer(),
      cache = new AlineaOffsets();
    for (let i = 0; i < 20; i++) {
      const delen = cache.segmenten(bron, "body", "b", 3)!;
      expect(naarRauw(delen, 0)).toBe(2);
      expect(naarRauw(delen, 0, true)).toBe(2);
      expect(naarRauw(delen, 3, true)).toBe(5);
    }
    expect(bron.paragraphSpans).toHaveBeenCalledTimes(1);
    expect(bron.storySegments).toHaveBeenCalledTimes(1);
  });
  it("ververst ook gewone-alinealengtes na invoer en Undo/Redo-versies", () => {
    const bron = lezer(),
      cache = new AlineaOffsets();
    expect(cache.segmenten(bron, "body", "b", 5)).toBeNull();
    bron.wijzig();
    expect(cache.segmenten(bron, "body", "b", 3)).not.toBeNull();
    bron.wijzig();
    expect(cache.segmenten(bron, "body", "b", 5)).toBeNull();
    expect(bron.paragraphSpans).toHaveBeenCalledTimes(3);
    expect(bron.storySegments).toHaveBeenCalledTimes(1);
  });
  it("verwisselt geen gegevens tussen bronobjecten met dezelfde versie", () => {
    const a = lezer(),
      b = lezer(),
      cache = new AlineaOffsets();
    expect(cache.segmenten(a, "body", "a", 3)).toBeNull();
    b.lengths.set("a", 4);
    expect(cache.segmenten(b, "body", "a", 3)).not.toBeNull();
    expect(b.paragraphSpans).toHaveBeenCalledTimes(1);
    expect(b.storySegments).toHaveBeenCalledTimes(1);
  });
  it("houdt verhalen met dezelfde alinea-identiteit apart", () => {
    const bron = lezer(),
      cache = new AlineaOffsets();
    cache.segmenten(bron, "body", "a", 3);
    cache.segmenten(bron, "body:t0:r0c0", "a", 3);
    expect(bron.paragraphSpans).toHaveBeenCalledTimes(2);
  });
  it("laat verwijderen, opnieuw laden en stoppen geen oude bron vasthouden", () => {
    const bron = lezer(),
      cache = new AlineaOffsets();
    expect(cache.segmenten(bron, "body", "onbekend", 3)).toBeNull();
    expect(bron.storySegments).not.toHaveBeenCalled();
    cache.wis();
    cache.segmenten(bron, "body", "a", 3);
    expect(bron.paragraphSpans).toHaveBeenCalledTimes(2);
  });
});
