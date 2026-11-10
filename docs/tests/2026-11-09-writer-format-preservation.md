# Writer format preservation: first repairs for #2, #31 and #34

Base: `f4a03889eff1306fe503a72d7acb21c754d5ac8d` (main).

## #2: valid core-property namespaces after saving

The application adds a modification timestamp during a normal Writer save.
When a valid source uses aliases other than `xsi` and `dcterms`, the original
writer creates unbound names in the new date field. If those conventional
prefixes already belong to vendor namespaces, it can instead overwrite their
declarations. The document-property XML is then invalid or changes the meaning
of preserved vendor content.

The repair reuses declared aliases and allocates a free prefix when needed.
Both the schema-instance attribute and the QName-valued date type use those
actual aliases. Existing local declarations and unknown date attributes remain
intact.

Eight regressions cover alternate/missing/default/conflicting declarations,
existing date attributes, and real D2/D3 engine round trips. In the latter,
text is inserted with the actual Yrs engine, saved through the application's
metadata writer, reopened and saved again. Checked header/footer/comment/note
text, revision counts and opaque/custom package bytes survive.

## #31/#34: detect source macro projects before conversion

The previous conversion preflight inspects OOXML only. It cannot see a VBA
project in a binary DOC/DOT container or Basic/script files in an ODT/OTT ZIP.
Consequently the report loses that information once it receives a macroless
DOCX conversion result.

The new source reader recognizes VBA storage in DOC/DOT and Basic/Scripts
package entries in ODT/OTT. The existing opening report then explains that
these projects are not carried into the editable copy. ODF script projects
use a generic macro-format label rather than being called VBA. Ordinary
documents do not acquire a macro warning, and the source bytes stay unchanged.
ODF inspection reads directory entries without decompressing script contents.
The conversion program's existing macro-disabled profile is unchanged.

The five source-report tests use actual CFB/ZIP parsing and a controlled
conversion-result stub to isolate this reporting defect. They do not establish
native conversion correctness for an actual legacy Word or ODF corpus.

## Validation

- All 13 focused regressions pass. Substituting both original production
  modules through a test-only loader makes 11 fail: seven metadata cases and
  four source-macro cases. The two unaffected cases pass on both versions.
- Full Vitest: **2,000 passed, 10 existing skips, zero failures, 177 files**.
  Command: `pnpm exec vitest run --configLoader runner --maxWorkers=2`.
- `pnpm exec tsc --noEmit`: passed.
- `pnpm exec vite build --configLoader runner --logLevel error`: passed.
- New helper/test files pass Prettier; changed files pass `git diff --check`.
  Existing compact formatting in docprops.ts is retained.

## Production-browser save/reopen

Chromium loaded this branch's production bundle and opened D3 with alternate
core-property aliases and no existing modification date. The normal Save As
dialog produced a real DOCX download. Chromium's independent DOMParser accepts
the saved core.xml; the date's schema-instance attribute and date-type QName
resolve to their correct namespace URIs. The downloaded DOCX is then opened
and saved again through the same UI, with the same checks. Custom and opaque
package bytes are retained in both downloads; no page errors were observed.

The local static harness supplied existing generated fonts/spelling assets
from the development checkout. Application JavaScript came from this branch's
dist. Harness, source fixture, downloads and JSON results are retained under
`.local/metadata-*` in this checkout. No native IPC was mocked for this check.

## Remaining scope

All three issues remain open. These are focused first repairs, not sign-off
for arbitrary DOCX preservation, original Y-app storage integration, ODF 1.3
validation/CI, full ODT/DOC round trips, legacy format coverage or installed
native-app acceptance. No LibreOffice/UNO converter was found on this Windows
machine, so native ODT/DOC conversion was not executed. Inline FODT scripts and
other macro container formats are outside the new source detector.
