import assert from 'node:assert/strict';
import {pickerPaths,requirePickerReady} from './picker-paths.mjs';
const a=pickerPaths({out:'/own',member:'SaveFile',pid:5575,index:0}),b=pickerPaths({out:'/own',member:'SaveFile',pid:13759,index:1});
assert.equal(new Set([a.proof,a.ready,b.proof,b.ready]).size,4);
assert.notEqual(pickerPaths({out:'/own',member:'SaveFile',pid:5575,index:1}).proof,a.proof);
requirePickerReady({status:'ready',ownedPid:13759,observerPid:14202},{pid:13759,observerPid:14202});
assert.throws(()=>requirePickerReady({status:'ready',ownedPid:5575,observerPid:5848},{pid:13759,observerPid:14202}));
console.log('4 real-picker correlation contracts passed; repeated SaveFile requests cannot reuse old PID readiness/proof');
