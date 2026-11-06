/** Herhaal uitsluitend de vastgelegde eigen GUI-proef, met exacte antwoord- en DOCX-controles. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import assert from 'node:assert/strict';
import {createYrsSession,saveYrsDocx} from '@betteroffice/docx/yrs';
import {unzipSync} from 'fflate';
const ROOT=dirname(fileURLToPath(import.meta.url)),REPO=resolve(ROOT,'../../..');
const UIT=resolve(process.env.OFFICE_GUIREPLAY_UIT??REPO+'/.local/doorwerk-2026-11-06/guireplay/herhaling');
await mkdir(UIT,{recursive:false});
const MAP=REPO+'/.local/doorwerk-2026-11-06/guireplay';
const opnamebytes=await readFile(MAP+'/gui/opname.json'),opname=JSON.parse(opnamebytes),gui=JSON.parse(await readFile(MAP+'/gui/profiel.json','utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
assert(opnamebytes.length<=16*1024*1024);assert(gui.geslaagd&&gui.broncontrole.exact);assert.equal(opname.schema,1);assert(opname.ronden.length>1&&opname.ronden.length<=256);
const rondes=opname.ronden,eerste=rondes[0].aanvraag,snapshot=Buffer.from(eerste.snapshot,'base64');
const cijfersActief=process.argv.slice(2).length===1&&process.argv[2]==='--cijfers';
assert(process.argv.length===2||cijfersActief,'Gebruik zonder opties of --cijfers');
assert.equal(snapshot.length,5997678);assert.equal(sha(snapshot),eerste.snapshotSha256);
assert.equal(rondes.map(x=>x.aanvraag.text).join(''),gui.invoertekst);
for(const [i,{aanvraag:a,antwoord:b}]of rondes.entries()){
 assert.equal(a.schema,2);assert.equal(a.clientId,eerste.clientId);assert.equal(a.documentId,eerste.documentId);
 assert.equal(sha(Buffer.from(a.snapshot,'base64')),a.snapshotSha256);assert(!a.author,'Deze proef verwacht gewone tekst zonder revisie-auteur');
 for(const k of ['schema','requestId','documentId','sourceVersion','snapshotSha256','clientId'])assert.equal(b[k],a[k]);
 assert.equal(b.bronvector,a.sourceVector);assert(!b.retryFull);
 if(i){assert.equal(a.snapshot,rondes[i-1].antwoord.delta);assert.equal(a.basis,rondes[i-1].antwoord.basis)}else assert(!a.basis);
}
const docx=new Uint8Array(await readFile(REPO+'/docs/tests/writer-doortypen/bron.docx'));
async function sessie(){const s=await createYrsSession({clientId:eerste.clientId});s.openDocx(docx,false);s.applyUpdate(snapshot);s.beginUndoCapture();s.setUndoCaptureMode('manual');s.addUndoBoundary();s.setSelection(eerste.position);return s}
function canon(v){return Array.isArray(v)?v.map(canon):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canon(v[k])])):v}
const stand=s=>canon(Object.fromEntries(s.storyIds().sort().map(id=>[id,s.storySegments(id)])));
const teksten=s=>Object.fromEntries(s.storyIds().sort().map(id=>[id,s.paragraphs(id).map(p=>p.text)]));
async function proces(exe,naam){
 let fout=null,stderr='',pending=null;
 const p=spawn(exe,[],{stdio:['pipe','pipe','pipe']}),close=once(p,'close');
 p.stderr.on('data',b=>{stderr+=b;if(stderr.length>2*1024*1024){fout=Error('Te veel fasegegevens');p.kill('SIGKILL')}});
 createInterface({input:p.stdout}).on('line',l=>{const t=pending;pending=null;if(!t){fout=Error('Onverwacht antwoord');return}try{t.resolve(JSON.parse(l))}catch(e){t.reject(e)}});
 p.on('error',e=>{fout=e;pending?.reject(e)});
 p.on('exit',code=>{if(code){fout=Error('Kernproces sluit met '+code);pending?.reject(fout)}});
 return{vraag(a){if(fout)throw fout;assert(!pending);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{p.kill('SIGKILL');reject(Error('Native antwoord ontbreekt'))},120000);pending={resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}};p.stdin.write(JSON.stringify(a)+'\n')})},async sluit(){p.stdin.end();const [code]=await close;await writeFile(UIT+'/'+naam+'-fasen.jsonl',stderr);assert.equal(code,0);if(fout)throw fout;return stderr.trim().split('\n').filter(Boolean).map(l=>JSON.parse(l))},afbreken(){p.kill('SIGTERM')}};
}
const referentie=await sessie(),voor=teksten(referentie);
assert.equal(Object.keys(voor).length,1537);assert.equal(Object.values(voor).flat().length,3329);
assert.equal(voor.body.at(-1),gui.voor);
const rapport={schema:1,script_sha256:sha(await readFile(fileURLToPath(import.meta.url))),opname_sha256:sha(opnamebytes),bron_sha256:sha(snapshot),bronbytes:snapshot.length,groepen:rondes.length,tekens:gui.invoertekst.length,scope:'Exacte aanvragen en antwoordbytes van één eigen fysieke GUI-proef. Geïsoleerde kernherhaling; geen desktop-/IPC-/FPS-acceptatie.',geslaagd:false,ronden:[]};
try{
 for(const {aanvraag:a}of rondes){assert.deepEqual(referentie.selection().head,a.position);const r=referentie.insertText(a.position,a.text);referentie.setSelection({story:r.range.story,...r.range.end})}
 referentie.addUndoBoundary();const verwacht=stand(referentie),verwachteTeksten=teksten(referentie),referentiedocx=(await saveYrsDocx(referentie,{updateModifiedDate:false})).bytes;
 assert.equal(verwachteTeksten.body.at(-1),gui.na);await writeFile(UIT+'/sdk.docx',referentiedocx);
 const programmas={referentie:{pad:REPO+'/native/onderzoek/writer-invoerfasen/.local/gemeten/office-writer-invoerprofiel',hash:'b0f1cbcc76e022dfcd24d362e4d2e5a78955f78de29553ac6edfdc082a9e9d07'},cache:{pad:REPO+'/native/onderzoek/writer-replicacache/.local/gemeten/office-writer-invoerprofiel',hash:'8ca9e1882b031707c22b64588ab43951375a9e547701e00fb54e68549ca9a0c3'}};
 if(cijfersActief){const b=JSON.parse(await readFile(MAP+'/cijfers/bouwen.json','utf8'));assert.equal(b.code,0);programmas.cijfers={pad:b.programma,hash:b.programma_sha256}}
 for(const naam of (cijfersActief?['cijfers']:['referentie-a','cache-a','cache-b','referentie-b'])){
  const spec=programmas[naam.split('-')[0]],binary=await readFile(spec.pad);assert.equal(sha(binary),spec.hash);
  const s=await sessie(),p=await proces(spec.pad,naam),metingen=[];
  try{
   for(const {aanvraag:a,antwoord:b}of rondes){
    const r=await p.vraag(a);assert.equal(r.ok,true);const q=r.antwoord;assert(q);
    const v={...q.resultaat,schema:2,basis:q.basis,bronvector:q.bronvector};delete v.preparationMs;
    const guiantwoord={...b};delete guiantwoord.preparationMs;assert.deepEqual(v,guiantwoord,'Native antwoord wijkt af van werkelijke GUI');
    s.applyLocalUpdate(Buffer.from(v.delta,'base64'));s.setSelection(v.caret);metingen.push(r.totaal_ns);
   }
   s.addUndoBoundary();assert.deepEqual(stand(s),verwacht);assert.deepEqual(teksten(s),verwachteTeksten);assert.deepEqual(s.selection(),referentie.selection());
   const na=stand(s);assert(s.undo());assert.deepEqual(teksten(s),voor);assert(s.redo());assert.deepEqual(stand(s),na);
   const bytes=(await saveYrsDocx(s,{updateModifiedDate:false})).bytes,z=unzipSync(bytes),zr=unzipSync(referentiedocx);
   assert.deepEqual(Object.keys(z).sort(),Object.keys(zr).sort());for(const n of Object.keys(z))assert.deepEqual(z[n],zr[n],'DOCX-onderdeel '+n);
   await writeFile(UIT+'/'+naam+'.docx',bytes);
   const h=await createYrsSession();try{h.openDocx(bytes,true);assert.deepEqual(teksten(h),verwachteTeksten)}finally{h.destroy()}
   const fasen=await p.sluit();assert.equal(fasen.length,2*rondes.length);const bronnen=fasen.filter(x=>x.soort==='bron');assert.equal(bronnen.length,rondes.length);assert.equal(bronnen.filter(x=>x.hergebruikt).length,rondes.length-1);
   const telling={};for(const x of fasen)for(const [n,ns]of x.fasen_ns){const k=x.soort+':'+n;telling[k]=(telling[k]??0)+ns}
   const encoder=cijfersActief?bronnen.map(x=>x.encoder):null;
   if(encoder){assert(encoder.every(x=>x&&x.gewicht<=x.grens&&x.grens===32*1024*1024));assert(encoder.slice(1).every((x,i)=>x.treffers>=encoder[i].treffers&&x.missers>=encoder[i].missers))}
   rapport.ronden.push({naam,encoder,programma_sha256:spec.hash,native_ns:metingen.reduce((a,b)=>a+b,0),metingen_ns:metingen,fasen_ns:telling,hergebruikt:bronnen.filter(x=>x.hergebruikt).length,antwoorden_bytegelijk_gui:true,verhalen_opmaak_identiteiten_selectie:true,undo_redo:true,docx_onderdelen:Object.keys(z).length,docx_onderdelen_bytegelijk:true,heropen_alle_teksten:true});console.log(naam,'geslaagd',flush(rapport.ronden.at(-1).native_ns));
  }catch(e){p.afbreken();throw e}finally{s.destroy()}
 }
 rapport.geslaagd=true;
}catch(e){rapport.fout=String(e);process.exitCode=1}
finally{referentie.destroy();await writeFile(UIT+'/rapport.json',JSON.stringify(rapport,null,2)+'\n');console.log(JSON.stringify({geslaagd:rapport.geslaagd,fout:rapport.fout}))}
function flush(v){return Math.round(v/1000000)+' ms'}
