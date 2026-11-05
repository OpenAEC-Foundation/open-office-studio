import { TWIPS_PER_PX } from "./model";

interface Celgrens { col: number; colSpan: number; x: number; w: number; exact: boolean }

/** Kolomgrepen volgen de getekende breedte, ook bij een ingepaste tabel. */
export function getekendRaster(breedtes: readonly number[], oorsprong: number, cellen: readonly Celgrens[]) {
  const cumulatief = [0];
  for (const b of breedtes) cumulatief.push(cumulatief[cumulatief.length - 1] + b);
  const terug = () => ({ raster: [...breedtes], lijnen: cumulatief.map((x) => oorsprong + x / TWIPS_PER_PX) });
  const grenzen = new Map<number, number[]>();
  const voegToe = (i: number, x: number) => {
    if (i < 0 || i >= cumulatief.length || !Number.isFinite(x)) return;
    const lijst = grenzen.get(i) ?? [];
    lijst.push(x); grenzen.set(i, lijst);
  };
  for (const c of cellen) {
    if (!c.exact || !(c.w > 0)) continue;
    voegToe(c.col, c.x); voegToe(c.col + c.colSpan, c.x + c.w);
  }
  const bekend = [...grenzen].map(([i, xs]) => {
    const reeks = [...xs].sort((a, b) => a - b);
    return { i, x: reeks[Math.floor(reeks.length / 2)] };
  }).sort((a, b) => a.i - b.i);
  if (bekend.length < 2 || bekend.some((p, i) => i > 0 && p.x <= bekend[i - 1].x)) return terug();
  const lijnen = cumulatief.map((v, i) => {
    const exact = bekend.find((p) => p.i === i);
    if (exact) return exact.x;
    const volgende = bekend.findIndex((p) => p.i > i);
    const rechts = volgende < 0 ? bekend.length - 1 : Math.max(1, volgende);
    const a = bekend[rechts - 1], b = bekend[rechts];
    const lengte = cumulatief[b.i] - cumulatief[a.i];
    return lengte > 0 ? a.x + (b.x - a.x) * (v - cumulatief[a.i]) / lengte : NaN;
  });
  if (lijnen.some((x, i) => !Number.isFinite(x) || (i > 0 && x <= lijnen[i - 1]))) return terug();
  return { lijnen, raster: lijnen.slice(1).map((x, i) => Math.round((x - lijnen[i]) * TWIPS_PER_PX)) };
}
