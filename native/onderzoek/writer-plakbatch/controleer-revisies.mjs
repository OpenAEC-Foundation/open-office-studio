/** Controleer onafhankelijke native/SDK-revisies in de levende engine en na DOCX-heropenen. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {unzipSync,strFromU8} from 'fflate';
import {createYrsSession,saveYrsDocx} from '@betteroffice/docx/yrs';
const root=process.env.OFFICE_REVISIES_UIT??'native/onderzoek/writer-plakbatch/.local/revisies';
const protocol=process.env.OFFICE_TEKST_PROTOCOL_BIN??'native/target/debug/examples/tekst_protocol';
// Een bestaande uitvoermap wordt bewust niet overschreven.
mkdirSync(dirname(root),{recursive:true});
mkdirSync(root);
const hash=b=>createHash('sha256').update(b).digest('hex');
const fixture=readFileSync('docs/voorbeelden/Ontwerpnotitie.docx');
const s=await createYrsSession({clientId:21});s.openDocx(new Uint8Array(fixture),true);
const texts=u=>Object.fromEntries(u.storyIds().map(id=>[id,u.paragraphs(id).map(p=>p.text)]));
const origineel=texts(s), paragraphs=s.paragraphs('body'), first=paragraphs[0].paraId,last=paragraphs.at(-1).paraId;
const resultaten=[];
function native(auteur,para,tekst,stap){
 const snapshot=s.encodeStateAsUpdate();
 const aanvraag={schema:1,requestId:`revisie-${stap}`,documentId:'eigen-wasm-revisieproef',sourceVersion:String(s.version()),snapshotSha256:hash(snapshot),snapshot:Buffer.from(snapshot).toString('base64'),clientId:s.clientId,position:{story:'body',paraId:para,offset:0},text:tekst,author:{name:auteur,date:'2026-11-04T00:00:00Z'}};
 const input=`${root}/${stap}-aanvraag.json`,output=`${root}/${stap}-antwoord.json`;
 writeFileSync(input,JSON.stringify(aanvraag));
 const p=spawnSync(protocol,[input,output],{encoding:'utf8'});
 assert.equal(p.status,0,p.stderr);
 assert.equal(hash(s.encodeStateAsUpdate()),hash(snapshot),'Voorbereiding verandert de bron niet');
 const antwoord=JSON.parse(readFileSync(output,'utf8'));s.applyLocalUpdate(new Uint8Array(Buffer.from(antwoord.delta,'base64')));
}
try{
 native('Auteur A',first,'NATIVE-A ',1);
 native('Auteur B',last,'NATIVE-B ',2);
 const authors=s.listRevisions().filter(r=>r.author==='Auteur A'||r.author==='Auteur B');
 assert.equal(authors.length,2);assert.notEqual(authors[0].revisionId,authors[1].revisionId);
 s.insertText({story:'body',paraId:last,offset:s.paragraphSpans('body').find(p=>p.paraId===last).length},' SDK-C',{name:'Auteur C',date:'2026-11-04T01:00:00Z'});
 const revisions=s.listRevisions().filter(r=>r.author.startsWith('Auteur '));assert.equal(new Set(revisions.map(r=>r.revisionId)).size,3);
 const metRevisies=texts(s),saved=await saveYrsDocx(s);writeFileSync(`${root}/drie-auteurs.docx`,saved.bytes);
 // Lees auteurs en OOXML-identiteiten ook onafhankelijk van de documentengine.
 const xml=strFromU8(unzipSync(saved.bytes)['word/document.xml']);
 const xmlRevisies=[...xml.matchAll(/<w:ins\b([^>]*)>/g)].map(m=>({auteur:m[1].match(/w:author="([^"]+)"/)?.[1],id:m[1].match(/w:id="([^"]+)"/)?.[1]}));
 const xmlIds=['Auteur A','Auteur B','Auteur C'].map(a=>new Set(xmlRevisies.filter(r=>r.auteur===a).map(r=>r.id)));
 for(const ids of xmlIds){assert.ok(ids.size>0);assert.ok(!ids.has(undefined));}
 for(let i=0;i<xmlIds.length;i++)for(let j=i+1;j<xmlIds.length;j++)for(const id of xmlIds[i])assert.ok(!xmlIds[j].has(id),'Auteurs delen geen OOXML-revisie-id');
 const heropen=await createYrsSession({clientId:22});
 try{
  heropen.openDocx(saved.bytes,true);assert.deepEqual(texts(heropen),metRevisies);
  for(const u of [s,heropen]){
   const r=u.listRevisions(),a=r.find(r=>r.author==='Auteur A'),b=r.find(r=>r.author==='Auteur B'),c=r.find(r=>r.author==='Auteur C');
   assert.ok(a&&b&&c);
   u.rejectChange({revisionId:a.revisionId});assert.equal(u.paragraphs('body').at(-1).text,metRevisies.body.at(-1));
   assert.equal(u.paragraphs('body')[0].text,origineel.body[0]);
   assert.ok(u.paragraphs('body').at(-1).text.startsWith('NATIVE-B '));assert.ok(u.paragraphs('body').at(-1).text.endsWith(' SDK-C'));
   u.rejectChange({revisionId:b.revisionId});assert.equal(u.paragraphs('body').at(-1).text,metRevisies.body.at(-1).replace('NATIVE-B ',''));assert.ok(u.paragraphs('body').at(-1).text.endsWith(' SDK-C'));
   u.rejectChange({revisionId:c.revisionId});assert.deepEqual(texts(u),origineel);
   resultaten.push({route:u===s?'levende-wasm':'docx-heropend',auteurs:3,alleTekstenHersteld:true});
  }
 } finally{heropen.destroy()}
 writeFileSync(`${root}/resultaat.json`,JSON.stringify({fixtureSha256:hash(fixture),protocolSha256:hash(readFileSync(protocol)),docxSha256:hash(saved.bytes),revisies:revisions,xmlRevisies,resultaten},null,2));
 console.log(JSON.stringify(resultaten));
}finally{s.destroy()}
