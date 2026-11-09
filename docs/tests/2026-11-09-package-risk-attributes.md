# OOXML risk detection with alternate XML notation (#40)

Base: `f4a03889eff1306fe503a72d7acb21c754d5ac8d` (main).

## Confirmed problem

The package preflight searched for exact text such as `Type="..."` and
`<Override ... ContentType="..."`. Valid XML using single quotes, whitespace
around `=`, or a namespace prefix on content-type elements bypassed these
checks. Unknown default content types and default namespace declarations
were also missed. XML examples inside comments, CDATA and attribute values
could instead produce false warnings.

The final regression set was run against the original package-checker source
through a test-only Vite loader: 30 passed and 10 failed. The fixed source
passes all 40 package/report tests, including those same ten regressions.

## Repair

A start-tag iterator now reads the attributes needed for risk detection. It
handles both quote styles, whitespace, decoded character references, local
element names, and prefixed/default namespace declarations. It skips comments,
CDATA and processing instructions. It scans the text without building a DOM
for the document body. Both `Default` and `Override` content-type declarations
are checked.

The open-route regression confirms that the source byte array remains unchanged
and both unknown-feature report entries are produced. The same detected risks
reach the existing DOCX-to-ODT conversion-loss warning.

## Validation

- `pnpm exec vitest run src/pakketcontrole.test.ts src/import/rapport.test.ts --configLoader runner --maxWorkers=2`:
  40 passed.
- Full Vitest suite with the same loader and worker bound: 1,997 passed,
  10 existing skips, zero failures across 175 files.
- `pnpm exec tsc --noEmit`: passed.
- `pnpm exec vite build --configLoader runner --logLevel error`: passed.
- Changed TypeScript files pass Prettier and `git diff --check`.

## Production-browser check

Chromium opened the production Vite bundle on Windows. The fixture starts with
`public/templates/nieuw.docx`, adds an unknown namespace using single quotes
and spaces around `=`, and adds an unknown `Default` content type plus its
package part. Three assertions passed:

1. The nonblocking warning names unknown extensions and unknown package parts.
2. Expanding Details shows both corresponding report entries.
3. The actual Writer canvas loads that same document without a page error.

The static test server supplied the existing generated font/spelling assets
from the local development checkout; application JavaScript came from this
branch's `dist`. No desktop IPC was mocked. The browser harness and generated
fixture are retained under `.local/issue40-*` in the working checkout.

## Limits

Keep #40 open. The change repairs these metadata-detection gaps and the report
data they feed. It does not establish new format-preservation guarantees or
replace the existing measured loss matrix. The scanner is a metadata reader,
not a complete XML validator. No installed native-app acceptance run was done.
