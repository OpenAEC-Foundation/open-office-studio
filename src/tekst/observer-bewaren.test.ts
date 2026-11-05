/** Onafhankelijke ZIP-controle op bewaren vóór observeraflevering. */
import {spawnSync} from 'node:child_process';
import {unzipSync} from 'fflate';
import {beforeAll,expect,it} from 'vitest';
type Bewaring={direct:boolean;voorBewaren:number;tijdensBewaren:number;naBewaren:number;docx:string};
let bron:Record<string,Uint8Array>,uit:Bewaring[];
beforeAll(()=>{
 const r=spawnSync(process.execPath,['tests/fixtures/observer-bewaren.mjs'],{encoding:'utf8',timeout:20_000,maxBuffer:1024*1024});
 if(r.status!==0)throw Error(`Bewaarproef start niet: ${r.error??r.stderr.slice(-1800)}`);
 const resultaat=JSON.parse(r.stdout.trim().split('\n').at(-1)!);bron=unzipSync(Buffer.from(resultaat.bron,'base64'));uit=resultaat.uit;
},30_000);
it('bewaart terwijl de melding van de interne mutatie nog niet is afgeleverd',()=>{
 expect(uit.map(r=>[r.direct,r.voorBewaren])).toEqual([[false,1],[true,0]]);
 expect(uit.map(r=>r.naBewaren)).toEqual([1,1]);
});
it('behoudt alle oorspronkelijke pakketonderdelen en de daadwerkelijk ingevoegde hoofdtekst',()=>{
 for(const r of uit){const delen=unzipSync(Buffer.from(r.docx,'base64'));expect(Object.keys(delen).sort()).toEqual(Object.keys(bron).sort());
  expect(new TextDecoder().decode(delen['word/document.xml'])).toMatch(/<w:t(?:\s[^>]*)?>[^<]*OPENAEC_RAW_SAVE_47 /);
 }
});
it('schrijft vóór de melding precies dezelfde onderdeelbytes als de gewone bewaarroute',()=>{
 const [a,b]=uit.map(r=>unzipSync(Buffer.from(r.docx,'base64')));expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
 for(const naam of Object.keys(a))expect(Buffer.from(a[naam]).equals(Buffer.from(b[naam])),naam).toBe(true);
});
