import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { openWorkbook } from "@betteroffice/xlsx";
import { Pakket } from "../grafieken/pakket";
import { groepFixture } from "./testdata/groep";
import { leesTekenobjecten, wijzigTekenobject } from "./tekenobjecten";
import { groepMatrix, groepOnderdelen, objectOmvang } from "./groepGeometrie";
import {
  metTekenAnkers,
  laadTekenobjecten,
  tekenobjecten,
  bewaarTekenAnkers,
} from "./tekenAnkers";
const basis = readFileSync("public/templates/nieuw.xlsx");
const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgcPkPAAGLAURM0jfCAAAAAElFTkSuQmCC",
    "base64",
  ),
);
describe("worksheet DrawingML groups", () => {
  it("reads nested local coordinate systems and keeps unsupported children explicit", () => {
    const f = groepFixture(basis, png, {
        onbekend: true,
        rotatie: 30,
        flipX: true,
      }),
      [o] = leesTekenobjecten(f.bytes);
    expect(o).toMatchObject({
      id: "300",
      naam: "Nested group",
      soort: "groep",
      rotatie: 30,
      spiegelX: true,
      plek: { row: 2, col: 2, breedte: 200, hoogte: 180 },
      groep: { x: 10, y: 20, breedte: 100, hoogte: 90 },
    });
    expect(o.groep?.kinderen).toHaveLength(3);
    expect(o.groep?.kinderen[0]).toMatchObject({
      soort: "afbeelding",
      plek: { x: 10, y: 20, breedte: 40, hoogte: 30 },
      media: png,
    });
    expect(o.groep?.kinderen[1].groep?.kinderen[0]).toMatchObject({
      soort: "vorm",
      rotatie: 45,
      tekst: "OK",
      plek: { x: 100, y: 200, breedte: 40, hoogte: 20 },
    });
    expect(o.groep?.kinderen[2]).toMatchObject({
      soort: "onbekend",
      vorm: "star5",
    });
  });
  it("moves/resizes the group frame without rewriting descendants, relationships or unknown data", () => {
    const f = groepFixture(basis, png),
      [o] = leesTekenobjecten(f.bytes);
    const bytes = wijzigTekenobject(
      f.bytes,
      o,
      { ...o.plek, row: 6, col: 4, breedte: 400, hoogte: 360 },
      { naam: "Moved group" },
    );
    const p = new Pakket(bytes),
      xml = p.lees(f.pad),
      after = leesTekenobjecten(bytes)[0];
    expect(after).toMatchObject({
      naam: "Moved group",
      plek: { row: 6, col: 4, breedte: 400, hoogte: 360 },
    });
    expect(xml).toContain(f.picture);
    expect(xml).toContain(f.shape);
    expect(xml).toContain(f.extension);
    expect(xml).toContain('cx="3810000" cy="3429000"');
    expect(after.groep).toEqual(o.groep);
    expect(p.bytes("custom/group-probe.bin")).toEqual(
      new Uint8Array([2, 7, 1, 8]),
    );
    expect(() =>
      wijzigTekenobject(f.bytes, o.groep!.kinderen[0], o.plek),
    ).toThrow();
  });
  it("tracks only the outer anchor through native structural edits and save/reopen", () => {
    const f = groepFixture(basis, png),
      bytes = metTekenAnkers(f.bytes),
      h = openWorkbook(bytes);
    try {
      laadTekenobjecten(h, bytes);
      h.applyOps([{ type: "insertRows", sheet: 0, at: 1, count: 3 }]);
      expect(tekenobjecten(h, 0)[0].plek.row).toBe(5);
      h.undo();
      expect(tekenobjecten(h, 0)[0].plek.row).toBe(2);
      h.redo();
      const saved = bewaarTekenAnkers(h, h.save()),
        [o] = leesTekenobjecten(saved);
      expect(o.plek.row).toBe(5);
      expect(o.groep?.kinderen[0].media).toEqual(png);
      expect(new Pakket(saved).lees(f.pad)).toContain(f.shape);
    } finally {
      h.dispose();
    }
  });
  it("maps child space and mirrored space consistently and includes rotated protrusions", () => {
    const [o] = leesTekenobjecten(groepFixture(basis, png).bytes),
      g = o.groep!;
    expect(groepMatrix(g, 200, 180)).toEqual([2, 0, 0, 2, -20, -40]);
    expect(groepMatrix(g, 200, 180, true, false)).toEqual([
      -2, 0, 0, 2, 220, -40,
    ]);
    const b = objectOmvang(o, 200, 180);
    expect(b.links).toBeCloseTo(0);
    expect(b.boven).toBeCloseTo(0);
    expect(b.rechts).toBeCloseTo(160 + Math.SQRT2 * 30);
    expect(b.onder).toBeCloseTo(160 + Math.SQRT2 * 30);
  });
  it("keeps leaf rotations orthogonal under non-uniform group scaling and nested flips", () => {
    const [o] = leesTekenobjecten(groepFixture(basis, png).bytes),
      g = o.groep!;
    g.kinderen[1].spiegelX = true;
    const parts = groepOnderdelen(g, 400, 180, true, false)!;
    const leaf = parts.find((p) => p.object.id === "2")!,
      [a, b, c, d] = leaf.matrix;
    expect(a * c + b * d).toBeCloseTo(0);
    expect((Math.atan2(b, a) * 180) / Math.PI).toBeCloseTo(45);
    expect(a * d - b * c).toBeGreaterThan(0);
    expect(leaf.object.spiegelX).toBe(false);
    expect(parts.find((p) => p.object.id === "1")?.object.spiegelX).toBe(true);
  });
  it("preserves a zero-extent group as an explicit placeholder", () => {
    const f = groepFixture(basis, png),
      p = new Pakket(f.bytes);
    p.schrijf(
      f.pad,
      p
        .lees(f.pad)
        .replace(
          '<a:chExt cx="952500" cy="857250"/>',
          '<a:chExt cx="0" cy="857250"/>',
        ),
    );
    const [o] = leesTekenobjecten(p.inpakken());
    expect(o.soort).toBe("onbekend");
    expect(p.lees(f.pad)).toContain(f.shape);
  });
});
