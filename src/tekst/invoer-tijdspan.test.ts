/** Voer de echte toelatings-/bundelcallback van de vastgezette SDK uit. */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const bron = readFileSync("node_modules/@betteroffice/docx-react/dist/index.mjs", "utf8");
const begin = bron.indexOf("U=useCallback((h,H,z=false)=>{"), einde = bron.indexOf(",Se=useCallback", begin);
if (begin < 0 || einde < 0) throw Error("Controleer de teksttoelating na een SDK-update");
const captureVenster = Number(bron.match(/\bzv=(\d+)/)?.[1]);
if (!Number.isFinite(captureVenster)) throw Error("Het bestaande capturevenster is niet gevonden");

function proef() {
  let nu = 100;
  const taken: (() => Promise<void>)[] = [];
  const positie = { story: "body", paraId: "alinea", offset: 0 };
  const native = vi.fn(async (..._args: unknown[]) => true);
  const context = {
    useCallback: (fn: unknown) => fn, Ue: { current: { reset: vi.fn() } }, u: {}, n: false,
    Ee: vi.fn(() => false), Nt: vi.fn(), ke: () => ({ anchor: positie, head: positie }),
    g: () => ({}), ea: () => ({ story: "body", start: positie, end: positie }),
    he: { current: new Map() }, G: { current: null }, Wl: () => true, f: false,
    k: undefined, _openaecNativeTekst: native, vt: () => undefined, $: () => true,
    yt: vi.fn(), dn: vi.fn(), i: undefined, kt: { current: null },
    W: (fn: () => Promise<void>) => { taken.push(fn); }, performance: { now: () => nu }, zv: captureVenster,
  };
  const U = new Function(...Object.keys(context), `return ${bron.slice(begin + 2, einde)}`)(...Object.values(context));
  return { U, native, taken, context, tijd(t: number) { nu = t; }, async klaar() { for (const fn of taken) await fn(); } };
}

describe("oorspronkelijke tijdspan van gewone native invoer", () => {
  it("bundelt snelle invoer met haar eerste en laatste toelatingstijd", async () => {
    const p = proef();
    p.U("A", 100); p.U("B", 120);
    expect(p.taken).toHaveLength(1);
    await p.klaar();
    expect(p.native.mock.calls.map(a => [a[2], a[5]])).toEqual([["AB", [100, 120]]]);
  });

  it("laat een echte pauze als twee bundels bestaan terwijl eerdere invoer nog wacht", async () => {
    const p = proef();
    p.U("A", 100); p.U("B", 1000);
    expect(p.taken).toHaveLength(2);
    await p.klaar();
    expect(p.native.mock.calls.map(a => [a[2], a[5]])).toEqual([["A", [100, 100]], ["B", [1000, 1000]]]);
  });

  it("legt ontbrekende tijd direct bij toelaten vast en niet bij uitvoeren", async () => {
    const p = proef();
    p.tijd(100); p.U("A"); p.tijd(120); p.U("B");
    p.tijd(5000); await p.klaar();
    expect(p.native.mock.calls.map(a => [a[2], a[5]])).toEqual([["AB", [100, 120]]]);
  });

  it("behoudt tijdspans van verdere invoer terwijl het eerste antwoord nog wacht", async () => {
    const p = proef();
    let los!: (v: boolean) => void;
    p.native.mockImplementationOnce(() => new Promise<boolean>(r => { los = r; }));
    p.U("A", 100);
    const bezig = p.taken.shift()!();
    p.U("B", 120); p.U("C", 130); p.U("D", 1000);
    expect(p.taken).toHaveLength(2);
    los(true); await bezig; await p.klaar();
    expect(p.native.mock.calls.map(a => [a[2], a[5]])).toEqual([
      ["A", [100, 100]], ["BC", [120, 130]], ["D", [1000, 1000]],
    ]);
  });
});
