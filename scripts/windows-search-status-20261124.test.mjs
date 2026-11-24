import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyReplacementStatus as classify} from './windows-search-status-20261124.mjs';
test('actual retained-result success notices are not errors',()=>{
  for(const n of [1,2]) {
    const notice=`${n} ${n===1?'match':'matches'} replaced; Ctrl+Z undoes this in one step.`;
    assert.deepEqual(classify({editor:true,status:`${n} results · ${notice}`,errorSpan:[` · ${notice}`]}),{success:true,errors:[]});
  }
});
test('actual unsupported-inline error is never a positive result',()=>{
  const e=' · Replace failed (replacing or deleting inline atoms is not supported).';
  assert.deepEqual(classify({editor:false,status:`1 result${e}`,errorSpan:[e]}),{success:false,errors:[e]});
});
test('focus or an ordinary result count alone does not prove replacement',()=>{
  assert.equal(classify({editor:true,status:'1 result'}).success,false);
  assert.equal(classify({editor:false,status:'1 match replaced; Ctrl+Z undoes this in one step.'}).success,false);
});
