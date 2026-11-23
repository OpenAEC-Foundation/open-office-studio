/** Linux-only production helper + independently verified CLI + actual P2 WASM. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createServer} from 'vite';
import {initWasm, openWorkbook} from '@betteroffice/xlsx';

assert.equal(process.platform, 'linux', 'Office/engine execution restricted to Linux CI');
const config = JSON.parse(fs.readFileSync('scripts/qa-wb2/fixture.json', 'utf8'));
const out = path.resolve('.local/wb2-qa');
const sourcePath = path.join(out, 'source.wb2'), source = fs.readFileSync(sourcePath);
const sha = b => createHash('sha256').update(b).digest('hex');
assert.equal(sha(source), config.source.sha256);
assert.equal(execFileSync('git', ['rev-parse', `${config.application.commit}^{tree}`], {encoding:'utf8'}).trim(), config.application.tree);
execFileSync('git', ['diff', '--exit-code', config.application.commit, '--', 'src', 'src-tauri', 'vendor', 'packages', 'assets', 'public', 'patches', 'package.json', 'pnpm-lock.yaml', 'versie.json', 'vite.config.ts']);
const oracle = JSON.parse(fs.readFileSync(path.join(out, 'source-oracle.json'), 'utf8'));
const report = {application:config.application, harnessCommit:execFileSync('git', ['rev-parse','HEAD'], {encoding:'utf8'}).trim(), source:config.source, checks:[],
  fullFormatAcceptance:false,
  limits:[...oracle.limits, 'Private CLI adapter/production helper/WASM; no packaged native UI or actual Tauri IPC acceptance', 'Browser negative production-function check in Node, not hosted browser UI', 'Windows and macOS not executed; no WB2 export, macro, encryption or full visual fidelity claim']};
const routeOnly = process.argv.includes('--route-only');
const loader = await createServer({configFile:false,appType:'custom',server:{middlewareMode:true,hmr:false,watch:null},optimizeDeps:{noDiscovery:true,include:[]}});
const handles = [];
const coord = a => ({row:Number(a.slice(1))-1,col:a.charCodeAt(0)-65});
const independent = (file, edited=false) => execFileSync('python3',['scripts/qa-wb2/oracle.py','xlsx','--xlsx',file,...(edited?['--edited']:[])],{stdio:'inherit'});
try {
  const {bereidOpenen} = await loader.ssrLoadModule('/src/import/openen.ts');
  const formats = await loader.ssrLoadModule('/src/formaten.ts');
  const {isSjabloon} = await loader.ssrLoadModule('/src/import/sjabloon.ts');
  await (await loader.ssrLoadModule('/src/i18n/config.ts')).default.changeLanguage('en');
  assert.equal(isSjabloon(config.source.filename),false);
  const originalWindow = globalThis.window;
  try {
    globalThis.window = {};
    const status = await formats.conversieStatus();assert.equal(status.gevonden,false);
    let rejection;
    try {await bereidOpenen(config.source.filename,source,{converteer:formats.converteer,runtimeBeschikbaar:async()=>false});}
    catch (error) {rejection=error;}
    assert.ok(rejection && /WB2/.test(rejection.message) && /XLSX/i.test(rejection.message),rejection?.message);
    report.browserLimit={method:'Production functions in Linux Node with empty window; no Tauri bridge mock',status,error:rejection.message};
    report.checks.push('No-desktop production policy rejects WB2 with concrete XLSX alternative.');
  } finally {
    if(originalWindow===undefined) delete globalThis.window;else globalThis.window=originalWindow;
  }
  if(!routeOnly) {
    assert.ok(process.env.OOS_WB2_RUNTIME_BINDING);
    let conversions=0;
    const opened=await bereidOpenen(config.source.filename,source,{
      runtimeBeschikbaar:async()=>true,
      converteer:async(bytes,from,to,kind)=>{
        assert.equal(sha(bytes),config.source.sha256);assert.deepEqual([from,to,kind],['wb2','xlsx','xlsx']);conversions++;
        const result=JSON.parse(execFileSync('python3',['scripts/qa-wb2/convert.py','--binding',process.env.OOS_WB2_RUNTIME_BINDING,'--source',sourcePath,'--out',out],{encoding:'utf8',timeout:60_000}));
        return fs.readFileSync(result.output);
      }
    });
    assert.equal(conversions,1);assert.ok(opened);assert.equal(opened.soort,'xlsx');
    assert.equal(opened.naam,'testQuattro.xlsx');assert.equal(opened.gewijzigd,true);assert.ok(!opened.alsNieuw);
    assert.equal(opened.exportFormaat??opened.soort,'xlsx');
    fs.writeFileSync(path.join(out,'open-result.json'),JSON.stringify({...opened,bytes:{length:opened.bytes.length,sha256:sha(opened.bytes)}},null,2));
    independent(path.join(out,'converted.xlsx'));
    report.checks.push('Private converter/production opening helper: all 33 native values, ten relative formulas and caches match independent OOXML oracle.');
    const wasm=fs.readFileSync('vendor/rekenbladengine/xlsx_wasm_bg.wasm');
    const pin=JSON.parse(fs.readFileSync('patches/rekenbladengine-lange-ketens.json','utf8'));
    assert.equal(sha(wasm),pin.wasmSha256);report.engineWasmSha256=sha(wasm);
    await initWasm(wasm);
    const book=openWorkbook(opened.bytes);handles.push(book);
    const cfg=config.edit;
    const read=(h,a)=>{const r=h.readCells({ranges:[{sheetId:h.sheetInfo().sheetIds[0],range:{kind:'a1',a1:a}}]});assert.ok(r.ok);return r.ranges[0].cells[0][0].value;};
    const verify=(h,numberEdited=false,textEdited=false)=>{
      assert.deepEqual(h.sheetInfo().sheetNames,['A']);
      for(const [a,c] of Object.entries(oracle.sheets[0].cells)) {
        let value=c.value;
        if(numberEdited && a===cfg.cell) value=cfg.value;
        if(numberEdited && a===cfg.formulaCell) value=oracle.expected.after;
        if(textEdited && a===cfg.textCell) value=cfg.textValue;
        assert.deepEqual(read(h,a),{kind:c.kind,value},`Native content A!${a}`);
        if(c.formula) assert.equal(h.cell(0,coord(a).row,coord(a).col).input.replace(/^=/,''),c.formula,`Native relative formula ${a}`);
      }
    };
    verify(book);
    book.editCells(0,[{...coord(cfg.cell),input:String(cfg.value)}]);
    assert.equal(book.cell(0,coord(cfg.cell).row,coord(cfg.cell).col).input,String(cfg.value));
    verify(book,true);const afterEdit=read(book,cfg.formulaCell);
    book.undo();verify(book);const afterUndo=read(book,cfg.formulaCell);
    book.redo();verify(book,true);const afterRedo=read(book,cfg.formulaCell);
    book.editCells(0,[{...coord(cfg.textCell),input:cfg.textValue}]);verify(book,true,true);
    report.editedValues={before:oracle.expected.before,afterEdit,afterUndo,afterRedo,text:read(book,cfg.textCell)};
    report.checks.push('Actual pinned WASM retains native formulas; A2 edit recalculates C2 10→70, Undo 10, Redo 70; A1 text edit committed.');
    const saved=book.save();fs.writeFileSync(path.join(out,'saved.xlsx'),saved);independent(path.join(out,'saved.xlsx'),true);
    const reopened=openWorkbook(fs.readFileSync(path.join(out,'saved.xlsx')));handles.push(reopened);verify(reopened,true,true);
    fs.writeFileSync(path.join(out,'reopened.xlsx'),reopened.save());independent(path.join(out,'reopened.xlsx'),true);
    assert.equal(sha(fs.readFileSync(sourcePath)),config.source.sha256);
    report.checks.push('Modern XLSX save/fresh reopen and independent XML pass on converted, saved and reopened stages; all 33 values and ten formulas checked; WB2 source unchanged.');
    report.boundedCellFormulaRouteAcceptance=true;
  }
  report.passed=true;
} catch(error) {
  report.passed=false;report.error={name:error.name,message:error.message,stack:error.stack};throw error;
} finally {
  for(const handle of handles) handle.dispose();await loader.close();
  fs.writeFileSync(path.join(out,routeOnly?'route-report.json':'engine-report.json'),JSON.stringify(report,null,2));
}
