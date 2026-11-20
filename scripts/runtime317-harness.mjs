/** Overlay only test drivers after the immutable application has been built. */
import { copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const source = dirname(fileURLToPath(import.meta.url));
for (const file of [
  "proef-gebundelde-runtime.mjs",
  "proef-runtime-interface.mjs",
  "proef-runtime-macos-interface.py",
  "runtime-macos-crash.py",
  "controleer-macroproef.py",
  "runtime-macos-ax.swift",
  "runtime-webview2-ci.ps1",
  "runtime317-artifacts.mjs",
  "runtime317-harness.test.mjs",
  "proef-formaatbeperking-browser.mjs",
])
  await copyFile(join(source, file), join("scripts", file));
