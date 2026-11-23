import assert from "node:assert/strict";
import { test } from "node:test";
import { requireAuthenticode } from "./windows-native-signature.mjs";

const valid = () => ({ label: "fixture", status: "Valid", signerSubject: "CN=OpenAEC Foundation", signerThumbprint: "a".repeat(40), timestampSubject: "CN=Timestamp", timestampThumbprint: "b".repeat(40) });
test("accepts valid timestamped evidence from the frozen signer", () => {
  const e = valid(); assert.equal(requireAuthenticode(e, e.signerSubject), e);
});
test("rejects unsigned, changed and unknown signatures", () => {
  for (const status of ["NotSigned", "HashMismatch", "UnknownError"]) assert.throws(() => requireAuthenticode({ ...valid(), status }), /must be valid/);
});
test("rejects missing signer and timestamp evidence", () => {
  for (const field of ["signerSubject", "signerThumbprint", "timestampSubject", "timestampThumbprint"]) assert.throws(() => requireAuthenticode({ ...valid(), [field]: null }), /certificate required/);
});
test("rejects a signer conflicting with the frozen metadata", () => {
  assert.throws(() => requireAuthenticode(valid(), "CN=Other signer"), /signer differs/);
});
