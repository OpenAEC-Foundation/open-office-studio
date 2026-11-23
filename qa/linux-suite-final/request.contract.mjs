import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateSuiteRequest} from './request.mjs';

const current=JSON.parse(await readFile(new URL('./request.json',import.meta.url),'utf8'));
assert.throws(()=>validateSuiteRequest({...current,go:false}),/No coordinator/);
const dummy={...current,go:true,candidate:{commit:'a'.repeat(40),tree:'b'.repeat(40),version:'2026.48.1',producerRun:1,linuxJob:2,attempt:1},inputDescriptors:Object.fromEntries(['deb','appimage'].map(kind=>[kind,{commit:'c'.repeat(40),sha256:'d'.repeat(64),path:`qa/linux-suite-final/office-${kind}-input-descriptor.json`,upstreamPath:`docs/tests/linux-release-input-p5/office-${kind}-input-descriptor.json`}]))};
assert.equal(validateSuiteRequest(dummy),dummy);
assert.throws(()=>validateSuiteRequest({...dummy,candidate:{...dummy.candidate,commit:current.supersededCandidates[0].commit}}),/Superseded/);
assert.throws(()=>validateSuiteRequest({...dummy,inputDescriptors:null}),/mandatory/);
assert.throws(()=>validateSuiteRequest({...dummy,candidate:{...dummy.candidate,attempt:0}}));
assert.throws(()=>validateSuiteRequest({...dummy,publicationAuthorized:true}));
console.log('6 preparation request contract checks passed; actual native go='+current.go);
