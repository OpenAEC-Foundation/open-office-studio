/** De invoerwachtrij is intern; voer de vastgezette, gepatchte callbacks zelf uit. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bron = readFileSync(new URL("../../node_modules/@betteroffice/docx-react/dist/index.mjs", import.meta.url), "utf8");
const begin = '(h,H="selection",z,X,se=H==="mutation")=>';
const start = bron.indexOf(begin);
const einde = bron.indexOf('},[$,rr,n,i,qe,Xt,u,ce])', start);
const rij = bron.slice(start, einde + 1);
const voorbereidenBegin = 'async(h,H,z)=>{for(let X of z)';
const vstart = bron.indexOf(voorbereidenBegin);
const veinde = bron.indexOf('},[$])', vstart);
const voorbereiden = bron.slice(vstart, veinde + 1);

function proef() {
  if (start < 0 || einde < 0 || vstart < 0 || veinde < 0) throw new Error("De invoeradapter is veranderd; controleer de patch vóór de engine-update.");
  const et = { current: [] as { prepare: () => Promise<() => void>; apply?: () => void }[] };
  const taken: (() => unknown)[] = [];
  const wachtrij = { enqueue: (fn: () => unknown) => taken.push(fn), hasPending: () => taken.length > 0 };
  const rr = new Function("$", `return ${voorbereiden}`)(() => true);
  const W = new Function("et", "_", "rr", "u", "i", "G", "Xt", "xn", "wa", "$", "Yn", "n", "qe", "ce", "J", `return ${rij}`)(
    et, { current: wachtrij }, rr, { selection: () => null }, undefined,
    { current: null }, () => {}, { current: null }, () => false, () => true,
    { current: {} }, false, () => {}, () => () => {}, () => {},
  ) as (fn: () => unknown, soort?: string) => void;
  return { W, et, klaar: async () => { for (const fn of taken) await fn(); } };
}

describe("getypte tekst vóór een latere selectie", () => {
  it("haalt een later gemaakte selectie niet vóór al toegelaten tekstinvoer", async () => {
    const p = proef(), stappen: string[] = [];
    p.W(() => { stappen.push("tekst A op oude cursor"); }, "mutation");
    const selectie = { prepare: async () => { stappen.push("selectie voorbereiden"); return () => { stappen.push("selectie toepassen"); }; }, apply: undefined as (() => void) | undefined };
    p.et.current.push(selectie);
    p.W(() => selectie.apply?.(), "mutation");
    p.W(() => { stappen.push("tekst B op nieuwe selectie"); }, "mutation");
    await p.klaar();
    expect(stappen).toEqual(["tekst A op oude cursor", "selectie voorbereiden", "selectie toepassen", "tekst B op nieuwe selectie"]);
  });
  it("bewaart ook twee snel opeenvolgende selecties op hun eigen plek", async () => {
    const p = proef(), stappen: number[] = [];
    for (const n of [1, 2]) {
      p.W(() => { stappen.push(n * 10); }, "mutation");
      const selectie = { prepare: async () => () => { stappen.push(n); }, apply: undefined as (() => void) | undefined };
      p.et.current.push(selectie);
      p.W(() => selectie.apply?.(), "mutation");
    }
    await p.klaar();
    expect(stappen).toEqual([10, 1, 20, 2]);
  });
});
