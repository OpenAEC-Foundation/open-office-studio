/** Real private conversion + exact P5 WASM + save/new-process reopen.
 * The original native-source oracle is unchanged. This is not native GUI/IPC.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { createServer } from 'vite';
import { initWasm, openWorkbook } from '@betteroffice/xlsx';

const APP='b696ab86bd1c128729a079b68c0082e6df3d36a5';
const ROOT=path.resolve('.local/issue381');
const buildDeadline=(Number(process.env.OOS_381_DISPATCH_EPOCH)+2100)*1000;
const budget=maximum=>{assert(Number.isFinite(buildDeadline)&&Date.now()<buildDeadline,'Absolute build/test deadline expired');return Math.min(maximum,buildDeadline-Date.now());};
const ORACLE='qa/issue381/original-oracle/oracle.py';
const config=JSON.parse(fs.readFileSync('qa/issue381/original-oracle/fixture.json'));
const oracle=JSON.parse(fs.readFileSync(path.join(ROOT,'inputs/source-oracle.json')));
const sourcePath=path.join(ROOT,'inputs/source.wq2');
const hash=b=>createHash('sha256').update(b).digest('hex');
const write=(file,data)=>fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');
const same=(expected,actual)=>expected.kind===actual.kind && (expected.kind==='number'
  ?Math.abs(Number(expected.value)-Number(actual.value))<=1e-9:expected.value===actual.value);
const coord=a=>({row:Number(a.slice(1))-1,col:a.charCodeAt(0)-65});
assert.equal(process.platform,'linux');assert.equal(process.env.GITHUB_ACTIONS,'true');
budget(1);
assert.equal(hash(fs.readFileSync(sourcePath)),config.source.sha256);
execFileSync('git',['diff','--exit-code',APP,'--','src','src-tauri','vendor','packages','assets','public','package.json','pnpm-lock.yaml']);
const appTree=execFileSync('git',['rev-parse',APP+'^{tree}'],{encoding:'utf8'}).trim();
assert.equal(appTree,'e30879fd772871e690847c061ef66e6b81808a05');
const read=(book,a)=>{
  const result=book.readCells({ranges:[{sheetId:book.sheetInfo().sheetIds[0],range:{kind:'a1',a1:a}}]});
  assert(result.ok);return result.ranges[0].cells[0][0].value;
};
function verify(book,edited=false,textEdited=false){
  let constants=0;
  for(const [address,cell] of Object.entries(oracle.cells)){
    if('nativeIndex' in cell)continue;
    const value=edited&&address===config.edit.cell?config.edit.value
      :textEdited&&address===config.edit.textCell?config.edit.textValue:cell.value;
    assert(same({kind:cell.kind,value},read(book,address)),`Source constant ${address}`);constants++;
  }
  assert.equal(constants,57);
  const values={};
  for(const [address,expected] of Object.entries(edited?oracle.expectedAfter:oracle.expectedBefore)){
    values[address]=read(book,address);
    assert(same(expected,values[address]),`Native source typed expectation ${address}: ${JSON.stringify(values[address])}`);
    const {row,col}=coord(address);
    assert.equal(book.cell(0,row,col).input.replace(/^=/,'').toUpperCase(),oracle.cells[address].expectedModernFormula.toUpperCase());
  }
  return {constantsChecked:constants,values,edited,textEdited};
}
function independent(directory,name,edited=false,expectPass=true){
  fs.copyFileSync(path.join(ROOT,'inputs/source-oracle.json'),path.join(directory,'source-oracle.json'));
  const args=[ORACLE,'xlsx','--xlsx',path.join(directory,name+'.xlsx'),'--out',directory,...(edited?['--edited']:[])];
  const child=spawnSync('python3',args,{encoding:'utf8'});
  fs.writeFileSync(path.join(directory,name+'-oracle.stdout'),child.stdout??'');
  fs.writeFileSync(path.join(directory,name+'-oracle.stderr'),child.stderr??'');
  const result=JSON.parse(fs.readFileSync(path.join(directory,name+'-independent.json')));
  assert.equal(result.sourceImportAcceptance,expectPass);
  assert.equal(child.status,expectPass?0:1);
  assert.equal(result.checkedPopulatedCells,61);assert.equal(result.checkedOriginalFormulas,4);
  return result;
}
const wasm=fs.readFileSync('vendor/rekenbladengine/xlsx_wasm_bg.wasm');
assert.equal(hash(wasm),JSON.parse(fs.readFileSync('patches/rekenbladengine-lange-ketens.json')).wasmSha256);
await initWasm(wasm);
if(process.argv[2]==='--fresh'){
  const saved=process.argv[3],output=process.argv[4],parentPid=Number(process.argv[5]);
  assert(parentPid>0&&parentPid!==process.pid);
  const book=openWorkbook(fs.readFileSync(saved));
  try {
    const values=verify(book,true,true);
    fs.writeFileSync(path.join(output,'reopened.xlsx'),book.save());
    const xml=independent(output,'reopened',true);
    write(path.join(output,'fresh-process.json'),{pid:process.pid,parentPid,applicationCommit:APP,
      engineWasmSha256:hash(wasm),savedSha256:hash(fs.readFileSync(saved)),values,independentXmlPass:xml.sourceImportAcceptance});
  } finally {book.dispose();}
  process.exit(0);
}

const output=path.join(ROOT,'real-proof');fs.mkdirSync(output,{recursive:true});
const report={applicationCommit:APP,applicationTree:appTree,version:'2026.48.1',
  harnessCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),pid:process.pid,
  engineWasmSha256:hash(wasm),sourceSha256:hash(fs.readFileSync(sourcePath)),
  passed:false,phases:[],nativeGui:false,realTauriIpc:false,browserGui:false};
let loader,book;
try {
  for(const variant of ['packaged','rebuilt-control']){
    const directory=path.join(output,variant);fs.mkdirSync(directory,{recursive:true});
    const child=spawnSync('python3',['qa/issue381/convert_real.py','--variant',variant,'--out',directory],{encoding:'utf8',timeout:budget(180000)});
    fs.writeFileSync(path.join(directory,'driver.stdout'),child.stdout??'');
    fs.writeFileSync(path.join(directory,'driver.stderr'),child.stderr??'');
    assert.equal(child.status,0,child.stderr);
    const baseline=independent(directory,'converted',false,false);
    assert.deepEqual(Object.values(baseline.importedModernColumnIndices),[1,2,3,4]);
    report.phases.push({variant,expectedStrictFailure:true,sourceImportAcceptance:baseline.sourceImportAcceptance,
      converter:JSON.parse(fs.readFileSync(path.join(directory,'converter-report.json')))});
  }
  loader=await createServer({configFile:false,appType:'custom',optimizeDeps:{noDiscovery:true,include:[]},
    server:{middlewareMode:true,hmr:false,watch:null}});
  const {bereidOpenen}=await loader.ssrLoadModule('/src/import/openen.ts');
  await (await loader.ssrLoadModule('/src/i18n/config.ts')).default.changeLanguage('en');
  let conversions=0;
  const candidate=path.join(output,'patched');fs.mkdirSync(candidate,{recursive:true});
  const opened=await bereidOpenen(config.source.filename,fs.readFileSync(sourcePath),{
    runtimeBeschikbaar:async()=>true,
    converteer:async(bytes,from,to,kind)=>{
      assert.equal(hash(bytes),config.source.sha256);assert.deepEqual([from,to,kind],['wq2','xlsx','xlsx']);conversions++;
      const child=spawnSync('python3',['qa/issue381/convert_real.py','--variant','patched','--out',candidate],{encoding:'utf8',timeout:budget(180000)});
      fs.writeFileSync(path.join(candidate,'driver.stdout'),child.stdout??'');
      fs.writeFileSync(path.join(candidate,'driver.stderr'),child.stderr??'');
      assert.equal(child.status,0,child.stderr);
      return fs.readFileSync(path.join(candidate,'converted.xlsx'));
    }
  });
  assert.equal(conversions,1);assert(opened);assert.equal(opened.soort,'xlsx');assert.equal(opened.naam,'TESTLU.xlsx');
  assert.equal(opened.exportFormaat??opened.soort,'xlsx');assert.equal(opened.gewijzigd,true);
  report.openResult={name:opened.naam,kind:opened.soort,recommendedSave:opened.exportFormaat??opened.soort,
    dirty:opened.gewijzigd,sha256:hash(opened.bytes)};
  const converted=independent(candidate,'converted');
  assert.deepEqual(Object.values(converted.importedModernColumnIndices),[2,3,4,5]);
  report.phases.push({variant:'patched',strictConvertedPass:true,
    converter:JSON.parse(fs.readFileSync(path.join(candidate,'converter-report.json')))});
  book=openWorkbook(opened.bytes);
  report.initial=verify(book);
  book.editCells(0,[{...coord(config.edit.cell),input:String(config.edit.value)}]);report.afterEdit=verify(book,true);
  book.undo();report.afterUndo=verify(book);
  book.redo();report.afterRedo=verify(book,true);
  book.editCells(0,[{...coord(config.edit.textCell),input:config.edit.textValue}]);report.afterTextEdit=verify(book,true,true);
  const saved=path.join(candidate,'saved.xlsx');fs.writeFileSync(saved,book.save());
  const savedOracle=independent(candidate,'saved',true);assert(savedOracle.sourceImportAcceptance);
  book.dispose();book=undefined;
  const fresh=spawnSync(process.execPath,['qa/issue381/engine_real.mjs','--fresh',saved,candidate,String(process.pid)],{encoding:'utf8',timeout:budget(90000)});
  fs.writeFileSync(path.join(candidate,'fresh-process.stdout'),fresh.stdout??'');
  fs.writeFileSync(path.join(candidate,'fresh-process.stderr'),fresh.stderr??'');
  assert.equal(fresh.status,0,fresh.stderr);
  report.freshProcess=JSON.parse(fs.readFileSync(path.join(candidate,'fresh-process.json')));
  assert.notEqual(report.freshProcess.pid,process.pid);
  assert.equal(hash(fs.readFileSync(sourcePath)),config.source.sha256);
  report.sourceUnchanged=true;report.savedSha256=hash(fs.readFileSync(saved));
  report.reopenedSha256=hash(fs.readFileSync(path.join(candidate,'reopened.xlsx')));report.passed=true;
} catch(error){report.failure=String(error.stack||error);throw error;}
finally {
  book?.dispose();await loader?.close();report.cleanup={engineDisposed:true,loaderClosed:true};
  write(path.join(output,'report.json'),report);
}
