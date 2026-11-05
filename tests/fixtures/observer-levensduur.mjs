/** Echte Wasm-callbacks mogen hun eigen abonnement en sessie veilig sluiten. */
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const basis=pathToFileURL(process.cwd()+'/');
const {preloadEditWasm,createEditSession}=await import(new URL('./node_modules/@betteroffice/docx/dist/chunk-KCROT4RD.mjs',basis));
const {t:verpak}=await import(new URL('./node_modules/@betteroffice/docx/dist/chunk-N5NWITJ6.mjs',basis));
await preloadEditWasm();
const bytes=new Uint8Array(readFileSync('docs/voorbeelden/Ontwerpnotitie.docx')),gevallen=[];
let client=910;
function maak(leeg=false){const id=client++,raw=createEditSession(id),sessie=verpak(raw,id);if(!leeg){sessie.openDocx(bytes,true);const p=sessie.paragraphs('body')[0];sessie.insertText({story:'body',paraId:p.paraId,offset:0},'Voorbereiding ')}return{raw,sessie}}
function opruimen(sessie,record){try{sessie.destroy()}catch(e){record.opruimfout=String(e)}}
for(const actie of ['afmelden','vernietigen'])for(const rechtstreeks of [false,true]){
 const record={naam:actie+(rechtstreeks?'-rechtstreeks':'-verpakt')};gevallen.push(record);const {raw,sessie}=maak();let stop,gedaan=false;
 stop=sessie.onUpdate(()=>{if(gedaan)return;gedaan=true;try{if(actie==='afmelden')stop();else sessie.destroy();record.callbackGeslaagd=true}catch(e){record.callbackfout=String(e)}});
 try{const id=sessie.paragraphs('body')[0].paraId;if(rechtstreeks)raw.insert_text('body',id,0,'B',undefined,undefined);else sessie.insertText({story:'body',paraId:id,offset:0},'A');record.synchroon=gedaan;await Promise.resolve();record.naMicrotaak=gedaan}catch(e){record.mutatiefout=String(e)}finally{opruimen(sessie,record)}
}
for(const actie of ['afmelden','vernietigen']){
 const record={naam:actie+'-voor-microtaak',aanroepen:0};gevallen.push(record);const {raw,sessie}=maak();const stop=sessie.onUpdate(()=>record.aanroepen++);
 try{raw.insert_text('body',sessie.paragraphs('body')[0].paraId,0,'C',undefined,undefined);if(actie==='afmelden')stop();else sessie.destroy();await Promise.resolve();record.afgerond=true}catch(e){record.fout=String(e)}finally{opruimen(sessie,record)}
}
{
 const record={naam:'deltavolgorde',herkomsten:[],deltaLengtes:[]};gevallen.push(record);const {raw,sessie}=maak(),{sessie:spiegel}=maak(true);
 try{spiegel.applyUpdate(sessie.encodeStateAsUpdate());const stop=sessie.onUpdate((update,herkomst)=>{record.herkomsten.push(herkomst);record.deltaLengtes.push(update.length);spiegel.applyUpdate(update)});const id=sessie.paragraphs('body')[0].paraId;raw.insert_text('body',id,0,'A',undefined,undefined);raw.insert_text('body',id,1,'B',undefined,undefined);record.synchroon=record.deltaLengtes.length;await Promise.resolve();record.vectorGelijk=Buffer.from(sessie.encodeStateVector()).equals(Buffer.from(spiegel.encodeStateVector()));const teksten=s=>Object.fromEntries(s.storyIds().map(id=>[id,s.paragraphs(id).map(p=>p.text)]));record.tekstenGelijk=JSON.stringify(teksten(sessie))===JSON.stringify(teksten(spiegel));stop()}catch(e){record.fout=String(e)}finally{opruimen(sessie,record);opruimen(spiegel,record)}
}
{
 const record={naam:'geneste-update',aanroepen:0};gevallen.push(record);const {raw,sessie}=maak();const id=sessie.paragraphs('body')[0].paraId;let stop;stop=sessie.onUpdate(()=>{record.aanroepen++;try{if(record.aanroepen===1)raw.insert_text('body',id,1,'B',undefined,undefined);else stop()}catch(e){record.callbackfout=String(e)}});
 try{raw.insert_text('body',id,0,'A',undefined,undefined);await Promise.resolve();await Promise.resolve();record.afgerond=true}catch(e){record.fout=String(e)}finally{opruimen(sessie,record)}
}
console.log(JSON.stringify({gevallen},null,2));
