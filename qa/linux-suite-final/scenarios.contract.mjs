import assert from 'node:assert/strict';
import {typeShortFieldMarker} from './scenarios.mjs';
const marker=' -- STW30 EDIT 2026-11-23',actions=[];
await typeShortFieldMarker({nativeKey:async key=>actions.push({key}),type:async text=>actions.push({text})},marker);
assert.equal(actions.map(a=>a.key==='minus'?'-':a.text).join(''),marker);
assert.equal(actions.filter(a=>a.key==='minus').length,4);
await assert.rejects(()=>typeShortFieldMarker({},marker+' EXTRA'));
console.log('3 short native marker mapping contracts passed; no native input was sent');
