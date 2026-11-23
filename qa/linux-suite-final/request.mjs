import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

export function validateSuiteRequest(request) {
  assert.equal(request.schemaVersion, 1);
  assert.equal(request.go, true, 'No coordinator package start instruction');
  assert.equal(request.publicationAuthorized, false);
  const c = request.candidate, d = request.inputDescriptor;
  assert(c && d, 'Candidate and immutable Suite input descriptor are mandatory');
  for (const value of [c.commit, c.tree, d.commit]) assert.match(value, /^[0-9a-f]{40}$/);
  assert.match(c.version, /^\d{4}\.\d{1,2}\.\d+$/);
  assert(!request.supersededCandidates.some(s => s.commit === c.commit), 'Superseded source is not native-authorized');
  for (const key of ['producerRun', 'linuxJob', 'attempt']) assert(Number.isSafeInteger(c[key]) && c[key] > 0);
  assert.match(d.sha256, /^[0-9a-f]{64}$/);
  assert.equal(d.path, 'qa/linux-suite-final/native-input-descriptor.json');
  assert.equal(request.field374.contractCommit, '3169b09020184e3a98a4d5364ad77b15f38ac063');
  assert.equal(request.field374.windowsControlSha256, '4dcb51f93bd88f3d4bd3a9956f53cff23613235fe222632734b8090f9ea18310');
  assert.equal(request.field374.marker, ' -- STW30 EDIT 2026-11-23');
  return request;
}

export async function readSuiteRequest() {
  return validateSuiteRequest(JSON.parse(await readFile(new URL('./request.json', import.meta.url), 'utf8')));
}
