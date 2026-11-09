import { describe, expect, it } from "vitest";
import {
  beeldGeometrie,
  beeldmaat,
  begrensBijsnijding,
  cmNaarPx,
  leesBijsnijding,
  leesTransform,
  maatBijVervangen,
  maatNaBijsnijden,
  metVerhouding,
  passendeMaat,
  pxNaarCm,
  sleepGreep,
} from "./logica";

describe("bijsnijden", () => {
  it("begrenst elke kant en laat minstens 5 % zichtbaar", () => {
    expect(begrensBijsnijding({ top: -1, right: 0.2, bottom: 2, left: 0 })).toEqual({ top: 0, right: 0.2, bottom: 0.95, left: 0 });
    const b = begrensBijsnijding({ top: 0, right: 0.6, bottom: 0, left: 0.6 });
    expect(b.left + b.right).toBeCloseTo(0.95, 3);
  });
  it("houdt de schaal: de weergavemaat volgt het zichtbare deel", () => {
    expect(maatNaBijsnijden(200, 100, { top: 0, right: 0, bottom: 0, left: 0 }, { top: 0.5, right: 0.25, bottom: 0, left: 0.25 })).toEqual({ breedte: 100, hoogte: 50 });
    expect(maatNaBijsnijden(100, 50, { top: 0.5, right: 0.25, bottom: 0, left: 0.25 }, { top: 0, right: 0, bottom: 0, left: 0 })).toEqual({ breedte: 200, hoogte: 100 });
  });
  it("versleept grepen en het kader", () => {
    const nul = { top: 0, right: 0, bottom: 0, left: 0 };
    expect(sleepGreep(nul, "no", -0.2, 0.1)).toEqual({ top: 0.1, right: 0.2, bottom: 0, left: 0 });
    expect(sleepGreep(nul, "zw", 0.1, -0.3)).toEqual({ top: 0, right: 0, bottom: 0.3, left: 0.1 });
    // Verplaatsen kan niet verder dan de rand.
    expect(sleepGreep({ top: 0.1, right: 0.2, bottom: 0.1, left: 0 }, "verplaats", 0.5, -0.5)).toEqual({ top: 0, right: 0, bottom: 0.2, left: 0.2 });
  });
  it("leest bijsnijding en transform uit de payload", () => {
    expect(leesBijsnijding({ cropTop: 0.1 })).toEqual({ top: 0.1, right: 0, bottom: 0, left: 0 });
    expect(leesTransform("rotate(90deg) scaleX(-1)")).toEqual({ draaiing: 90, horizontaal: true, verticaal: false });
  });
});

describe("afmeting", () => {
  it("houdt de verhouding vast", () => {
    expect(metVerhouding(200, 100, { breedte: 100 })).toEqual({ breedte: 100, hoogte: 50 });
    expect(metVerhouding(200, 100, { hoogte: 300 })).toEqual({ breedte: 600, hoogte: 300 });
  });
  it("past het oorspronkelijke formaat binnen de tekstbreedte", () => {
    expect(passendeMaat({ breedte: 1200, hoogte: 600 }, 600)).toEqual({ breedte: 600, hoogte: 300 });
  });
  it("behoudt bij vervangen beide exacte weergavematen, ongeacht de nieuwe beeldverhouding", () => {
    expect(maatBijVervangen(300.125, 150.0625, { breedte: 100, hoogte: 200 })).toEqual({ breedte: 300.125, hoogte: 150.0625 });
    expect(maatBijVervangen(150, 300, { breedte: 200, hoogte: 100 })).toEqual({ breedte: 150, hoogte: 300 });
  });
  it("vult ontbrekende maten aan met de nieuwe verhouding zonder een geldige maat te wijzigen", () => {
    expect(maatBijVervangen(300, NaN, { breedte: 100, hoogte: 200 })).toEqual({ breedte: 300, hoogte: 600 });
    expect(maatBijVervangen(0, 300, { breedte: 200, hoogte: 100 })).toEqual({ breedte: 600, hoogte: 300 });
    expect(maatBijVervangen(Infinity, 0, { breedte: 200, hoogte: 100 })).toEqual({ breedte: 200, hoogte: 100 });
  });
  it("rekent cm en pixels om", () => {
    expect(pxNaarCm(96)).toBe(2.54);
    expect(cmNaarPx(2.54)).toBeCloseTo(96);
  });
});

describe("geometrie voor de engine", () => {
  it("zet px om naar EMU en geeft alleen gewijzigde velden als other", () => {
    const g = beeldGeometrie(
      {
        width: 160,
        height: 80,
        wrapType: "square",
        distLeft: 10,
        position: { horizontal: { relativeTo: "column", posOffset: 0 }, vertical: { relativeTo: "paragraph", posOffset: 0 } },
      },
      { position: { horizontal: { relativeTo: "margin", align: "right" }, vertical: { relativeTo: "paragraph", posOffset: 360000 } }, alt: undefined },
    );
    expect(g).toMatchObject({
      widthEmu: 1524000,
      heightEmu: 762000,
      wrap: "square",
      hOffsetEmu: null,
      vOffsetEmu: 360000,
      distLeftEmu: 95250,
      relativeFromHorizontal: "margin",
      relativeFromVertical: "paragraph",
    });
    expect(g.other).toEqual({
      position: { horizontal: { relativeTo: "margin", align: "right" }, vertical: { relativeTo: "paragraph", posOffset: 360000 } },
      alt: null,
    });
  });
});

describe("beeldmaat uit bytes", () => {
  it("leest PNG, GIF en JPEG", () => {
    const png = new Uint8Array(32);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    png.set([0, 0, 1, 0, 0, 0, 0, 200], 16);
    expect(beeldmaat(png)).toEqual({ breedte: 256, hoogte: 200 });
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 40, 0, 20, 0, 0, 0]);
    expect(beeldmaat(gif)).toEqual({ breedte: 40, hoogte: 20 });
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0, 30, 0, 50, 3, 0, 0, 0]);
    expect(beeldmaat(jpeg)).toEqual({ breedte: 50, hoogte: 30 });
    expect(beeldmaat(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
