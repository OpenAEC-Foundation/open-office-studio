/** Bewaar echte bronwijzigingen voordat de uitgestelde observer is afgeleverd. */
import {readFileSync} from 'node:fs';import {pathToFileURL} from 'node:url';
const basis=pathToFileURL(process.cwd()+'/');
const {preloadEditWasm,createEditSession}=await import(new URL('./node_modules/@betteroffice/docx/dist/chunk-KCROT4RD.mjs',basis));
const {t:verpak}=await import(new URL('./node_modules/@betteroffice/docx/dist/chunk-N5NWITJ6.mjs',basis));
const {saveYrsDocx}=await import('@betteroffice/docx/yrs');
await preloadEditWasm();const bron=readFileSync('docs/voorbeelden/Ontwerpnotitie.docx'),uit=[],log=[];
console.debug=(...args)=>log.push(args.map(String).join(' '));
for(const direct of [false,true]){
 const client=direct?981:980,raw=createEditSession(client),sessie=verpak(raw,client);sessie.openDocx(new Uint8Array(bron),true);
 try{const paraId=sessie.paragraphs('body')[0].paraId;let meldingen=0;const stop=sessie.onUpdate(()=>meldingen++);
  if(direct)raw.insert_text('body',paraId,0,'OPENAEC_RAW_SAVE_47 ',undefined,undefined);else sessie.insertText({story:'body',paraId,offset:0},'OPENAEC_RAW_SAVE_47 ');
  const voorBewaren=meldingen,opgeslagen=saveYrsDocx(sessie,{updateModifiedDate:false}),tijdensBewaren=meldingen;
  const {bytes}=await opgeslagen;uit.push({direct,voorBewaren,tijdensBewaren,naBewaren:meldingen,docx:Buffer.from(bytes).toString('base64')});stop();
 }finally{sessie.destroy()}
}
console.log(JSON.stringify({bron:bron.toString('base64'),uit,log}));
