# #356 exact I3 platform comparison — 20 November 2026

Application: `7f126f4b8e5269a54388cf78c48c78d2acc0daa1`.
Tree: `8bc608488760e48919d7fb4e72a42569175b52a4`.
Canonical installer run: `44715026752`, successful Windows/Linux/macOS.
External test harness revisions are recorded separately from this application.

| Platform/package | Build/package checks | Real browser `/` + `/office/` | Native EPUB save, quit, new-PID reopen |
| --- | --- | --- | --- |
| Windows NSIS | Passed, canonical I3 | Passed, QA `44716499924` | Passed by local I3 owner via integration; full quit/new-PID reopen `33684`, no native edit claimed |
| Linux AppImage | Passed, canonical I3 | Passed, QA `44716499924` | Passed, native `44722706478`, PID `5150` → `5834` |
| Linux DEB | Passed, canonical I3 | Same Linux browser result | Passed, native `44722706478`, PID `6009` → `6483` |
| macOS DMG | Passed, canonical I3 | Passed, QA `44716499924` | Passed, native `44721714206`, PID `2369` → `3189` |

Windows's installer SHA-256 is
`80bcea9e0c6812d7816b6f889e1947458c7bedf17650adbb8cf9f93f38a95b10`.
Integration assigned the native Windows route to the existing local I3 Windows
owner and delivered its final verified receipt. The
[scoped Windows summary](2026-11-20-I3-windows-summary.json) records receipt SHA-256
`80ee08d6d2b247ba717f16b9a669f8b177f900a0f0c3484220a5fc6a7bf59c5c`
and independently verified root-audit SHA-256
`c4ec234abf83362ea88b4512f48deef3c2663aa6a925759c92b68a92075e806e`.
The actual saved DOCX `1eec0cc93f1cf50345126e597777cf7aa8209da1ddf76467ee78f990d65aeb26`
passes its content oracle, native open/save/no-edit/full-quit/new-PID reopen;
source EPUB remains unchanged. Native editing is not proved by that sequence.
The UIA-requested save location differed from the actual output directory;
cause remains unclassified. Actual output bytes were tested, then archived
unchanged and removed after closure (addendum SHA in summary). Original private
receipts/images remain with the integration/test owner. This is an administrative
update from that verified evidence, not a new test or image review by this chat.
The earlier Windows CI startup limitation remains historical. No retry is needed.

Browser QA harness is `61d277d64798d9e765ba04a2205ca576944d70aa`; native
Mac harness is `bb0523185bd66fd5004470875b0ff6495650902f`; native Linux
harness is `75ca3dfe836f58a54c0bde5c1006a24b85b5ec3d`. Their reports bind
the same exact I3 application and canonical installer hashes. I2 proofs remain
historical and are not relabeled as I3.

Evidence directories:

- `2026-11-20-I3-browser/`: actual local Windows browser routes and six original
  images, independently reviewed by parent.
- `2026-11-20-I3-browser-CI/`: audited all-three-OS/six-route CI, saved DOCX,
  independent oracles and eighteen images covered by unique/exact-byte review.
- `2026-11-20-native-attempt-3-I3/`: Mac pass and original Windows/Linux gaps.
- `2026-11-20-native-attempt-4-Linux/`: both Linux package passes, genuine
  portal ownership, expected filesystem output, new PIDs and cleanup.

Saved-file oracles and readable-content review are separate. Early gallery,
ribbon, font/ruler layout, viewport, toast and path-image limits are documented
in those receipts. No full glyph/pagination or broad #359 fix is inferred.
Native malformed-EPUB preservation is not tested by this narrow native sequence;
the exact-source browser and targeted importer tests cover it separately.

All owned app/driver/observer processes and CI runs are finished; own worktree
is committed/pushed. No local app, GUI/Computer Use recording or preview session
was started by these native CI tests. Do not reset another chat's runtime.
The user's stop remains **15:20 Europe/Amsterdam**; no new matrix after 14:30.
No new catalog audit/issue, application patch, `main` merge or release is part
of this acceptance work. Windows cleanup includes a confirmed own kernel reset;
helper-resource release and disappearance of the yellow capture border were
not independently visually rechecked, as explicitly limited in the receipt.
