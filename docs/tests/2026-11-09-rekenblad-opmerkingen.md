# Spreadsheet cell notes, discussions and printing (#71)

This builds on PR198's classic notes. The Tools ribbon now also opens a workbook
comment browser. It lists classic notes and threaded discussions across sheets,
navigates to their cells, shows authors and localised timestamps, and supports
starting a discussion, replying, resolving, reopening and deleting it. Resolved
discussions remain readable. Protected sheets and read-only documents cannot
change comments. Metadata changes reload the workbook; the dialog explains that
earlier undo steps are cleared. Ordinary cell and structural edits retain native
history, and note/thread anchors follow row/column changes and Undo/Redo.

Thread data uses standard Excel threadedComments and persons parts and implicit
relationships. Every new root has the mandatory classic placeholder with author
`tc={thread-id}`. It is hidden from the classic-note UI and printed only once.
Reply IDs, authorship times, source mentions, extensions and other ZIP parts are
retained. Existing source authors are not impersonated as a cloud account: local
authors use the standard `providerId="None"` identity. Ambiguous or damaged
threads are refused rather than partially rewritten. Office string escapes and
literal escape-like text round-trip, including CR and Unicode.

Spreadsheet print preview stores standard `pageSetup/@cellComments`: none,
atEnd or asDisplayed. At-end pages include classic notes (including hidden ones)
and whole discussions with cell addresses, authors, timestamps and resolved
status. Long text flows onto additional pages. As-displayed prints the classic
note cards that are permanently visible in the app; hover cards and hidden
notes are omitted. Print area and selection constrain which comments are
included. Notes in otherwise empty cells can print. Preview and PDF use the
same renderer and supply complete text for the PDF text layer.

## Verification

- Seven actual-WASM tests in `src/rekenblad/discussies.test.ts`: persons,
  roots/replies, mandatory fallback, resolve/reopen, preserved mentions and
  unknown XML, refusals, deletion, missing optional refs, string escapes,
  row/column changes, Undo/Redo, repeated saves and reopen.
- Five print tests in `src/afdrukken/celAnnotaties.test.ts`: standard pageSetup
  round trips, combined notes/threads, long-text pagination, empty-cell notes,
  selection, visible-card bounds and Unicode in the PDF text layer.
- All eleven earlier classic-note/anchor tests still pass.
- Full suite: **2,051 passed, ten pre-existing skips, 182 files**. TypeScript,
  production build and offered-language checks pass (nine languages; 23 existing
  warnings for inactive locale directories). New Dutch and English strings are
  supplied, with English fallback copies in the other locale files.
- `scripts/test-rekenblad-opmerkingen-gui.mjs` passes six production-browser
  flows: create; reply/resolve/reopen; cross-sheet navigation; structural
  Undo/Redo and independent strict XML parsing; print-at-end/PDF; visible-only
  notes. No browser page errors. It saves source XLSX, resolved XLSX, both PDFs,
  screenshots and a JSON report under `.local/proef-opmerkingen`.
- `scripts/test-rekenblad-opmerkingen-pdf.py` reads the actual two exported PDFs
  with independent pypdf: all five checks pass, including page counts, accented
  author/reply text, cell addresses, hidden-note inclusion/exclusion and cells.
  Poppler `pdfinfo` accepts the PDF, and page 2 was independently rendered with
  `pdftoppm` and visually inspected. The app preview and discussion pane were
  also visually inspected.
- `scripts/test-rekenblad-opmerkingen-libre.py` uses the isolated LibreOffice
  26.8.2.2 runtime through UNO: **seven independent checks pass**, including
  author/reply import, classic-note text and visibility, another sheet's note,
  complete threaded XLSX re-export and resolved-state re-export. Calc lazily
  materialises hidden annotation text; the script shows it temporarily to read
  it, then restores visibility. No installed profile or printer is changed.
  Set `OPENAEC_CONVERSIE_PROGRAMMA` and run with a Python providing `uno`.

This is XLSX interoperability verification with the available LibreOffice
runtime. It is not a claim of having run Microsoft Excel's desktop UI.

## Format references

- [Microsoft: threaded comments part](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-xlsx/66e1875d-c60a-48eb-bf88-41066d45fea8)
- [Microsoft: threaded comment](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-xlsx/42f9b03d-9662-4204-9783-dbeb324a691c)
- [Microsoft: placeholder reconciliation](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-xlsx/6383f002-c90b-401c-a1d7-66b97b14cb3e)
- [Microsoft: person](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-xlsx/6274371e-7c5c-46e3-b661-cbeb4abfe968)
