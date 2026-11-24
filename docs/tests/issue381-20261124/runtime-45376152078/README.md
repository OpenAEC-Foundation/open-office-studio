# First allocated real-runtime witness: stopped before conversion

[Run 45376152078](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45376152078),
job 138382877139, attempt 1, exact QA head `8b67ed6e` / frozen harness
`1c1cc32d`: **FAIL**, after 3m20s. The original library's rebuilt control
compiled. The job stopped at the ABI export classifier, before applying the
381 patch or running any converter/engine/save/reopen step. There was no
automatic code change, retry, second executing push or extra VM.

The original canonical runtime ZIP/tar/manifest/shared-verifier gate passed,
as did request/nonce/parent/source hashes, the critical-queue/disk checks,
dependencies and the unchanged genuine-source oracle. The separate derived
prefix was labelled as private QA, not an official runtime. SONAME, dependency
names and `$ORIGIN` assertions passed before the export comparison stopped.
The final clock and evidence upload completed successfully.

## Exact observed mismatch

The classifier demangles symbols and selects every result containing the
substring `libwps::`. That selects three actual direct libwps API exports in
the original library and seven symbols in the rebuilt control.

Independent read-only `pyelftools 0.32` inspection of the original ELF bytes
found the same **three direct libwps API symbols**, with none missing. The
four additional symbols are **STB_WEAK `std::_Rb_tree` template instantiations**
whose template argument is `libwps::NumberingType`. That type is declared in
`src/lib/libwps_internal.h` and is absent from the installed public headers.
Their namespace is `std`, although the demangled text contains `libwps::`.
Both ELFs have the same SONAME, five NEEDED names and `$ORIGIN` runpath.

This localizes the stop to a namespace-classification problem in the QA guard.
It is not a new product failure or a full declaration of ABI compatibility.
The guard has **not** been changed. The proposed classification correction and
any further witness require targeted integration review/allocation. Missing
real API symbols, changed dependencies, incorrect loaded paths and the strict
native-source oracle must continue to fail closed.

## Preserved evidence

Official artifact **14910758776**, **2,451,144 bytes**, ZIP SHA256
`9752a031fcce02a403127141bae34fc7c4031755f8ac5f440b501355f9b85b29`;
expiry **2027-02-22T10:35:01Z**. It was downloaded once, fully hashed against
official metadata, safely extracted and all 31 original members inventoried.
`artifact.zip` is unchanged. The archive contains the actual packaged and
rebuilt-control ELFs, configure/make/patch logs, runtime bindings and request
receipts. Root and other reviewers can reuse this same retained archive.

`export-detail.json` preserves symbol bindings/types/visibility and dynamic
tags; `export-difference.json` records the exact mangled symbol sets.
`numbering-type-source.json` binds the relevant internal declaration.
`proof.json` lists source/job/attempt and every retained file hash. The raw job
failure is retained separately. No ABI classifier, product patch, runtime pin,
current release, main, tag or publication was changed by this diagnosis.

Issue #381 remains **OPEN**. The earlier extracted parser unit's 11 passes
remain separate. Patched-library construction, actual WQ2 conversion, all
61 typed cells/four formulas, A15 edit/Undo/Redo/save and separate-process P5
engine reopen are **NOT RUN** in this witness.
