import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';import {spawnSync} from 'node:child_process';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const map=process.env.OFFICE_PLAKBATCH_UIT??'native/onderzoek/writer-plakbatch/.local',uitmap=map+'/afwijzingen';await mkdir(uitmap,{recursive:true});const basis=JSON.parse(await readFile(map+'/randgevallen/begin-verzoek.json'));
const gevallen=[
 ['onbekende-alinea',r=>r.range.start.paraId='ontbreekt'],
 ['offset-buiten-alinea',r=>r.range.end.offset=10000000],
 ['tabel-zonder-rijen',r=>r.fragment={paragraphs:[{text:'',tables:[{grid:[],rows:[]}]}]}],
 ['afbeelding-geen-data',r=>r.fragment={paragraphs:[{text:'',inlines:[{image:{src:'https://example.org/proef.png'}}]}]}],
 ['afbeelding-beschermd-veld',r=>r.fragment={paragraphs:[{text:'',inlines:[{image:{src:'data:image/png;base64,AA==',_kind:'table'}}]}]}],
 ['afbeelding-negatieve-maat',r=>r.fragment={paragraphs:[{text:'',inlines:[{image:{src:'data:image/png;base64,AA==',widthEmu:-1}}]}]}],
 ['late-tekstfout',r=>r.fragment={paragraphs:[{text:'Eerst geldig'},{text:'Regel\neinde ongeldig'}]}],
 ['ontbrekende-tekst',r=>r.fragment={paragraphs:[{}]}],
];
const rapport={scope:'Private foutafhandeling; een mislukte voorbereidingsopdracht levert geen gedeeltelijke delta op. Geen host-/GUI-acceptatie.',gevallen:[]};
for(const [naam,pas] of gevallen){const r=structuredClone(basis);pas(r);const bron=r.snapshot;const p=uitmap+'/'+naam;await writeFile(p+'-verzoek.json',JSON.stringify(r));const proc=spawnSync(process.env.OFFICE_PLAKBATCH_BIN??'native/onderzoek/writer-plakbatch/.local/target/release/office-plakverkenning',[p+'-verzoek.json',p+'-uitvoer.json'],{env:{...process.env,OFFICE_EEN_TRANSACTIE:'1'},encoding:'utf8',timeout:120000,maxBuffer:1024*1024});assert.notEqual(proc.status,0,naam);assert.equal(await stat(p+'-uitvoer.json').then(()=>true,e=>e.code==='ENOENT'?false:Promise.reject(e)),false,naam);assert.equal(JSON.parse(await readFile(p+'-verzoek.json')).snapshot,bron);await writeFile(p+'-native.log',(proc.stdout??'')+(proc.stderr??''));rapport.gevallen.push({naam,exitcode:proc.status,geen_gedeeltelijke_delta:true,bron_sha256:createHash('sha256').update(Buffer.from(bron,'base64')).digest('hex'),fout:proc.stderr.trim()});}
rapport.geslaagd=true;await writeFile(uitmap+'/rapport.json',JSON.stringify(rapport,null,2)+'\n');console.log(JSON.stringify({geslaagd:true,gevallen:rapport.gevallen.length}));
