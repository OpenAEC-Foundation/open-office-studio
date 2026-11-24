# Public P5 Windows Writer: existing bookmarks / Go To

Result: **FAIL; cause classification OPEN**. This is a bounded test of published 2026.48.1, source `b696ab86bd1c128729a079b68c0082e6df3d36a5`, not a later integration candidate.

[Native run 45406084338](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45406084338) used QA `b43155702241b9df5cf2a47fb0e8ab5b34b99faa`, job 138487078502, attempt 1. Exact signed installer, independent payload/installed PE, existing bookmark list and input/save/normal-exit/new-PID preflight passed. The complete run did not pass.

The independent source and preflight assertions put BodyTarget at paragraph offset 5. After Ctrl+G > Bookmark > double-click BodyTarget and real typing of `BODY_`, Ctrl+S produced `BODYBODY_ target tail` (offset 4) instead of `BODY BODY_target tail` (offset 5). The body input was focused and the dialog had closed. The table text remained unchanged. This does not yet distinguish a product offset/selection defect from a pointer/driver interaction. No bookmark issue was created on this unqualified observation.

The first PID 8184 exited normally (0). PID 8972 required forced SIGTERM cleanup after the assertion timeout. The harness reports app closure, policy restoration and uninstall success; residual installation files were not independently inventoried. All later bookmark destination/history/final normal-quit/reopen checks remain OPEN. Existing bookmark creation/deletion UI was not offered and was not inferred as supported functionality.

`review.json` records package/source/run/artifact hashes, individual accepted checks, the precise failure and cleanup limits. `initial-evidence/` preserves original raw report, DOCX, screenshot and full 114254-byte artifact ZIP (all preserved files checked against the ZIP members). The artifact expires 2027-02-22T13:41:44Z; local/Git copies survive that expiry.

Execution is stopped under the explicit project cutoff. No comparison run, corrective retry, product fix, new app build or parent download was started after this failure. No local GUI, Computer Use or recording session was opened. No automatic resumption is scheduled; further qualification requires a new user instruction. Main, tags, release and published package bytes were not changed.
