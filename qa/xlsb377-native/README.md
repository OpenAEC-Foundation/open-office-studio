# #377 P5 Linux native retest

App source: b696ab86bd1c128729a079b68c0082e6df3d36a5, tree
e30879fd772871e690847c061ef66e6b81808a05, version 2026.48.1.
This harness is separate from the checked-out app source and the actual installed
original Suite DEB. Root approved only this short feature check.

Real original XLSB CLI-open -> visible A1/formula/cache and unsaved-copy state;
real native Ctrl+S -> visible XLSX Save As/bundled runtime -> native Escape.
Original XLSB SHA/size/mtime/device/inode and fixture bytes must stay unchanged;
the working copy must remain unsaved. The ordinary Save button repeats only
this short proposal/cancellation control. Full Office exit and owned driver/
capture cleanup are required. Existing full XLSB matrix is not repeated.

Input is the immutable raw descriptor on 3ea5564105d0b4612ad9d0fd05e9a36af261b679,
docs/tests/linux-release-input-p5/office-deb-input-descriptor.json, copied without
newline normalization. The unchanged shared verifier and adjacent import helper
are pinned by Git bytes and SHA256 in shared/package/pins.json. The adapter
checks the whole official child ZIP before the canonical verifier, installs with
normal apt dependency resolution, then checks the actual installed ELF. It never
downloads the full parent archive, builds the app, or manually installs Zenity.

retest.mjs and its original readonly transport/capture helpers remain unchanged
from the prepared QA4cb346cc. New files only bind the approved package and CI.
Source oracle and syntax checks are preparation; actual native evidence is
pending the dedicated CI run. P2/P3/P4 bytes cannot substitute for P5. No local GUI
or recording is started, and this does not certify AppImage/signing/other OSes.

Initial run45190211267 passed input/installed-ELF checks but stopped before
Ctrl+S: the immutable capture helper correctly rejected the caller output path.
The caller now uses its permitted private evidence subdirectory
.local/linux-p2-native/xlsb377; helper bytes and feature criteria are unchanged.
That first partial run is not a native #377 result.
