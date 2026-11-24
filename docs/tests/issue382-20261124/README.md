# Issue 382: ETT/DPT filename classification

The production template predicate now recognizes ETT and DPT filenames in
lowercase, uppercase and mixed case. Ordinary ET/DPS filenames and existing
template/document controls retain their classification.

The pure product commit is
[bb781170](https://github.com/OpenAEC-Foundation/open-office-studio/commit/bb781170bb28880e597cfbcb5293872f62b0fecc):
only src/import/sjabloon.ts and src/import/sjabloon.test.ts, based on frozen
P5 b696ab86bd1c128729a079b68c0082e6df3d36a5. The product tree is
be87009307f4a855db9b2a715abe4e61dda7797d. QA and retained proof are separate
commits; the current P5 release, versions, runtime and catalog were not changed.

| Environment | Actual checks | Result |
| --- | --- | --- |
| Windows, Node24.22.3 | Existing template test module: before fix6 failing/19 passing; after fix25 passing. Production Vite SSR:62 filenames. | PASS |
| Linux, Node22.23.5 | Same25 tests,62 production Vite SSR filenames and62 actual headless Chrome module filename cases. | PASS |
| macOS, Node22.23.5 |62 production Vite SSR filenames; coordinator-approved light job after fresh queued-critical check. | PASS |

The browser loaded the actual production module through Vite in an isolated
blank page. No copied predicate, positive file mock, application build,
Office runtime, browser download or native GUI test was used.

Successful runs:
[Linux/browser45364977021](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45364977021),
[Mac45364682874](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45364682874).
Both check out the exact same product commit. Original Linux45364573124
retains its QA failure: SSR passed, but the browser adapter incorrectly imported
the require-resolved Playwright CommonJS entry. QA f79337e5 changes only that
browser-only import to require(playwright). The unchanged node-mode Windows/Mac
results are retained under exact source/case/helper applicability checks.

proof.json contains full run/job/attempt/product/QA identities, result counts,
all retained-file SHA256 values and official artifact expiry dates. Each
downloaded small official ZIP was fully hashed against official metadata and
retained with its raw JSON. Original red receipts were not overwritten.

## Scope and integration

These are filename policy tests. No qualified original ETT or DPT content
fixture was supplied. The existing source/permission/content-oracle gaps remain.
No import/conversion, engine fidelity, new-document/save, source overwrite or
native ETT/DPT acceptance is claimed. Existing source QA/issue history stays
with its original owner; no duplicate issue or broader format claim was made.

The fix is for the next product round. Integration owns the PR base and intake;
no merge to main, tag or publication is authorized by these checks.
Replay instructions and the small isolated helper are in qa/issue382/.
All created browser/server resources closed successfully; local ignored
node_modules reuses this chat's already-installed identical locked dependencies.
