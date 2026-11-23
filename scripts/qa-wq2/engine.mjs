/** Linux CI: keep strict native semantics and downstream imported-formula evidence distinct. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createServer} from 'vite';
import {initWasm,openWorkbook} from '@betteroffice/xlsx';

assert.equal(process.platform,'linux','Office and core engine execution restricted to Linux CI');
const config=JSON.parse(fs.readFileSync('scripts/qa-wq2/fixture.json','utf8'));
const out=path.resolve('.local/wq2-qa'),sourcePath=path.join(out,'source.wq2'),source=fs.readFileSync(sourcePath);
const sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(sha(source),config.source.sha256);
assert.equal(execFileSync('git',['rev-parse',`${config.application.commit}^{tree}`],{encoding:'utf8'}).trim(),config.application.tree);
execFileSync('git',['diff','--exit-code',config.application.commit,'--','src','src-tauri','vendor','packages','assets','public','patches','package.json','pnpm-lock.yaml','versie.json','vite.config.ts']);
const oracle=JSON.parse(fs.readFileSync(path.join(out,'source-oracle.json'),'utf8'));
const routeOnly=process.argv.includes('--route-only');
const report={application:config.application,harnessCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  source:config.source,checks:[],fullFormatAcceptance:false,
  limits:[config.source.coverageLimit,'Private headless CLI adapter, actual production helper and actual pinned WASM; no packaged native UI/installer or real Tauri IPC acceptance.',
    'Browser negative production-function check in Node, not actual hosted browser UI. Windows/macOS not executed.',
    'Historical author report is independent source context, not this probe\u2019s reproduced result. No visual/native reproduction claim.'],nativeEngineObservations:[]};
const loader=await createServer({configFile:false,appType:'custom',server:{middlewareMode:true,hmr:false,watch:null},optimizeDeps:{noDiscovery:true,include:[]}});
const handles=[];
const coord=a=>({row:Number(a.slice(1))-1,col:a.charCodeAt(0)-65});
const equal=(expected,actual)=>expected.kind===actual.kind&&(expected.kind==='number'?Math.abs(Number(expected.value)-Number(actual.value))<=1e-9:expected.value===actual.value);
const independent=(stage,edited=false)=>{
  execFileSync('python3',['scripts/qa-wq2/oracle.py','xlsx','--xlsx',path.join(out,stage+'.xlsx'),'--diagnostic',...(edited?['--edited']:[])],{stdio:'inherit'});
  return JSON.parse(fs.readFileSync(path.join(out,stage+'-independent.json'),'utf8'));
};
try {
  const {bereidOpenen}=await loader.ssrLoadModule('/src/import/openen.ts');
  const formats=await loader.ssrLoadModule('/src/formaten.ts');
  const {isSjabloon}=await loader.ssrLoadModule('/src/import/sjabloon.ts');
  await (await loader.ssrLoadModule('/src/i18n/config.ts')).default.changeLanguage('en');
  assert.equal(isSjabloon(config.source.filename),false);
  const originalWindow=globalThis.window;
  try {
    globalThis.window={};const status=await formats.conversieStatus();assert.equal(status.gevonden,false);
    let error;try {await bereidOpenen(config.source.filename,source,{converteer:formats.converteer,runtimeBeschikbaar:async()=>false});}catch(e){error=e;}
    assert.ok(error&&/WQ2/.test(error.message)&&/XLSX/i.test(error.message),error?.message);
    report.browserLimit={method:'Actual P2 capability/open functions in Linux Node, empty window, no Tauri mock',status,error:error.message};
    report.checks.push('Production no-desktop policy rejects genuine WQ2 with concrete XLSX alternative.');
  } finally {if(originalWindow===undefined)delete globalThis.window;else globalThis.window=originalWindow;}
  if(!routeOnly) {
    assert.ok(process.env.OOS_WQ2_RUNTIME_BINDING);let count=0;
    const opened=await bereidOpenen(config.source.filename,source,{
      runtimeBeschikbaar:async()=>true,
      converteer:async(bytes,from,to,kind)=>{
        assert.equal(sha(bytes),config.source.sha256);assert.deepEqual([from,to,kind],['wq2','xlsx','xlsx']);count++;
        const converted=JSON.parse(execFileSync('python3',['scripts/qa-wq2/convert.py','--binding',process.env.OOS_WQ2_RUNTIME_BINDING,'--source',sourcePath,'--out',out],{encoding:'utf8',timeout:60_000}));
        return fs.readFileSync(converted.output);
      }
    });
    assert.equal(count,1);assert.ok(opened);assert.equal(opened.soort,'xlsx');assert.equal(opened.naam,'TESTLU.xlsx');
    assert.equal(opened.gewijzigd,true);assert.ok(!opened.alsNieuw);assert.equal(opened.exportFormaat??opened.soort,'xlsx');
    fs.writeFileSync(path.join(out,'open-result.json'),JSON.stringify({...opened,bytes:{length:opened.bytes.length,sha256:sha(opened.bytes)}},null,2));
    const converted=independent('converted');report.convertedOracle=converted;
    report.checks.push('Actual verified private converter invoked through P2 opening helper; independent comparison recorded before engine opening.');
    const wasm=fs.readFileSync('vendor/rekenbladengine/xlsx_wasm_bg.wasm');
    assert.equal(sha(wasm),JSON.parse(fs.readFileSync('patches/rekenbladengine-lange-ketens.json','utf8')).wasmSha256);
    report.engineWasmSha256=sha(wasm);await initWasm(wasm);
    const book=openWorkbook(opened.bytes);handles.push(book);
    const cfg=config.edit;
    const read=(h,a)=>{const r=h.readCells({ranges:[{sheetId:h.sheetInfo().sheetIds[0],range:{kind:'a1',a1:a}}]});assert.ok(r.ok);return r.ranges[0].cells[0][0].value;};
    const verifyConstants=(h,edited=false,textEdited=false)=>{
      assert.deepEqual(h.sheetInfo().sheetNames,converted.sheetNames);
      let n=0;
      for(const [a,c] of Object.entries(oracle.cells)) {
        if('nativeIndex' in c)continue;
        let value=edited&&a===cfg.cell?cfg.value:textEdited&&a===cfg.textCell?cfg.textValue:c.value;
        assert.ok(equal({kind:c.kind,value},read(h,a)),`Original non-formula cell ${a}`);n++;
      }
      assert.equal(n,57);
      for(const a of Object.keys(oracle.expectedBefore))
        assert.equal(h.cell(0,coord(a).row,coord(a).col).input.replace(/^=/,'').toUpperCase(),converted.cells[a].formula.toUpperCase(),`Engine retains emitted formula ${a}`);
    };
    const recordNative=(h,stage,edited)=>{
      const expected=edited?oracle.expectedAfter:oracle.expectedBefore;
      const values={},differences=[];
      for(const [a,e] of Object.entries(expected)) {values[a]=read(h,a);if(!equal(e,values[a]))differences.push({cell:a,expected:e,actual:values[a]});}
      const observation={stage,values,nativeExpected:expected,nativeSourceMatch:differences.length===0,differences};
      report.nativeEngineObservations.push(observation);return values;
    };
    const verifyImported=(h,edited)=>{
      const expected=edited?converted.expectedImportedFormulaResultsAfter:converted.expectedImportedFormulaResultsBefore;
      for(const [a,e] of Object.entries(expected))assert.ok(equal(e,read(h,a)),`Independently evaluated imported-modern formula ${a}: ${JSON.stringify(read(h,a))} versus ${JSON.stringify(e)}`);
    };
    verifyConstants(book);recordNative(book,'fresh engine open',false);
    book.editCells(0,[{...coord(cfg.cell),input:String(cfg.value)}]);
    assert.equal(book.cell(0,coord(cfg.cell).row,coord(cfg.cell).col).input,String(cfg.value));
    verifyConstants(book,true);verifyImported(book,true);const afterEdit=recordNative(book,'after A15 edit',true);
    book.undo();verifyConstants(book);verifyImported(book,false);const afterUndo=recordNative(book,'after Undo',false);
    book.redo();verifyConstants(book,true);verifyImported(book,true);const afterRedo=recordNative(book,'after Redo',true);
    book.editCells(0,[{...coord(cfg.textCell),input:cfg.textValue}]);verifyConstants(book,true,true);verifyImported(book,true);
    report.editedValues={lookupKeyBefore:cfg.originalValue,lookupKeyAfter:cfg.value,afterEdit,afterUndo,afterRedo,text:read(book,cfg.textCell)};
    report.checks.push('Actual P2 WASM preserves 57 source constants and emitted formulas; A15 edit, Undo, Redo and A13 text edit tested against independent imported-formula diagnostics. Native semantic mismatches remain separate.');
    fs.writeFileSync(path.join(out,'saved.xlsx'),book.save());report.savedOracle=independent('saved',true);
    const fresh=openWorkbook(fs.readFileSync(path.join(out,'saved.xlsx')));handles.push(fresh);
    verifyConstants(fresh,true,true);verifyImported(fresh,true);recordNative(fresh,'fresh saved-file reopen',true);
    fs.writeFileSync(path.join(out,'reopened.xlsx'),fresh.save());report.reopenedOracle=independent('reopened',true);
    assert.equal(sha(fs.readFileSync(sourcePath)),config.source.sha256);
    report.checks.push('Modern XLSX save/fresh engine reopen completed, all three independent XML comparisons retained, original WQ2 unchanged.');
    report.downstreamImportedFormulaEnginePassed=true;
    report.strictSourceImportAcceptance=[converted,report.savedOracle,report.reopenedOracle].every(x=>x.sourceImportAcceptance)
      && report.nativeEngineObservations.every(x=>x.nativeSourceMatch);
    if(!report.strictSourceImportAcceptance)throw Error('Strict native WQ2 lookup semantics/results were not preserved; downstream execution does not override this failure.');
  }
  report.passed=true;
} catch(error) {
  report.passed=false;report.error={name:error.name,message:error.message,stack:error.stack};throw error;
} finally {
  for(const h of handles)h.dispose();await loader.close();
  fs.writeFileSync(path.join(out,routeOnly?'route-report.json':'engine-report.json'),JSON.stringify(report,null,2));
}
