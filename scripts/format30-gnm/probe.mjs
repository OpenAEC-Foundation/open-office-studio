/** Production P2 input/engine + canonical private converter; no native UI claim. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,mkdtemp,readFile,realpath,rm,writeFile} from 'node:fs/promises';
import {basename,dirname,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {initWasm,openWorkbook} from '@betteroffice/xlsx';
import {converteerProef} from '../formaatconversie-proef.mjs';

const APP='dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b', TREE='5a644e397ecc6af5452a49b6404edf953687d1b2';
const SOURCE='0ae783979ec180a4a6378d9b6c43ae5af05b47e5a5d18b26dea72e4fa1ed6be6';
const SOURCE_URL='https://raw.githubusercontent.com/LibreOffice/core/92c170f11d44857d8e365f2e29fb449dfb567ff5/sc/qa/unit/data/gnumeric/universal-content.gnumeric';
const MARKER='GNM30 EDIT',hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const python=process.env.OOS_RUNTIME_PYTHON||(process.platform==='win32'?'python':'python3');
assert.equal(process.env.GITHUB_ACTIONS,'true','Real converter execution is disposable CI only');
assert.equal(git('rev-parse','HEAD'),APP);assert.equal(git('rev-parse','HEAD^{tree}'),TREE);
assert.equal(git('status','--porcelain','--untracked-files=no'),'');
assert.equal(process.env.OPENAEC_CONVERSIE_PROGRAMMA,undefined);assert.equal(process.env.OPENAEC_CONVERSIE_PROFIEL,undefined);
const [manifestPath,artifactRoot,output]=process.argv.slice(2);assert(manifestPath&&artifactRoot&&output);
const plan=JSON.parse(await readFile(manifestPath,'utf8'));assert.equal(plan.frozen,true);assert.equal(plan.applicationCommit,APP);assert.equal(plan.applicationTree,TREE);
const verified=JSON.parse(await readFile(join(artifactRoot,'verified.json'),'utf8'));
assert.equal(verified.applicationCommit,APP);assert.equal(verified.applicationTree,TREE);assert.equal(verified.desktopRun,45143305147);
assert.deepEqual(verified.packages,plan.artifact.packages);assert.equal(verified.archiveSha256,plan.artifact.archiveSha256);
assert.equal(hash(await readFile(fileURLToPath(new URL('../formaatconversie-proef.mjs',import.meta.url)))),hash(await readFile('scripts/formaatconversie-proef.mjs')),'Conversion helper must be exact P2 production test helper');
const root=resolve(output);await mkdir(root);const sourcePath=join(root,'source.gnumeric');
const response=await fetch(SOURCE_URL,{signal:AbortSignal.timeout(30000)});assert(response.ok);
const fixture=new Uint8Array(await response.arrayBuffer());assert.equal(fixture.length,2062);assert.equal(hash(fixture),SOURCE);
await writeFile(sourcePath,fixture,{flag:'wx'});
const oracle=fileURLToPath(new URL('oracle.py',import.meta.url));
execFileSync(python,['-B',oracle,'--source',sourcePath,'--report',join(root,'source-oracle.json')],{stdio:'inherit',timeout:20000});
const expected=JSON.parse(await readFile(join(root,'source-oracle.json'),'utf8')).sheets;
const report={applicationCommit:APP,applicationTree:TREE,version:'2026.48.1',desktopRun:45143305147,
 harnessCommit:process.env.OOS_FORMAT30_GNM_HARNESS,platform:process.platform,source:{url:SOURCE_URL,bytes:2062,sha256:SOURCE},
 artifact:verified,cases:[],status:'failed',scope:'Production TypeScript dispatch + exact canonical extracted private converter + production engine; not native Rust IPC/file-dialogue/visual proof'};
let loader;
try{
 await initWasm(await readFile('node_modules/@betteroffice/xlsx/dist/generated/xlsx_wasm_bg.wasm'));
 loader=await createServer({configFile:false,appType:'custom',cacheDir:join(root,'vite-cache'),optimizeDeps:{noDiscovery:true},server:{middlewareMode:true,hmr:false,watch:null}});
 await loader.ssrLoadModule('/src/i18n/testopzet.ts');
 const {bereidOpenen}=await loader.ssrLoadModule('/src/import/openen.ts');const formats=await loader.ssrLoadModule('/src/formaten.ts');
 for(const ext of ['gnumeric','gnm'])assert(formats.bestandstypen.xlsx.invoer.includes(ext));
 const oldWindow=globalThis.window;
 try{
  globalThis.window={};
  await assert.rejects(bereidOpenen('Source.gnm',fixture,{runtimeBeschikbaar:async()=>false,converteer:formats.converteer}),error=>/GNM/.test(error.message)&&/desktop/i.test(error.message)&&/XLSX/.test(error.message));
  report.sourceLevelBrowserGuard=true;
 }finally{if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;}
 function assertCells(book,marker=false){
  const info=book.sheetInfo();assert.equal(info.sheetIds.length,2);
  for(let index=0;index<expected.length;index++)for(const [where,value]of Object.entries(expected[index].cells)){
   const cells=book.readCells({ranges:[{sheetId:info.sheetIds[index],range:{kind:'a1',a1:where}}]});assert(cells.ok,where);
   const actual=cells.ranges[0].cells[0][0].value;assert.equal(actual.kind,value.kind==='string'?'text':'number',where);assert.equal(actual.value,value.value,where);
  }
  if(marker){const cell=book.readCells({ranges:[{sheetId:info.sheetIds[1],range:{kind:'a1',a1:'A1'}}]});assert(cell.ok);assert.deepEqual(cell.ranges[0].cells[0][0].value,{kind:'text',value:MARKER});}
 }
 for(const pkg of verified.packages){
  const caseRoot=join(root,pkg.kind);await mkdir(caseRoot);
  const base=await realpath(tmpdir()),temp=await mkdtemp(join(base,'oos-format30-gnm-'));
  const item={kind:pkg.kind,packageSha256:pkg.sha256,status:'failed',extensions:[]};report.cases.push(item);
  try{
   const packagePath=join(artifactRoot,'packages',pkg.path);assert.equal(hash(await readFile(packagePath)),pkg.sha256);
   execFileSync(python,['-B','scripts/pak-runtimeproef-uit.py',packagePath,join(temp,'payload'),join(caseRoot,'package.json')],{stdio:'inherit',timeout:180000});
   const payload=JSON.parse(await readFile(join(caseRoot,'package.json'),'utf8'));assert.equal(payload.packageSha256,pkg.sha256);
   item.runtimeVersion=execFileSync(payload.program,['--version'],{encoding:'utf8',windowsHide:true,timeout:20000}).trim();assert(item.runtimeVersion.includes('26.8.2.2'));
   item.profileSha256=hash(await readFile('src-tauri/src/conversieprofiel.xcu'));
   for(const ext of ['gnumeric','gnm']){
    const dir=join(caseRoot,ext);await mkdir(dir);const result={ext,status:'failed'};item.extensions.push(result);let calls=0;
    const opened=await bereidOpenen(`Source.${ext}`,fixture,{runtimeBeschikbaar:async()=>true,converteer:async(bytes,from,to,module)=>{
     assert.equal(from,ext);assert.equal(to,'xlsx');assert.equal(module,'xlsx');calls++;
     return(await converteerProef(payload.program,bytes,from,to,formats.bestandstypen.xlsx.uitvoer.xlsx.filter,dir)).bytes;
    }});
    assert.equal(calls,1);assert(opened&&opened.soort==='xlsx'&&opened.naam.endsWith('.xlsx'));
    const converted=join(dir,'converted.xlsx'),saved=join(dir,'saved.xlsx'),reopened=join(dir,'reopened.xlsx');
    await writeFile(converted,opened.bytes);
    execFileSync(python,['-B',oracle,'--source',sourcePath,'--xlsx',converted,'--report',join(dir,'converted-oracle.json')],{stdio:'inherit',timeout:20000});
    const book=openWorkbook(opened.bytes);let savedBytes;
    try{assertCells(book);book.editCell(1,0,0,MARKER);assertCells(book,true);savedBytes=book.save();}finally{book.dispose();}
    await writeFile(saved,savedBytes);const again=openWorkbook(savedBytes);
    try{assertCells(again,true);await writeFile(reopened,again.save());}finally{again.dispose();}
    for(const [file,stage]of [[saved,'saved'],[reopened,'reopened']])execFileSync(python,['-B',oracle,'--source',sourcePath,'--xlsx',file,'--marker','--report',join(dir,stage+'-oracle.json')],{stdio:'inherit',timeout:20000});
    assert.equal(hash(await readFile(sourcePath)),SOURCE);assert.equal(hash(fixture),SOURCE);
    Object.assign(result,{status:'passed',sourceUnchanged:true,expectedTypedCells:8,expectedFormulas:4,sheetCount:2,secondSheetMarkerSavedReopened:true,
     convertedSha256:hash(opened.bytes),savedSha256:hash(savedBytes),reopenedSha256:hash(await readFile(reopened))});
   }
   item.status='passed';
  }finally{const target=await realpath(temp);assert.equal(dirname(target),base);assert(basename(target).startsWith('oos-format30-gnm-'));await rm(target,{recursive:true,force:true});item.temporaryDisposed=true;}
 }
 assert.equal(git('status','--porcelain','--untracked-files=no'),'');report.dataAndRoutePassed=true;
}catch(error){report.error=String(error.stack||error);throw error;}
finally{
 let cleanupError;try{if(loader)await loader.close();report.loaderClosed=true;}catch(error){cleanupError=error;report.cleanupError=String(error);}
 report.status=report.dataAndRoutePassed&&report.loaderClosed&&!report.error?'passed':'failed';
 await writeFile(join(root,'report.json'),JSON.stringify(report,null,2)+'\n');if(cleanupError)throw cleanupError;
}
