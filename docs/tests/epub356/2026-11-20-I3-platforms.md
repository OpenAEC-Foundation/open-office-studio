# #356 exact I3 platform comparison — 20 November 2026

Application: `7f126f4b8e5269a54388cf78c48c78d2acc0daa1`.
Tree: `8bc608488760e48919d7fb4e72a42569175b52a4`.
Canonical installer run: `44715026752`, successful Windows/Linux/macOS.
External test harness revisions are recorded separately from this application.

| Platform/package | Build/package checks | Real browser `/` + `/office/` | Native EPUB save, quit, new-PID reopen |
| --- | --- | --- | --- |
| Windows NSIS | Passed, canonical I3 | Passed, QA `44716499924` | **Pending local I3 owner via integration**; CI blocked before text API |
| Linux AppImage | Passed, canonical I3 | Passed, QA `44716499924` | Passed, native `44722706478`, PID `5150` → `5834` |
| Linux DEB | Passed, canonical I3 | Same Linux browser result | Passed, native `44722706478`, PID `6009` → `6483` |
| macOS DMG | Passed, canonical I3 | Passed, QA `44716499924` | Passed, native `44721714206`, PID `2369` → `3189` |

Windows's installer SHA-256 is
`80bcea9e0c6812d7816b6f889e1947458c7bedf17650adbb8cf9f93f38a95b10`.
Integration assigned the missing native Windows route to the existing local
I3 Windows owner after that owner's earlier tests. No parallel Windows CI
retry is running. A successful build/browser test is not a native Windows pass.

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
of this acceptance work. Windows remains explicitly pending until its real
operation/source/file/cleanup evidence is delivered.
