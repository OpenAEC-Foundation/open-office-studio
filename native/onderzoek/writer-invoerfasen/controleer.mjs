/** Werkelijke kern/SDK-vergelijking op een eigen vaste bron; geen GUI-snelheidsclaim. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createWriteStream } from 'node:fs';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { createYrsSession, saveYrsDocx } from '@betteroffice/docx/yrs';
import { unzipSync } from 'fflate';
const ROOT=dirname(fileURLToPath(import.meta.url)),REPO=resolve(ROOT,'../../..'),UIT=resolve(process.env.OFFICE_INVOER_UIT??ROOT+'/.local/proef');
await mkdir(UIT,{recursive:false});
const bron=new Uint8Array(await readFile(REPO+'/docs/tests/writer-doortypen/bron.docx'));
const tekst=' Deze langere proefzin controleert of alle nieuwe tekens in de juiste volgorde verschijnen tijdens doorgaande invoer.'.repeat(3);
const sha=b=>createHash('sha256').update(b).digest('hex');
function canon(v){return Array.isArray(v)?v.map(canon):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canon(v[k])])):v;}
function stand(s){return canon(Object.fromEntries(s.storyIds().sort().map(id=>[id,s.storySegments(id)])));}
function mini(s){return Object.fromEntries(s.storyIds().sort().map(id=>[id,s.paragraphs(id).map(p=>p.text)]));}
const cid=20264562,basis=await createYrsSession({clientId:20264561});basis.openDocx(bron,true);
const snapshot=basis.encodeStateAsUpdate(),laatste=basis.paragraphs('body').at(-1),positie={story:'body',paraId:laatste.paraId,offset:basis.paragraphSpans('body').find(p=>p.paraId===laatste.paraId).length};
const voor=mini(basis);assert.equal(Object.keys(voor).length,1537);assert.equal(Object.values(voor).flat().length,3329);basis.destroy();
async function sessie(){const s=await createYrsSession({clientId:cid});s.openDocx(bron,false);s.applyUpdate(snapshot);s.beginUndoCapture();s.setUndoCaptureMode('manual');s.addUndoBoundary();s.setSelection(positie);return s;}
const stukken=Array.from({length:68},(_,i)=>tekst.slice(Math.floor(i*tekst.length/68),Math.floor((i+1)*tekst.length/68)));
assert.ok(stukken.every(Boolean));assert.equal(stukken.join(''),tekst);
async function proces(variant,naam){
 const programma=ROOT+'/.local/'+variant+'/office-writer-invoerprofiel',log=createWriteStream(UIT+'/'+naam+'-stderr.jsonl',{flags:'wx'});
 const p=spawn(programma,[],{stdio:['pipe','pipe','pipe']}),wacht=[],gesloten=once(p,'close');let fout=null;
 p.stderr.pipe(log);const regels=createInterface({input:p.stdout});regels.on('line',regel=>{const taak=wacht.shift();if(!taak){fout=Error('Onverwacht antwoord');return;}try{taak.resolve(JSON.parse(regel));}catch(e){taak.reject(e);}});
 p.on('error',e=>{fout=e;for(const t of wacht.splice(0))t.reject(e);});
 p.on('exit',code=>{if(code!==0){fout=Error('Proefproces sluit met '+code);for(const t of wacht.splice(0))t.reject(fout);}});
 return {programma,sha:sha(await readFile(programma)),vraag(a){if(fout)throw fout;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{p.kill('SIGKILL');reject(Error('Native antwoord ontbreekt'));},120000);wacht.push({resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});p.stdin.write(JSON.stringify(a)+'\n');});},async sluit(){p.stdin.end();const [code]=await gesloten;if(!log.writableFinished)await once(log,'finish');assert.equal(code,0);if(fout)throw fout;},afbreken(){p.kill('SIGTERM');}};
}
function aanvraag(s,cache,text,nummer){const bytes=s.encodeStateAsUpdate(cache?.vector);return {schema:2,basis:cache?.basis??null,requestId:'proef-'+nummer,documentId:'proef',sourceVersion:s.version(),snapshotSha256:sha(bytes),snapshot:Buffer.from(bytes).toString('base64'),sourceVector:Buffer.from(s.encodeStateVector()).toString('base64'),clientId:cid,position:s.selection().head,text,author:null};}
function neem(s,a,r){assert.equal(r.ok,true);assert.ok(r.antwoord);const q=r.antwoord,v=q.resultaat;for(const k of ['requestId','documentId','sourceVersion','snapshotSha256','clientId'])assert.equal(v[k],a[k],k);assert.equal(q.bronvector,a.sourceVector);assert.match(q.basis,/^[0-9a-f]{64}$/);assert.equal(v.schema,1);const cache={basis:q.basis,vector:Buffer.from(q.bronvector,'base64')};s.applyLocalUpdate(Buffer.from(v.delta,'base64'));s.setSelection(v.caret);return cache;}
const rapport={schema:1,bron_sha256:sha(bron),groepen:68,tekens:tekst.length,scope:'Afzonderlijke kernproef met synthetische groepen van dezelfde tekst. Geen exacte herhaling van GUI-batchgrenzen, geen Tauri/IPC/worker- of tekenmeting.',varianten:{},geslaagd:false};
const ref=await sessie();
try{
 for(const t of stukken){const r=ref.insertText(ref.selection().head,t);ref.setSelection({story:r.range.story,...r.range.end});}
 ref.addUndoBoundary();const verwacht=stand(ref),verwachteTeksten=mini(ref),refdocx=(await saveYrsDocx(ref,{updateModifiedDate:false})).bytes;await writeFile(UIT+'/referentie.docx',refdocx);
 for(const variant of ['basis','gemeten']){
  const s=await sessie(),p=await proces(variant,variant);let cache=null;const metingen=[];
  try{
   for(const [i,t]of stukken.entries()){const a=aanvraag(s,cache,t,i);const r=await p.vraag(a);cache=neem(s,a,r);metingen.push({ronde:i,totaal_ns:r.totaal_ns,rust_ms:r.antwoord.resultaat.preparationMs});}
   s.addUndoBoundary();assert.deepEqual(stand(s),verwacht,'Alle verhalen, opmaak en identiteiten');assert.deepEqual(mini(s),verwachteTeksten,'Alle alinea- en celteksten');assert.deepEqual(s.selection(),ref.selection());
   const na=stand(s);assert.equal(s.undo(),true);assert.deepEqual(mini(s),voor);assert.equal(s.redo(),true);assert.deepEqual(stand(s),na);
   const bytes=(await saveYrsDocx(s,{updateModifiedDate:false})).bytes;await writeFile(UIT+'/'+variant+'.docx',bytes);const z=unzipSync(bytes),zr=unzipSync(refdocx);assert.deepEqual(Object.keys(z).sort(),Object.keys(zr).sort());for(const n of Object.keys(z))assert.deepEqual(z[n],zr[n],'DOCX-onderdeel '+n);
   const heropen=await createYrsSession();try{heropen.openDocx(bytes,true);assert.equal(heropen.paragraphs('body').at(-1).text,laatste.text+tekst);}finally{heropen.destroy();}
   await p.sluit();rapport.varianten[variant]={programma_sha256:p.sha,metingen,alle_verhalen_opmaak_identiteiten:true,alle_teksten:true,selectie:true,undo_redo:true,docx_onderdelen:Object.keys(z).length,docx_onderdelen_bytegelijk:true,heropende_laatste_alinea:true,bronvector:Buffer.from(s.encodeStateVector()).toString('base64')};
  }catch(e){p.afbreken();throw e;}finally{s.destroy();}
 }
 assert.equal(rapport.varianten.basis.bronvector,rapport.varianten.gemeten.bronvector,'Vectoren van identieke kern met/zonder klokken');
 // Echte afwijzingen met aansluitende geldige invoer; los van de profielreeks.
 for(const variant of ['basis','gemeten']){
  const s=await sessie(),p=await proces(variant,variant+'-afwijzingen');let cache=null;
  try{
   for(const [i,soort]of ['schema','hash','basis','vector'].entries()){
    const a=aanvraag(s,cache,'A',i),bad={...a};
    if(soort==='schema')bad.schema=9;if(soort==='hash')bad.snapshotSha256='0'.repeat(64);if(soort==='basis')bad.basis='f'.repeat(64);if(soort==='vector')bad.sourceVector='AA==';
    const r=await p.vraag(bad);if(soort==='basis'){assert.equal(r.ok,true);assert.equal(r.antwoord,null);}else assert.equal(r.ok,false);
    cache=neem(s,a,await p.vraag(a));
   }
   const verwacht={...voor,body:[...voor.body]};verwacht.body[verwacht.body.length-1]+='AAAA';assert.deepEqual(mini(s),verwacht);await p.sluit();rapport.varianten[variant].afwijzingen_met_geldige_vervolginvoer=4;
  }catch(e){p.afbreken();throw e;}finally{s.destroy();}
 }
 const regels=(await readFile(UIT+'/gemeten-stderr.jsonl','utf8')).trim().split('\n').filter(Boolean).map(x=>JSON.parse(x));assert.equal(regels.length,136);assert.equal(regels.filter(x=>x.soort==='bron').length,68);assert.equal(regels.filter(x=>x.soort==='invoeging').length,68);
 const fasen={};for(const r of regels)for(const [naam,ns]of r.fasen_ns){const k=r.soort+':'+naam;fasen[k]??={aantal:0,ns:0,max_ns:0};fasen[k].aantal++;fasen[k].ns+=ns;fasen[k].max_ns=Math.max(fasen[k].max_ns,ns);}
 rapport.fasen=fasen;rapport.cachehergebruik=regels.filter(x=>x.soort==='bron'&&x.hergebruikt).length;assert.equal(rapport.cachehergebruik,67);
 assert.equal((await readFile(UIT+'/basis-stderr.jsonl')).length,0);rapport.geslaagd=true;
}catch(e){rapport.fout=String(e);process.exitCode=1;}
finally{ref.destroy();await writeFile(UIT+'/rapport.json',JSON.stringify(rapport,null,2)+'\n');console.log(JSON.stringify({geslaagd:rapport.geslaagd,fout:rapport.fout,cachehergebruik:rapport.cachehergebruik,fasen:rapport.fasen}));}
