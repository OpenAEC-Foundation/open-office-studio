# First I3 native round: Mac passed, Linux/Windows incomplete

Run `44721714206` used harness
`bb0523185bd66fd5004470875b0ff6495650902f`, exact I3 app
`7f126f4b8e5269a54388cf78c48c78d2acc0daa1` and canonical desktop
`44715026752`. `hashes.json` retains byte-identical original evidence, the
original manifest and the later independent Linux partial-file oracle.
Text conversion is disabled; paths inside original reports are unchanged.

## macOS DMG

Real OS Save, independent saved-DOCX oracle and fresh-process reopening passed.
Initial PID `2369` and reopened PID `3189` differ. Saved SHA-256 is
`c28b963a6094108cdf6cc412bca58302e731a7810ee81772831a0c621748e52d`;
original EPUB unchanged, both owned apps closed and temporary data disposed are
reported true. DMG SHA-256 is
`80f10634da0af9199a8a7c561a59a231b76d9787a40d110d981e0d1b3db82df0`.

Parent viewed all six original Mac PNGs individually in sequence. Initial and
reopened headings, body, list and image are readable; reopened Hout/42 is
visible. Initial ready partly clips the lower table, and toasts cover the
right edge. Initial `native-interface.png` shows the book; reopened
`native-interface.png` shows the actual runtime/source panel. Before/target
folder images show the native Save sheet. This is not full pagination/glyph
acceptance or a #359 fix. Mac uses the same disposable host app-data profile
but a genuinely new process. This valid I3 pass will be reused.

## Linux AppImage: real save with a helper filename error

The real SaveFile observer bound application PID `5181`, request
`/org/freedesktop/portal/desktop/request/1_17/ashpd_JlXuWYtxNd` and GTK backend
PID `5211`. Frontend sender credentials, forwarded handle, live backend owner,
executable and window ownership were checked. Observer `5300`, monitor `5306`
and the owned group closed normally, without forced cleanup. Raw D-Bus and
process receipts remain included.

The actual native file is `leesvolgorde.docx.docx`, not the requested path.
The unmodified file passed a later independent content oracle, SHA-256
`8645ae653c6bcfc2a32bb782a403e7f4bb69fd43651b3d7300dcd38225cdf3e0`.
This is diagnostic real-save evidence, not expected-path or fresh-process
reopening acceptance; DEB was not reached. The app and driver closed and the
original EPUB remained intact.

Parent viewed `native-os-save.png`: it shows the saved book, double-extension
title and fading Saved notice. The failed helper overwrote its earlier chooser
capture; it must not be called a before-input image. The bounded test-only fix
selects the complete native entry before typing, preserves separate before/
after input images and uses a distinct blocked image. No file is renamed to
manufacture an expected-path result. Actual corrected operation is pending.

## Windows: pre-read ownership gate blocked

Owned process `8244` reached the native #32770 Save dialog. UIA recorded the
focused native Edit/1001 inside FileNameControlHost and the exact owned dialog,
but a stricter Win32 identity gate blocked before WM_GETTEXT. Its early throw
did not preserve the intermediate native facts. Preparation `c73b2a81` only
retains those facts; it does not weaken ownership or invoke the text API.
No Windows native save/oracle/reopen pass is claimed. Cleanup closed the app.

Integration assigned the missing Windows route to the existing local I3
Windows owner after that owner's current tests. No competing Windows CI run
will be started. Only Linux is selected for attempt 4,
harness `75ca3dfe836f58a54c0bde5c1006a24b85b5ec3d`, run `44722706478`.
The immutable I3 manifest is unchanged. Parent reviewed six Mac images and
the one Linux post-save image; other Windows/Linux originals are retained
without an independent parent image-review claim.
