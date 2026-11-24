import assert from "node:assert/strict";

/** Validate OS Authenticode evidence; this never signs or changes a file. */
export function requireAuthenticode(evidence, expectedSubject) {
  assert.equal(evidence.status, "Valid", `${evidence.label}: Authenticode must be valid`);
  assert(evidence.signerSubject && evidence.signerThumbprint, `${evidence.label}: signing certificate required`);
  assert(evidence.timestampSubject && evidence.timestampThumbprint, `${evidence.label}: timestamp certificate required`);
  if (expectedSubject) assert.equal(evidence.signerSubject, expectedSubject, `${evidence.label}: signer differs from frozen metadata`);
  return evidence;
}
