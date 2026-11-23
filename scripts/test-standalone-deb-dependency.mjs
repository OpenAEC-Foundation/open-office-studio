import assert from "node:assert/strict";
import test from "node:test";
import { declaresZenity } from "./standalone-deb-dependency.mjs";
test("actual generated comma-delimited DEB control declares zenity", () =>
  assert.equal(
    declaresZenity("zenity, libwebkit2gtk-4.1-0, libgtk-3-0"),
    true,
  ));
test("versioned and architecture-qualified dependency tokens remain explicit", () => {
  assert.equal(declaresZenity("libgtk-3-0, zenity (>= 3.0)"), true);
  assert.equal(declaresZenity("other | zenity:amd64, libgtk-3-0"), true);
});
test("similarly named packages do not certify the helper dependency", () => {
  for (const text of [
    "myzenity, libc6",
    "zenity-extra, libc6",
    "libzenity",
    "",
  ])
    assert.equal(declaresZenity(text), false);
});
