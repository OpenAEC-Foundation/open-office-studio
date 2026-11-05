/** Voer de vastgezette echte Wasm uit in een apart proces, ook bij een oude kapotte borrow. */
import { spawnSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';
type Geval = Record<string, unknown> & {naam:string};
let gevallen: Geval[];
beforeAll(() => {
  const r=spawnSync(process.execPath,['tests/fixtures/observer-levensduur.mjs'],{encoding:'utf8',timeout:20_000,maxBuffer:1024*1024});
  if(r.status!==0)throw Error(`Wasm-proef start niet: ${r.error??r.stderr.slice(-1800)}`);
  gevallen=JSON.parse(r.stdout).gevallen;
},30_000);
function geval(naam:string){const g=gevallen.find(g=>g.naam===naam);if(!g)throw Error(`Geval ontbreekt: ${naam}`);return g}
describe('Wasm-updatecallback en sessielevensduur',()=>{
  for(const actie of ['afmelden','vernietigen'])for(const rechtstreeks of [false,true]){
    it(`${actie} vanuit een ${rechtstreeks?'rechtstreekse':'verpakte'} updatecallback`,()=>{
      const g=geval(actie+(rechtstreeks?'-rechtstreeks':'-verpakt'));
      expect(g.callbackfout).toBeUndefined();expect(g.mutatiefout).toBeUndefined();expect(g.opruimfout).toBeUndefined();
      expect(g.callbackGeslaagd).toBe(true);expect(g.naMicrotaak).toBe(true);expect(g.synchroon).toBe(!rechtstreeks);
    });
  }
  for(const actie of ['afmelden','vernietigen'])it(`${actie} vóór een uitgestelde melding`,()=>{
    const g=geval(actie+'-voor-microtaak');expect(g.fout).toBeUndefined();expect(g.opruimfout).toBeUndefined();expect(g.afgerond).toBe(true);expect(g.aanroepen).toBe(0);
  });
  it('behoudt beide deltas, hun herkomst, bronvector en alle verhaalteksten',()=>{
    const g=geval('deltavolgorde');expect(g.fout).toBeUndefined();expect(g.opruimfout).toBeUndefined();expect(g.synchroon).toBe(0);
    expect(g.herkomsten).toEqual(['local','local']);expect(g.deltaLengtes).toHaveLength(2);expect((g.deltaLengtes as number[]).every(n=>n>0)).toBe(true);expect(g.vectorGelijk).toBe(true);expect(g.tekstenGelijk).toBe(true);
  });
  it('levert een geneste update eenmaal af en laat de laatste luisteraar veilig afmelden',()=>{
    const g=geval('geneste-update');expect(g.fout).toBeUndefined();expect(g.callbackfout).toBeUndefined();expect(g.opruimfout).toBeUndefined();expect(g.afgerond).toBe(true);expect(g.aanroepen).toBe(2);
  });
});
