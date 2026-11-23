# UOP/UOF1-only real-file probe under #30

Integrationchat exclusively assigned this route. New branch `codex/uop-qa-2026-11-23-e0d7` starts from P2 `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree `5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1`. Previous STC/UOS/UOT evidence remains unchanged. Only own QA files change, with no product/catalog/version/intake/main/release work, no application builds or local GUI/capture/user-profile changes.

## Recorded result: strict failure, confirmed rectangle-fill loss

[Run 45157946997](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45157946997), harness `2a3c3306e869c814dbb7bcd56593e94285896308`: source and negative browser checks pass; private runtime verification, actual 2.120-second conversion and production opening pass. Real pinned engine opens all three slides and all original shape paragraphs, edits the first title, Undo/Redo restores complete story snapshots, and PPTX save/fresh engine reopen/second save work. All original Chinese text, object text/paragraph counts, two list levels, notes, eight object geometries, line width/arrow and zero-media/formula checks are retained. **Overall source acceptance remains false.**

Independent [theme-analysis run 45158744805](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45158744805), harness `80b48a12af99137dfc102e528d2ea17de8f6f47e`, follows actual slide → layout → master → theme relationships and color mapping. Source slide3 anchors `gr4_0` and `gr5_0` refer to rectangles filled `#14213d` and `#046eff`. Both become `schemeClr accent1`, resolving to `#18a303` in the actual theme. This discrepancy exists in raw converter output before the helper/engine and persists after edited save and fresh reopen. The original raw checker reports unresolved color references as null; the separate theme oracle resolves them and confirms actual mismatched RGB values. It does not misclassify a legal theme reference as an absent color. The analysis job's PASS means discrepancy verification, never format acceptance.

After open/closed duplicate/description checks and explicit integration coordination, registered only this two-rectangle fill defect as [#375](https://github.com/OpenAEC-Foundation/open-office-studio/issues/375), labels `presentatie`, `bug`, `formaten`. Source/output hashes, actual slide/object/theme relations and independent replay are included. No product patch or new P2/P3 intake is part of this registration; preserve this failed import-fidelity result for final release assessment. The retained ZIP's complete remote Git bytes were also independently verified at evidence commit `778c61a4f1c532a61738b5a923c46bb667b83373`.

The line stroke also resolves differently, and the canvas has a separate +625/+550 EMU difference, observed as upward integral-twip rounding. The predeclared 360 EMU tolerance is retained; neither observation is bundled into the scoped rectangle-fill registration. No visual/native/hosted-browser reproduction or shared implementation cause is claimed. No product fix or new integration intake is proposed.

The exact 85190-byte original runtime-result ZIP is retained under [`retained`](../../docs/tests/uop-2026-11-23/retained/uop-runtime-result.zip), SHA256 `e5e3ae456b1c30eb01215797dcc465ba0f3913fb9c2b7794fe965ee814e38839`. It contains unchanged source/outputs and small receipts, not a private runtime binary. Artifact `14808702891` and theme-analysis artifact `14810296324` (89112 bytes, ZIP SHA256 `c4c40a854b5d5bb0f2009b6bcd053aff2de64ee66a7b0421951d7b0978410a5e`) were downloaded and independently hashed against official metadata, as were source/browser artifacts. Exact bindings, results, limitations and file hashes: [`result.json`](../../docs/tests/uop-2026-11-23/result.json), [`theme-analysis.json`](../../docs/tests/uop-2026-11-23/theme-analysis.json).

Read-only replay of the retained source/color observations, on Linux with Python stdlib and this QA checkout:

```sh
python -m zipfile -e docs/tests/uop-2026-11-23/retained/uop-runtime-result.zip .local/uop-analysis/input
python scripts/qa-uop/analysis/theme_oracle.py
```

The source SHA and source oracle are checked before analysis. This replays observations on retained real outputs; the original actual converter/engine execution is the separately bound CI run above. It does not execute or rebuild Office.

## Actual independent source and permission

The earlier CC0 file-format-commons repository has no UOP. This probe instead downloads the independently published [99helpers three-slide UOP](https://99helpers.com/samples/uop/sample-presentation.uop), complete bytes pinned in `fixture.json`: 204509 bytes, SHA256 `7d204f66f3e15a76176145f917089b204f1160ff819a898aa0dd61e977c39c7d`. It is actual UOF1 XML, not a renamed ODP/PPTX or this probe's own export. Embedded metadata identifies 99helpers, LibreOffice 24.2.7.2 and creation 2026-10-27. Acquisition response headers are observations, not independent historical authentication; the mutable URL is frozen by complete byte hash and retained source evidence.

The [publisher's sample page](https://99helpers.com/file-types/uop) explicitly permits testing, teaching and demos, including commercial use without attribution. Record this as custom testing permission, **not CC0**. Source CI independently retains the relevant permission excerpt, full-page hash and HTTP receipt and checks the specific permission and linked asset. The full publisher article is not redistributed. No comparison ODP is used or fetched as an import substitute.

## Oracle fixed before conversion

Python stdlib parses original slide/master/object references, actual 28 × 15.75 cm canvas, eight direct slide objects across three slides, every source paragraph including Chinese, list levels, notes on all three slides, object geometry, selected rectangle fills and line color/width/arrow presence. Applied paragraph/run references are retained without inventing missing explicit font properties. Geometry uses the declared centimetre unit, 360000 EMU/cm, and a predeclared 360 EMU (0.001 cm) tolerance reflecting the recorded source coordinate resolution. No visual equivalence is inferred.

Source media/formula counts are zero. A shape's generated-software label `PNG` is not embedded image data. Absent media/formulas provide no positive coverage. Known limitations of an earlier ODP export described by the publisher are distinct from the actual UOP content; the independent UOP oracle is the sole input-content expectation.

Source-only run `45157774470` stopped at a harness assumption that the cached metadata object count (35) equalled actual object definitions. Direct inspection of unchanged source bytes gives 40 unique object definitions, including layout/note objects, and eight actual slide anchors. The oracle now verifies those actual definitions and retains the stale cached value separately. No converter/engine ran in that initial attempt; no product issue is inferred from a stale source statistic.

## Runtime, policy and real engine

Consume only shared runtime artifact `14805600515`, verifying the complete ZIP, tar, unchanged shared consumer, 15082-entry manifest, coordinator Git/base descriptor distinction, launcher/ELF and parent P2 DEB/job binding. Isolated temporary profile, exact P2 safe profile bytes/CLI arguments, 45-second converter limit, stripped GH credentials, no system Office fallback. Production `bereidOpenen` validates real conversion bytes and modern PPTX save proposal.

Real presentation SDK `@betteroffice/pptx` 0.5.1 and WASM are pinned by P2's frozen lockfile/package integrity. An independently downloaded, integrity-verified package tar archive supplies the exact WASM SHA256 `3a4be9329de1bca77437137ce6417c7910e35c1c7c0e78571bb81f9fe16e5563` (6302176 bytes), checked again in CI. The P2 presentation compatibility plugin changes React snapshot refresh only; this core-SDK test does not claim React/UI coverage.

Edit the first source title, perform Undo/Redo, PPTX save, fresh engine reopen from disk and second save. Independently inspect every output against the unchanged source-derived oracle plus the planned title prefix. Import/content/style failures are retained even if editor operations succeed. `--record-only` records all independent failures so later editor stages can run; the final strict job still fails if any source acceptance check fails. An observed engine baseline is used only for edit/Undo/Redo diagnostics, never to replace the source oracle.

## Honest limits and coordination

All converter/engine execution runs in Linux CI, with no app/suite/Mac build. Converter/helper/engine proof does not establish installer, standalone native, Tauri IPC, actual hosted browser, Windows/macOS or visual/font/animation rendering acceptance. Browser boundary calls the real negative capability/open functions in Node with an empty window and no Tauri mock. No UOF2, UOP export, other format or media/formula coverage is claimed.

Issue #30 and open/closed UOP/UOF/"Unified Office" searches/descriptions were checked before work; no specific duplicate was found. New independent problems require focused duplicate/description checks and integration coordination before registration. No next format is claimed automatically.
