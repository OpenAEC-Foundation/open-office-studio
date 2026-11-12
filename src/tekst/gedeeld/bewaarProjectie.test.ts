import { readFileSync } from "node:fs";
import { beforeEach, expect, it, vi } from "vitest";
import { herstelBewaarProjectie } from "../../../scripts/tekstengine-compatibiliteit";
const haken = vi.hoisted(() => ({ ref: { current: undefined as unknown }, effecten: [] as (() => (() => void) | undefined)[] }));
vi.mock("react", () => ({ useRef: () => haken.ref, useLayoutEffect: (fn: () => (() => void) | undefined) => haken.effecten.push(fn) }));
import { volgBewaarProjectie, useBewaarProjectie } from "./bewaarProjectie";
const bron = readFileSync("node_modules/@betteroffice/docx-react/dist/index.mjs", "utf8");
function sessie() {
  const luisteraars = new Set<(update: unknown, oorsprong: string) => void>();
  return { oosBewaarUpdate: false, onUpdate(fn: (update: unknown, oorsprong: string) => void) {
    luisteraars.add(fn); return () => { luisteraars.delete(fn); };
  }, stuur(oorsprong = "remote") { for (const fn of luisteraars) fn(null, oorsprong); },
  adoptie() { this.oosBewaarUpdate = true; try { this.stuur(); } finally { this.oosBewaarUpdate = false; } },
  aantal: () => luisteraars.size };
}
function proef() {
  const s = sessie(), werk: (() => void)[] = [], meld = vi.fn(); let eigenaar = true;
  const stop = volgBewaarProjectie(s, meld, () => eigenaar, fn => werk.push(fn));
  return { s, meld, stop, sluit: () => { eigenaar = false; }, klaar: () => { while (werk.length) werk.shift()!(); } };
}
beforeEach(() => { haken.ref.current = undefined; haken.effecten.length = 0; });
it("bewaakt het exacte engineanker en de nieuwe aanroep", () => {
  const code = herstelBewaarProjectie(bron);
  expect(code).toContain('oosBewaarProjectie(r.session,wr,r.experimentalWorkerOpen,H);');
  expect(() => herstelBewaarProjectie("andere bron")).toThrow("bewaarprojectie");
  expect(() => herstelBewaarProjectie(bron + bron)).toThrow("bewaarprojectie");
  const aanroep = code.match(/oosBewaarProjectie\(r.session,wr,r.experimentalWorkerOpen,H\);/)![0];
  const hook = vi.fn(), s = sessie(), meld = vi.fn(), worker = vi.fn();
  new Function("oosBewaarProjectie", "r", "wr", "H", aanroep)(hook, { session: s, experimentalWorkerOpen: true }, meld, worker);
  expect(hook).toHaveBeenCalledWith(s, meld, true, worker);
});
it("toont de geneste lezing in de oorspronkelijke callback en voorkomt die tijdens adoptie", () => {
  let geleend = false;
  const geometrie = vi.fn(() => { if (geleend) throw new Error("Geneste geometrielezing"); });
  const origineel = bron.match(/useEffect\(\(\)=>\{let T=r.session;if\(T\)return T.onUpdate.*?\},\[wr,r.session\]\);/)![0];
  const oud = sessie(); let stop: (() => void) | undefined;
  new Function("useEffect", "r", "H", "wr", origineel)((fn: () => () => void) => { stop = fn(); }, { session: oud }, () => false, geometrie);
  geleend = true; expect(() => oud.adoptie()).toThrow("Geneste geometrielezing"); stop!();
  const nieuw = sessie(), werk: (() => void)[] = [];
  const ruimOp = volgBewaarProjectie(nieuw, geometrie, () => true, fn => werk.push(fn));
  expect(() => nieuw.adoptie()).not.toThrow(); expect(geometrie).toHaveBeenCalledTimes(1);
  geleend = false; werk.forEach(fn => fn()); expect(geometrie).toHaveBeenCalledTimes(2); ruimOp();
});
it("houdt gewone remote updates direct en negeert lokale meldingen", () => {
  const p = proef(); p.s.stuur(); expect(p.meld).toHaveBeenCalledOnce();
  p.s.stuur("local"); p.klaar(); expect(p.meld).toHaveBeenCalledOnce(); p.stop();
});
it("bundelt opeenvolgende bewaarupdates tot de laatste projectie", () => {
  const p = proef(); p.s.adoptie(); p.s.adoptie(); expect(p.meld).not.toHaveBeenCalled();
  p.klaar(); expect(p.meld).toHaveBeenCalledOnce(); p.stop();
});
it.each(["local", "remote"])("laat %s een wachtende adoptie vervangen", oorsprong => {
  const p = proef(); p.s.adoptie(); p.s.stuur(oorsprong); p.klaar();
  expect(p.meld).toHaveBeenCalledTimes(oorsprong === "remote" ? 1 : 0); p.stop();
});
it("weigert een oude eigenaar vóór opruiming", () => {
  const p = proef(); p.s.adoptie(); p.sluit(); p.klaar(); p.s.stuur(); expect(p.meld).not.toHaveBeenCalled(); p.stop();
});
it("ruimt de luisteraar op en annuleert wachtend werk", () => {
  const p = proef(); p.s.adoptie(); p.stop(); expect(p.s.aantal()).toBe(0); p.klaar(); expect(p.meld).not.toHaveBeenCalled();
});
it("verbergt geen directe of uitgestelde projectiefouten", () => {
  const s = sessie(), fout = new Error("Projectie mislukt"), werk: (() => void)[] = [];
  const stop = volgBewaarProjectie(s, () => { throw fout; }, () => true, fn => werk.push(fn));
  expect(() => s.stuur()).toThrow(fout); s.adoptie(); expect(() => werk[0]()).toThrow(fout); stop();
});
it("weigert oude sessies na render en blijft bij herladen opnieuw bruikbaar", async () => {
  const oud = sessie(), nieuw = sessie(), meld = vi.fn(), worker = () => false;
  useBewaarProjectie(oud, meld, false, worker); const stop = haken.effecten.shift()!()!; oud.adoptie();
  useBewaarProjectie(nieuw, meld, false, worker);
  await Promise.resolve(); expect(meld).not.toHaveBeenCalled(); stop();
  const nieuwStop = haken.effecten.shift()!()!; nieuw.adoptie(); await Promise.resolve();
  expect(meld).toHaveBeenCalledWith(true, "remote"); nieuwStop();
});
it("behoudt de workerguard en annuleert ook bij opnieuw koppelen van dezelfde sessie", async () => {
  const s = sessie(), meld = vi.fn(), worker = vi.fn(() => true);
  useBewaarProjectie(s, meld, true, worker); const stop = haken.effecten.shift()!()!;
  s.adoptie(); stop(); // De eerste StrictMode-levensduur mag niet meer publiceren.
  useBewaarProjectie(s, meld, true, worker); const stop2 = haken.effecten.shift()!()!;
  await Promise.resolve(); expect(worker).not.toHaveBeenCalled();
  s.stuur(); expect(worker).toHaveBeenCalledOnce(); expect(meld).not.toHaveBeenCalled(); stop2();
});
it("verwijdert de layoutbinding vóór een wachtende microtaak en verdraagt een ontbrekende sessie", async () => {
  const s = sessie(), meld = vi.fn(); useBewaarProjectie(s, meld, false, () => false);
  const stop = haken.effecten.shift()!()!; s.adoptie(); stop(); await Promise.resolve(); expect(meld).not.toHaveBeenCalled();
  useBewaarProjectie(null, meld, false, () => false); expect(haken.effecten.shift()!()).toBeUndefined();
});
