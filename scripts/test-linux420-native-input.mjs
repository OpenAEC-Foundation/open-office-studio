import assert from "node:assert/strict";
import test from "node:test";
import {
  typeVerifiedNativeText,
  safeNativeEnvironment,
} from "./linux420-native-input.mjs";

test("host diagnostics keep Xauthority metadata without exposing unrelated secrets", () => {
  const actual = safeNativeEnvironment(
    Buffer.from(
      "DISPLAY=:99\0HOME=/home/runner\0XAUTHORITY=/tmp/owned-auth\0GH_TOKEN=test-secret\0OTHER=private\0",
    ),
  );
  assert.deepEqual(actual, {
    DISPLAY: ":99",
    HOME: "/home/runner",
    XAUTHORITY: "/tmp/owned-auth",
    GDK_BACKEND: null,
    XDG_CONFIG_HOME: null,
    XDG_DATA_HOME: null,
  });
  assert.equal(JSON.stringify(actual).includes("test-secret"), false);
  assert.equal(JSON.stringify(actual).includes("private"), false);
});

test("each native character is bracketed by owned-focus acknowledgements", async () => {
  const calls = [],
    records = [];
  await typeVerifiedNativeText({
    text: "a_ B1",
    verify: async (stage) => {
      calls.push(["verify", stage]);
      return { owned: true };
    },
    run: async (args) => {
      calls.push(["native", args]);
    },
    record: (action) => records.push(action),
  });
  assert.equal(calls.length, 15);
  for (let i = 0; i < 5; i++) {
    assert.equal(calls[i * 3][0], "verify");
    assert.equal(calls[i * 3 + 1][0], "native");
    assert.equal(calls[i * 3 + 2][0], "verify");
  }
  assert.deepEqual(
    calls.filter((c) => c[0] === "native").map((c) => c[1]),
    ["a", "underscore", "space", "B", "1"].map((k) => [
      "key",
      "--clearmodifiers",
      k,
    ]),
  );
  assert.ok(records.every((r) => r.post.owned));
});
test("ownership loss stops text before sending the next character", async () => {
  let checks = 0;
  const sent = [];
  await assert.rejects(
    typeVerifiedNativeText({
      text: "abc",
      verify: async () => {
        if (++checks === 2) throw new Error("owned window lost");
      },
      run: async (args) => sent.push(args),
      record: () => {},
    }),
    /owned window lost/,
  );
  assert.equal(sent.length, 1);
});
test("text never becomes a native control chord or command option", async () => {
  let sent = false;
  await assert.rejects(
    typeVerifiedNativeText({
      text: "ctrl+z",
      verify: async () => {
        sent = true;
      },
      run: async () => {},
      record: () => {},
    }),
    /bounded synthetic text/,
  );
  assert.equal(sent, false);
});
