/** Actual pinned engine continuation; does not replace the failed strict import test. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {initWasm, openWorkbook} from '@betteroffice/xlsx';

assert.equal(process.platform,'linux','Actual engine execution is restricted to Linux CI');
const config=JSON.parse(fs.readFileSync('scripts/qa-wb2/fixture.json','utf8'));
const out=path.resolve('.local/wb2-qa'), sha=b=>createHash('sha256').update(b).digest('hex');
const continuation=JSON.parse(fs.readFileSync(path.join(out,'continuation-binding.json'),'utf8'));
assert.equal(continuation.convertedBytesVerified,true);assert.equal(continuation.sourceReparsed,true);
assert.equal(execFileSync('git',['rev-parse',`${config.application.commit}^{tree}`],{encoding:'utf8'}).trim(),config.application.tree);
execFileSync('git',['diff','--exit-code',config.application.commit,'--','src','src-tauri','vendor','packages','assets','public','patches','package.json','pnpm-lock.yaml','versie.json','vite.config.ts']);
const oracle=JSON.parse(fs.readFileSync(path.join(out,'source-oracle.json'),'utf8'));
const report={application:config.application,harnessCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  continuation:continuation.pin,checks:[],strictSourceImportAcceptance:false,fullFormatAcceptance:false,
  limits:[...oracle.limits,'Downstream execution starts from exact authenticated prior conversion bytes; original strict run remains failed.',
    'No new converter execution, native UI, Tauri IPC, Windows/macOS or hosted browser UI test.']};
const handles=[];
const coord=a=>({row:Number(a.slice(1))-1,col:a.charCodeAt(0)-65});
const independent=(name,edited=false)=>{
  execFileSync('python3',['scripts/qa-wb2/analysis/cells.py',path.join(out,name+'.xlsx'),...(edited?['--edited']:[])],{stdio:'inherit'});
  return JSON.parse(fs.readFileSync(path.join(out,name+'-cells-diagnostic.json'),'utf8'));
};
try {
  const bytes=fs.readFileSync(path.join(out,'converted.xlsx'));
  assert.equal(sha(bytes),continuation.pin.convertedSha256);
  const converted=independent('converted');report.convertedOracle=converted;
  assert.equal(converted.downstreamCellFormulaPassed,true);
  assert.equal(converted.strictDefaultNameMatch,false,'Known name mismatch must remain visible');
  const wasm=fs.readFileSync('vendor/rekenbladengine/xlsx_wasm_bg.wasm');
  const pin=JSON.parse(fs.readFileSync('patches/rekenbladengine-lange-ketens.json','utf8'));
  assert.equal(sha(wasm),pin.wasmSha256);report.engineWasmSha256=sha(wasm);
  await initWasm(wasm);
  const book=openWorkbook(bytes);handles.push(book);
  const cfg=config.edit;
  const read=(h,a)=>{const r=h.readCells({ranges:[{sheetId:h.sheetInfo().sheetIds[0],range:{kind:'a1',a1:a}}]});assert.ok(r.ok);return r.ranges[0].cells[0][0].value;};
  const verify=(h,numberEdited=false,textEdited=false)=>{
    // Stability of the actual imported name is separate from source-name acceptance.
    assert.deepEqual(h.sheetInfo().sheetNames,converted.sheetNames);
    for(const [a,c] of Object.entries(oracle.sheets[0].cells)) {
      let value=c.value;
      if(numberEdited && a===cfg.cell) value=cfg.value;
      if(numberEdited && a===cfg.formulaCell) value=oracle.expected.after;
      if(textEdited && a===cfg.textCell) value=cfg.textValue;
      assert.deepEqual(read(h,a),{kind:c.kind,value},`Original native cell ${a}`);
      if(c.formula) assert.equal(h.cell(0,coord(a).row,coord(a).col).input.replace(/^=/,''),c.formula,`Original native relative formula ${a}`);
    }
  };
  verify(book);report.checks.push('Actual P2 WASM opens exact prior converter bytes; all 33 values and ten original formulas match native oracle.');
  book.editCells(0,[{...coord(cfg.cell),input:String(cfg.value)}]);
  assert.equal(book.cell(0,coord(cfg.cell).row,coord(cfg.cell).col).input,String(cfg.value));
  verify(book,true);const afterEdit=read(book,cfg.formulaCell);
  book.undo();verify(book);const afterUndo=read(book,cfg.formulaCell);
  book.redo();verify(book,true);const afterRedo=read(book,cfg.formulaCell);
  book.editCells(0,[{...coord(cfg.textCell),input:cfg.textValue}]);verify(book,true,true);
  report.editedValues={before:oracle.expected.before,afterEdit,afterUndo,afterRedo,text:read(book,cfg.textCell)};
  report.checks.push('A2 edit 1→7 recalculates original C2 multiplication 10→70; Undo→10, Redo→70; text edit A1 committed.');
  fs.writeFileSync(path.join(out,'saved.xlsx'),book.save());report.savedOracle=independent('saved',true);
  const fresh=openWorkbook(fs.readFileSync(path.join(out,'saved.xlsx')));handles.push(fresh);verify(fresh,true,true);
  fs.writeFileSync(path.join(out,'reopened.xlsx'),fresh.save());report.reopenedOracle=independent('reopened',true);
  for(const stage of [report.savedOracle,report.reopenedOracle]) {
    assert.deepEqual(stage.sheetNames,converted.sheetNames);assert.equal(stage.strictDefaultNameMatch,false);
  }
  assert.equal(sha(fs.readFileSync(path.join(out,'source.wb2'))),config.source.sha256);
  report.checks.push('Modern XLSX save/fresh engine reopen and all three independent XML checks pass for 33 cells/ten formulas; WB2 source unchanged.');
  report.downstreamCellFormulaAcceptance=true;report.downstreamPassed=true;
} catch(error) {
  report.downstreamPassed=false;report.error={name:error.name,message:error.message,stack:error.stack};throw error;
} finally {
  for(const h of handles) h.dispose();
  fs.writeFileSync(path.join(out,'downstream-engine-report.json'),JSON.stringify(report,null,2));
}
