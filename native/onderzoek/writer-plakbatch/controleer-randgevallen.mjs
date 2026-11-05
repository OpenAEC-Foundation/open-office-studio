import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createYrsSession,applyClipboardFragment,readTableFragment,saveYrsDocx} from '@betteroffice/docx/yrs';
import {vergelijkRevisies} from './revisie-identiteiten.mjs';
import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
const map=(process.env.OFFICE_PLAKBATCH_UIT??'native/onderzoek/writer-plakbatch/.local')+'/randgevallen';await mkdir(map,{recursive:true});
const bytes=new Uint8Array(await readFile('docs/voorbeelden/Ontwerpnotitie.docx'));
function canon(v){return Array.isArray(v)?v.map(canon):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canon(v[k])])):v}
function som(v){return createHash('sha256').update(JSON.stringify(canon(v))).digest('hex')}
function stand(s){return Object.fromEntries(s.storyIds().sort().map(story=>[story,s.storySegments(story)]))}
const punt=(p,offset)=>({paraId:p.paraId,offset});
const cases=[
 {naam:'begin',offset:0}, {naam:'midden',offset:9}, {naam:'einde',offset:'einde'},
 {naam:'deelselectie',offset:2,end:13}, {naam:'meer-alineas',offset:3,volgende:2,end:5},
 {naam:'unicode-midden',offset:2,unicode:true}, {naam:'unicode-grens',offset:3,unicode:true},
 {naam:'lege-alineas',offset:7,leeg:true}, {naam:'enkele-tabel',offset:0,tabel:true},
 {naam:'tabel-na-tekst',offset:7,tabel:true}, {naam:'geneste-tabel',offset:4,genest:true},
 {naam:'celtekst',offset:1,cel:true}, {naam:'tabel-in-cel',offset:1,cel:true,tabel:true},
 {naam:'afbeelding',offset:8,image:true}, {naam:'afbeelding-na-tabel',offset:0,image:true,tabel:true},
 {naam:'leeg-fragment',offset:4,end:9,geen:true},
 {naam:'bladwijzer-begin',offset:0,bookmark:true}, {naam:'bladwijzer-midden',offset:6,bookmark:true},
 {naam:'bladwijzer-selectie',offset:3,volgende:2,end:5,bookmark:true},
 {naam:'bladwijzer-tabel',offset:4,bookmark:true,tabel:true}, {naam:'bladwijzer-afbeelding',offset:5,bookmark:true,image:true},
 {naam:'revisie-tekst',offset:4,author:true}, {naam:'revisie-selectie',offset:3,volgende:2,end:5,author:true},
 {naam:'revisie-tabel',offset:3,author:true,tabel:true}, {naam:'revisie-afbeelding',offset:3,author:true,image:true},
 {naam:'vorige-revisie',offset:3,author:true,tracksource:true},
 {naam:'revisie-genest',offset:3,author:true,genest:true,bookmark:true},
 {naam:'lege-inline',offset:4,inlines:['','A😀','',' na','']},
 {naam:'inline-na-tabel',offset:0,tabel:true,inlines:['','Voor 😀','',' na']},
 {naam:'inline-in-cel',offset:1,cel:true,inlines:['','A😀','é','']},
 {naam:'revisie-lege-inline',offset:3,author:true,inlines:['','Nieuw 😀','',' na']},
 {naam:'bladwijzer-einde',offset:'einde',bookmark:true},
 {naam:'bladwijzer-einde-revisie',offset:'einde',bookmark:true,author:true},
 {naam:'bladwijzer-einde-tabel',offset:'einde',bookmark:true,tabel:true},
 {naam:'einde-lege-inline',offset:'einde',inlines:['','','A😀','']},
 {naam:'einde-afbeelding',offset:'einde',image:true},
 {naam:'einde-tabel',offset:'einde',tabel:true},
 {naam:'cel-einde',offset:'einde',cel:true},
 {naam:'cel-einde-revisie',offset:'einde',cel:true,author:true},
 {naam:'laatste-alinea-einde',offset:'einde',laatste:true},
 {naam:'laatste-alinea-einde-revisie',offset:'einde',laatste:true,author:true},
];
const resultaten={scope:'Gegevens-/DOCX-proeven van private Rust-batch; geen GUI of productacceptatie.',gevallen:[]};
for(const c of cases){
 const bron=await createYrsSession({clientId:20264520}),ref=await createYrsSession({clientId:20264524}),native=await createYrsSession({clientId:20264525});
 const uit={naam:c.naam};
 try{
  let bronbytes=bytes;
  if(c.bookmark){const pakket=unzipSync(bytes);let xml=strFromU8(pakket['word/document.xml']);const oud=xml;xml=xml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:pPr>/,m=>m+'<w:bookmarkStart w:id="99" w:name="ProefMarkering"/>').replace('</w:p>','<w:bookmarkEnd w:id="99"/></w:p>');assert.notEqual(xml,oud);pakket['word/document.xml']=strToU8(xml);bronbytes=zipSync(pakket);}
  bron.openDocx(bronbytes,true);bron.beginUndoCapture();
  const eerste=bron.paragraphs('body')[0];
  bron.insertText({story:'body',paraId:eerste.paraId,offset:0},'tijdelijk');
  bron.deleteRange({story:'body',start:punt(eerste,0),end:punt(eerste,9)});
  if(c.tracksource)bron.insertText({story:'body',paraId:eerste.paraId,offset:0},'Vorige ',{name:'Proefauteur',date:'2026-11-03T08:00:00Z'});
  if(c.unicode)bron.insertText({story:'body',paraId:eerste.paraId,offset:0},'A😀é ');
  bron.setHyperlink({story:'body',start:punt(eerste,0),end:punt(eerste,8)},{href:'https://example.org/proef',tooltip:'Behouden koppeling'});
  bron.formatRange({story:'body',start:punt(eerste,0),end:punt(eerste,8)},{bold:true,color:{rgb:'AB1234'}});
  const story=c.cel?bron.storyIds().find(id=>id!=='body'):'body';
  const paras=bron.paragraphs(story),basis=c.laatste?paras.length-1:0,p=paras[basis],q=paras[basis+(c.volgende??0)];
  const offset=c.offset==='einde'?p.text.length:c.offset;
  const range={story,start:punt(p,offset),end:punt(q,c.end??offset)};
  const table=readTableFragment(bron,{story:'body',tableIndex:0});
  if(c.genest){const child=structuredClone(table);table.rows[0].cells[0].content=[{kind:'text',text:'Voor 😀',attributes:{bold:true}},{kind:'pilcrow',properties:{}},{kind:'table',table:child,attributes:{}},{kind:'pilcrow',properties:{}}];}
  const image={src:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',widthEmu:914400,heightEmu:457200,rId:'bron-rId',id:'bron-id',docPrId:12};
  const fragment={paragraphs:c.geen?[]:c.leeg?[{text:''},{text:''},{text:'Einde 😀'}]:[{text:'Nieuw 😀 é',...((c.tabel||c.genest)?{tables:[table]}:{}),...(c.image?{inlines:[{text:'Voor '},{image},{text:' na'}]}:{})},{text:'Tweede alinea'},{text:''}]};
  if(c.inlines)fragment.paragraphs[0].inlines=c.inlines.map(text=>({text}));
  const snapshot=bron.encodeStateAsUpdate(),voor=som(stand(bron)),bestaandeRevisies=new Set(bron.listRevisions().map(r=>r.revisionId));
  for(const s of [ref,native]){s.openDocx(bronbytes,false);s.applyUpdate(snapshot);s.beginUndoCapture();s.setUndoCaptureMode('manual');s.addUndoBoundary();assert.equal(som(stand(s)),voor);}
  const author=c.author?{name:'Proefauteur',date:'2026-11-03T09:00:00Z'}:undefined;const caret=applyClipboardFragment(ref,range,fragment,author);ref.addUndoBoundary();const na=som(stand(ref));
  const aanvraag=map+'/'+c.naam+'-verzoek.json',antwoord=map+'/'+c.naam+'-uitvoer.json';
  await writeFile(aanvraag,JSON.stringify({snapshot:Buffer.from(snapshot).toString('base64'),range,fragment,clientId:20264524,author}));
  const run=spawnSync(process.env.OFFICE_PLAKBATCH_BIN??'native/onderzoek/writer-plakbatch/.local/target/release/office-plakverkenning',[aanvraag,antwoord],{env:{...process.env,OFFICE_EEN_TRANSACTIE:'1'},encoding:'utf8',timeout:120000,maxBuffer:1024*1024});
  await writeFile(map+'/'+c.naam+'-native.log',(run.stdout??'')+(run.stderr??''));assert.equal(run.status,0,run.stderr);
  const out=JSON.parse(await readFile(antwoord));native.applyLocalUpdate(Buffer.from(out.delta,'base64'));native.addUndoBoundary();
  await writeFile(map+'/'+c.naam+'-standen.json',JSON.stringify({referentie:stand(ref),native:stand(native)}));
  const bijectie=vergelijkRevisies(stand(ref),stand(native),bestaandeRevisies,20264524),nativeNa=som(stand(native));uit.revisie_id_bijectie=bijectie;const terugId=new Map(bijectie.map(x=>[x.native,x.referentie]));assert.deepEqual(native.listRevisions().map(r=>({...r,revisionId:terugId.get(r.revisionId)??r.revisionId})),ref.listRevisions(),'Revisieauteurs, rollen, verhalen en bereiken');assert.deepEqual(out.caret,caret,'Cursor');
  for(const s of [ref,native]){if(na!==voor){assert.equal(s.undo(),true);assert.equal(som(stand(s)),voor,'Undo');assert.equal(s.redo(),true);assert.equal(som(stand(s)),s===native?nativeNa:na,'Redo');}}
  const ar=(await saveYrsDocx(ref,{updateModifiedDate:false})).bytes,an=(await saveYrsDocx(native,{updateModifiedDate:false})).bytes;
  await writeFile(map+'/'+c.naam+'-referentie.docx',ar);await writeFile(map+'/'+c.naam+'-native.docx',an);
  const zr=unzipSync(ar),zn=unzipSync(an);assert.deepEqual(Object.keys(zn).sort(),Object.keys(zr).sort(),'Pakketonderdelen');
  for(const name of Object.keys(zr))assert.deepEqual(zn[name],zr[name],'DOCX-onderdeel '+name);
  const terug=await createYrsSession();try{terug.openDocx(an,true);assert.equal(terug.paragraphs(story).map(p=>p.text).join('|'),native.paragraphs(story).map(p=>p.text).join('|'),'Heropenen');}finally{terug.destroy();}
  uit.geslaagd=true;uit.verhalen_opmaak_bestaande_identiteiten=true;uit.cursor=true;uit.undo_redo=true;uit.docx_alle_onderdelen_exact=true;uit.heropenen=true;uit.native_ms=out.toepassen_ms;
 }catch(e){uit.geslaagd=false;uit.fout=String(e);}
 finally{bron.destroy();ref.destroy();native.destroy();resultaten.gevallen.push(uit);console.log(JSON.stringify(uit));await writeFile(map+'/rapport.json',JSON.stringify(resultaten,null,2)+'\n');}
}
resultaten.geslaagd=resultaten.gevallen.every(x=>x.geslaagd);await writeFile(map+'/rapport.json',JSON.stringify(resultaten,null,2)+'\n');if(!resultaten.geslaagd)process.exitCode=1;
