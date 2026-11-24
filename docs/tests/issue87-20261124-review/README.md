# Issue 87: independent reuse and remaining-scope review

The automatic-date-on-open implementation already exists and remains owned by
chat **0c73**. Do not implement it a second time. Integration withdrew the
initial assumption that it was an unclaimed feature and limited this review to
source binding, existing evidence and remaining acceptance gaps. No new
product code or runtime test was authorized or performed here.

## Exact source and reuse boundary

The prior product delivery is `d96aec716b15bc0a0072993b7772b21727f460fd`
(tree `470d586a9b974ec23dd7aab04a1d1ba3ad452466`), directly based on P2
`dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`. Its tested source is
`06fd06308b0688ab74ef076a59e4266623bb2eba`; the only later delta from the
product commit is its own Windows/Linux QA workflow. Evidence head
`c605f51255ae84ba2137c2744bb9cd43a3348fe1` adds the published report/audits.
Both comparisons were independently checked through the repository API.

The patch is **not present in frozen P5** `b696ab86` / tree `e30879fd`.
All eleven preexisting `src` files touched by that patch are byte-identical
between P2 and P5: `editors.tsx`, `voetteksten.ts`, and nine presentation locale
files. Its new `datumOpenen.ts` and associated test are absent from P5.
The relevant presentation modules, package/XML/ZIP helpers and dependency
manifests also have no P2-to-P5 delta. File Git blobs and SHA-256 values are in
`proof.json`. This supports later reuse; it is not combined-P5 test evidence.

The original commit also contains its own workflow and browser harness. It is
not a product-only two-file commit. A later intake must review the complete
delta and choose the intended product/QA files deliberately. Nothing was
cherry-picked, merged or applied during this review.

## What already works and what remains

| Area | Existing behavior/evidence | Remaining boundary |
| --- | --- | --- |
| Fixed date and automatic date on Apply | P5 already has the footer dialog, selected/current/all slide choices, real `dt` placeholders and `datetime1` fields; existing footer tests cover these | No new implementation needed for those controls |
| Refresh automatic date on real open | Prior `d96aec71` updates only supported direct-slide `dt` / DrawingML `datetime1` cache text, once per new source | Preserve owner 0c73 and reuse its delivery in a future round |
| Preservation | Field/paragraph language precedence, IDs, styles, fixed/other fields and unchanged compressed parts are covered by the prior tests; unchanged-day refresh is a byte-identical no-op | Not a universal field/date-format or every-package-structure claim |
| Dirty/save behavior | Derived opening bytes feed `useHerladen`; changed cache marks dirty once; saving uses the existing explicit route; source bytes are not overwritten | Original files are not silently saved; no live timer is implemented |
| Midnight/ordinary rerenders | One opening clock/result is retained. The prior browser test explicitly checks that changing the clock without reopening does not refresh/reset the editor | A future live-refresh design would be a separate scoped decision, not an unclaimed part of this delivery |
| Master positioning | P5 copies usable layout/master geometry/style when applying a new placeholder | Later master edits are not live-linked; full #77 integration remains separate |
| Slide pixels | Prior browser helper opens the actual footer dialog and reads its Date text field; real notes input/download/fresh reopen are exercised | No original date-glyph screenshots or independent canvas-paint review in that helper; do not promote metadata/XML success to visual acceptance |
| Platforms/formats | Prior exact-source Windows/Linux frontend checks and Linux Chromium production `/` and hosted `/office/` results exist | No macOS result, no native Windows/Linux/macOS package interaction result, no complete ODP/PPT roundtrip acceptance for this delta |

The source review found no additional blocker within the explicitly supported
once-on-open `datetime1` scope. Grouped shapes, compatibility branches, other
date formats, live refresh and full master editing remain excluded. They must
not be bundled into a new implementation simply because #87 remains open.

## Existing evidence independently reconciled

Official run **45153653733**, attempt 1, reports success at exact tested source
`06fd0630`. Jobs **137621041497** (Linux/browser) and **137621041861**
(Windows/frontend) both succeeded. The prior committed audit records 33 focused
tests per OS, zero failures/skips: six new date-open tests, sixteen existing
footer tests and eleven slide-number tests. Their source and assertions were
read; no tests or builds were rerun.

The real browser helper performs focused notes input, next-day ordinary
rerenders, a real Save as download, fresh same-day clean reopen and fresh
next-day dirty reopen. It preserves the fixed date and typed notes. Both
routes' saved files were previously recorded as
`8193b6e7d0e2ae065915ba8c4eeff1925af868e32e3861abbd7956b89542613d`.

| Existing artifact | Size | Official SHA-256, matched to prior audit |
| --- | ---: | --- |
| Windows `14807393129` | 2,240 B | `e09c328307ef0ba8f7b8ac771978012e67964143f86b6a5fd3144050f5340111` |
| Linux/browser `14806933739` | 96,936 B | `a7eb6e05d6d9a00970ab63bff7fe3cf6e0a491ff78cc986e41b5e2e0c81c7d18` |

Both official artifacts were unexpired when checked, with expiry
**2027-02-21T10:10:31Z**. This review fetched only small Git source/report and
official metadata responses. It did **not** download or rehash either artifact
ZIP, repeat the earlier member/XML audit, inspect new pixels or relabel old
proof as a fresh platform pass. The prior audit remains attributed to its
original author and source.

The eight retained source/metadata responses and their hashes are recorded in
`proof.json`. The three prior report files were verified against their exact
Git-blob hashes at `c605f512`. No new issue, status/label change, dependency
installation, GUI/capture, CI dispatch, appbuild, main change, tag or publication
was performed. Issue #87 remains open; its existing product ownership remains
unchanged.
