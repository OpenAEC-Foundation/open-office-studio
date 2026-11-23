# #377: isolated source-only verification

Product fix is exactly cbacb7d1396aeeca9a0da72c5739def75c036a73, based on frozen
P2. The product branch changes only src/werkbestand.ts and its regression tests.
This separate QA branch/workflow executes only46 targeted Vitest checks and
TypeScript noEmit on that exact commit. No app/native/Mac build or P2 intake.

Original native diagnosis remains on43c2d07688260b69debb050740fadcaf6246495d,
qa/native-xlsb35-p2/ctrl-s-result.json, run45162093720. The genuine source stayed
unchanged; actual unsupported-XLSB confirmation and working XLSX Save As were
separately observed. General Zenity dependency has a separate owner/scope.

Local Windows: two new original-policy regressions fail before correction; all46
targeted checks and type checking pass afterward. Linux source CI pending.
New fixed-package native UI remains for integration's explicitly chosen next
candidate. No Windows/Linux/macOS native pass is inferred for this new source.
Browser lacks the original native workfile-token route; its ordinary new-document
Save As path is retained by the same policy tests, without a new browser UI claim.
