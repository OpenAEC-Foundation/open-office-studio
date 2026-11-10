# Writer field spacing in print and PDF (#323)

A long FILENAME followed by a separator and AUTHOR overlapped in repeated
headers. This reproduces with just those two fields; header editing, table
styles and note formatting are not required. Ordinary literal text and a short
filename are controls.

The native layout shapes these fields with the app's font source (Caladea for
Cambria when no original font bytes are available). Printing replays glyph runs
without the editor's glyph cache, using whole-run browser `fillText`. The CSS
fallback selected a different face. At the original fixture's print scale, the
filename reserved 551.97 pixels but painted 610.37 pixels. The PDF preserved
those paint widths and origins. This is not lost text or a PDF origin shift.

`veldMetLettertype` prepares only field text using the same provider and asset
base as layout, under an isolated CSS family. It retains native geometry,
field metadata, original fallback families and document-scoped embedded font
aliases. The guarded SDK compatibility transform covers shaped and unshaped
field primitives; no vendor binary, SDK version or font-cache policy changes.

Run the focused checks from the repository root:

```powershell
pnpm exec vitest run src/tekst/veldenDocument/lettertype.test.ts src/tekst/veldenDocument/model.test.ts src/lettertypen/lettertypen.test.ts src/export/pdf/vector.test.ts --configLoader runner
pnpm exec tsc --noEmit
pnpm exec vite build --configLoader runner
node scripts/test-writer-veldafdruk.mjs
```

The browser test makes its own synthetic DOCX cases: full metadata header,
adjacent fields, identical literal text, short filename, and bold/italic fields.
It opens the real production UI, waits for a rendered print preview, downloads
the real PDF, and checks complete field paint bounds on all three pages.
Artifacts are retained in `.local/writer-veldafdruk/`. Independently render and
extract the PDFs; compare selectable filename, author, title, PAGE/NUMPAGES,
body and notes with the baseline. Do not use an unprepared preview screenshot.

For the supported browser subdirectory route, build with `--base=./ --mode
hosted --outDir dist-hosted`, run `node scripts/controleer-hosted.mjs dist-hosted`,
serve that directory strictly at `/office/` without an SPA fallback, then set
`OFFICE_TEST_URL` to that URL and rerun the browser test. `OFFICE_TEST_UIT`
selects a separate evidence directory. Missing resources fail the test.

Platform acceptance must refer to the exact tested commit. A browser run on
Windows does not establish native Windows, Linux or macOS acceptance; record
package checks and native host results separately at integration.
