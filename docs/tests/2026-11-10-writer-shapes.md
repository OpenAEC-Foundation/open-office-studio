# Writer shapes and drawing objects (#56)

Final delivery based on integration commit `d978918d998bd00485bcafc4cef3072314c1b918`.
Implementation and full-suite checks originally used `0d860e9d5487ff3b87dc079f943d31aef8fe5871`.
The previous paused work remains on `codex/wip-issue-56-2026-11-09`; do not
integrate that branch. This delivery contains only #56 changes. #55 and #130
are separate deliveries (PR255, PR242 and PR245).

## Behavior

Insert and edit native DrawingML rectangles, rounded rectangles, ovals, lines,
arrows, callouts and text boxes from Insert → Shapes and text boxes. Fill,
outline, width, shadow, text and text color are editable. Inline and floating
placement, wrapping, front/back order, grouping, ungrouping and two editable
diagram templates are supported. A selected group scales all its children;
select an individual child to change its text or paint.

Group and ungroup use the painted shape frames from the current layout. Text
range geometry alone does not describe a shape-only paragraph. The viewport
is captured before the dialog makes the editor background inert. Stale,
unbuilt, ambiguous or cross-page measurements are refused before mutation.
Direct edits retain manual undo boundaries and publish dirty state only when
the session actually changes.

The shared native S13 save adapter supplements details omitted by SDK 0.5.1:
groups and nested groups, custom paths, preset adjustments and their original
transform, supported strokes, style references and shadows. It preserves
original DrawingML for objects that cannot safely be edited. Imported idless
connector children receive unique ids when saved. The same adapter is used by
both session and editor save routes, including worker storage. There are no
vendor/WASM changes or changes to the shared ODF conversion hook.

The hybrid layout session can paint a `media:n` picture fill while its native
media cache is empty. Its resolver now receives the document's own input
buffer. If the native reader has no bytes, the fallback reads only that
embedded raster part in native archive order. Directory entries do not count
as media. Packages have separate weak caches; remote URLs, unresolved relIds,
invalid tokens, oversized parts and formats requiring transcoding are not
handled by this fallback. Existing native image decoding remains first.

## Automated checks

- 23 native shape cases: the seven presets, undo/redo, editing and repeated
  save/reopen, both editable diagrams and both save routes, group scaling,
  measured floating frames, layering with pending text, header groups,
  original custom text geometry, mixed picture-group preservation, nested
  group ids and scene invalidation, preset curves with different inner/outer
  rounding, idless connectors, and shadow/outline removal after reopening.
- Five paint-effect cases check CSS colors, theme transforms and conversion
  from native EMU values to canvas pixels.
- Four image-source cases check archive order, directory entries, unknown
  media parts, separate documents with the same token, ArrayBuffer input,
  invalid/remote sources and the exact guarded SDK connection.
- TypeScript, locale validation and production build are checked separately.
- Full-suite evidence and checks of the final combined integration basis are
  recorded below.

## Real ODF round trips

Run `scripts/test-writer-vormen-formaten.mjs --soffice /path/to/soffice`.
It generates nine real documents (seven presets and two diagrams), converts
DOCX → ODT → DOCX using LibreOffice, edits a native shape or group child, and
performs two native save/reopen cycles. It compares geometry, dimensions,
offsets, transforms, text, fill, outline, stroke metadata and effects. A preset
converted by ODF to an equivalent editable custom path is accepted; geometry
and paint are compared. The nine documents also export through LibreOffice
to reference PDFs before and after conversion and native editing.

All nine round trips passed. The process and organization PDFs were rendered
and visually inspected: boxes, arrows, connectors and edited labels remain
in place. These reference PDFs are distinct from the actual Studio PDF
exports tested below.

## Actual app checks

Production frontend on Windows, using the in-app Chromium browser:

- Process diagram ungrouping, regrouping, Undo and Redo retained the exact
  child rectangles at 100% and 150% zoom. Ungrouping at 50% also retained the
  expected positions and dimensions.
- The organization chart rendered three boxes and four connector lines.
  The top label was changed to “Directie”, shadow was enabled, and the app
  saved a native DOCX. The reopened model retained editable children, text and
  shadow. The actual Studio PDF contained the chart and searchable text
  “Directie”, “Team 1” and “Team 2” on one Letter page.
- Shadow and outline were then disabled. After native save and reopening,
  both checkboxes remained off and the top box had no visible border/shadow.
- An imported mixed DrawingML picture group initially painted a grey
  placeholder. After the resolver correction it painted the embedded red
  PNG. An unrelated body edit (“App image check”) was saved through the real
  Save as dialog. The original PNG bytes and picture XML were retained.
  After opening another document and reopening the saved file, the red
  picture and edited text still rendered correctly.
- The actual Studio PDF of that edited mixed group showed the red image and
  both body paragraphs. Both paragraphs remained searchable in the PDF.
- The imported mixed group is explicitly read-only in the shape editor;
  Apply, Group and Ungroup are disabled, with an explanation of preservation.

## Limits

The editor supports basic shapes and simple editable diagrams, not every
DrawingML/ODF feature. Opaque mixed groups and unsupported complex paint are
preserved rather than rewritten. The raster fallback does not transcode
EMF/WMF/TIFF or SVG; those continue to depend on native decoding. Complex
rotated groups and advanced imported effects are not a universal fidelity
claim. Browser ODF export requires the desktop conversion runtime; the ODF
checks above exercise real files and the shared conversion path without
changing that runtime.

## Final release verification

The final branch contains one #56 commit on `d978918`. An additive conflict in
the compatibility plugin was resolved by retaining both the existing
`bereidWorkerOpslagVoor` hook and the new shape storage/effect hooks.

On that combined basis:

- 72 tests passed across six suites: all shape/image/effect cases, worker
  startup, footnote formatting, and Spreadsheet password protection.
- Three additional worker-storage preparation tests passed.
- TypeScript and locale validation passed; the production build passed.
- All nine ODF-derived documents passed native editing and two save/reopen
  cycles again. DOCX, ODT and edited native DOCX each produced nine reference
  PDFs through LibreOffice.
- The actual combined production UI edited the organization chart to
  “Integratie Directie”, enabled shadow, saved DOCX, exported Studio PDF and
  reopened the saved chart. Seven native children, the changed text and
  shadow were retained, and the PDF text was searchable. The previously
  edited mixed picture group also rendered its red PNG after switching
  documents on this same build.

The full run on the earlier integration basis covered 272 files: 2,824 tests
passed, 10 existing tests were skipped, and one existing Spreadsheet
password test exceeded its explicit 60-second limit during competing builds.
That same 12-test protection suite passed in 12.5 seconds on the final
combined basis. An earlier pair of 5-second footnote timeouts was likewise
resolved by a passing 23-case rerun, also included in the final 72 checks.
These are reported as timeouts plus successful reruns, not as a single
uninterrupted green full-suite run on the final integration basis.
