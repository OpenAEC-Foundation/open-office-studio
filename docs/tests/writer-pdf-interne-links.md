# Writer internal PDF links (#338)

The production browser counterexample at `65aca81f2c90b0400644818527679bb699ea19a0`
contains the app's actual two-entry TOC, two heading bookmarks and two pages.
Its PDF has all expected text but **zero Link annotations**. The structured
export still contains both `#_Toc…` URLs. Baseline PDF SHA256:
`ec34e1b3dece64ea559a27b972ad4a6f0d8c457e1d78eed5c2b809bae1396b5e`.
This path is unchanged in the new source base
`68cc7fc512d3778115395d58bfc2c2cf33131d43`.

The PDF writer accepted safe external URIs only. The correction resolves
native bookmark identities against the same-version paged structured export,
then emits direct PDF `/Dest` Link annotations. Page object references are
reserved before writing annotations so forward links can target later pages.
Destination indexes are remapped to the actual exported page order; excluded
destinations produce no annotation. The external URI allowlist is unchanged.

Destination geometry comes from the accepted-view **page slice**, not the
whole text-node anchor, which can span several pages. A destination aligns
with the exported text-fragment geometry; paragraph-start and end bookmarks
use their corresponding first/last geometry. Missing, duplicate-name,
truncated, original-view and ambiguous repeated-occurrence targets stay
unlinked. No guessed first-page destination is created. Source replacement or
a version change while reading bookmarks discards internal targets, without
discarding otherwise usable external links/outlines.

The first generated TOC row can be an inline field cache whose child node IDs
have no layout fragments; the parent atom is a 1px placeholder. Its paragraph
box is used only when that paragraph consists solely of this TOC field and
every cached item has the same internal URL. Mixed destinations never acquire
one invented whole-row target.

Focused verification:

```powershell
pnpm exec vitest run src/export/pdf src/afdrukken/tekstKoppelingen-engine.test.ts src/tekst/verwijzingen/verwijzingen-engine.test.ts --configLoader runner
pnpm exec tsc --noEmit
pnpm exec vite build --configLoader runner
node scripts/test-writer-pdf-interne-links.mjs
```

The real production UI test generates a three-page DOCX with a linked TOC,
duplicate heading titles, an ordinary named bookmark, a missing target and
safe/unsafe external-link controls. It downloads four actual PDFs: all pages,
first page only, pages `1,3`, and pages `3,1`. It checks native page-object
references, all TOC/named links, excluded destinations, reordered targets and
unchanged external URL safety. A subsequent real DOCX save preserves bookmark
names, TOC instructions and source links. The artifact directory defaults to
`.local/writer-pdf-interne-links/` (`OFFICE_TEST_UIT` overrides it).

For the supported browser route, build with `--base=./ --mode hosted --outDir
dist-hosted`, check `node scripts/controleer-hosted.mjs dist-hosted`, serve
strictly at `/office/` without a fallback, and set `OFFICE_TEST_URL` to that URL.
Missing resources fail the test. Independently parse the PDFs with pypdf and
render them with Poppler; inspect annotation destinations as well as pixels.

Record the exact delivery commit and platform results in the PR/issue. Native
Windows, Linux and macOS package/interaction checks remain separate from the
Windows-hosted Chromium tests. This source branch is for the next integration
batch and does not change the frozen candidate or native installation.
