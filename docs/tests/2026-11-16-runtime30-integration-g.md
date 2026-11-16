# #30 runtime acceptance on integration G

Application point: `9e0ad565402815082e8edf11a4c23943455fb6ce`, tree
`b79ec077abb3a7a3b199c05a45f2fb6908dc2ace`. The integration chat froze and
pushed this combination after taking #354 exactly once and preserving #355's
CI-only renderer workaround. It contains no #356 EPUB importer.

Driver ref: `codex/formats-30-g-acceptance`, driver
`3d3b847ffa6650c0a919a275f5be4b12b76e9803`.
Run: [43857127197](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43857127197).
Every application build checks out G explicitly. No c0 installer or converter
proof is reused or relabeled.

## Verification boundary

The integration chat owns the required ordinary project checks on G. This
workflow omits duplicate generic JS/Python/Rust/engine rounds and builds fresh
standard NSIS, DEB, AppImage and DMG packages. On each platform, the unpacked
private payload must complete the positive macro control, production macro
blocking, native conversion, independent content checks and all 32 legacy
fixtures. It writes a complete converter proof bound to G and that package's
SHA-256 before any native-UI result is considered.

The converter-only job reports native interface status **not-run**. A separate
fresh-host job verifies the exact new package manifest and complete same-point
converter proof, then operates the real installed app/AppImage. This keeps
converter diagnostic dialogs off the macOS native-UI host. The separate macro
teardown diagnosis runs only after its clean Mac UI proof. Build success and a
converter-only pass never substitute for native operation.

Linux native UI retains `WEBKIT_DISABLE_DMABUF_RENDERER=1` only in the CI
execution environment; compositing remains unset. No launcher or product
graphics flag is changed. No integration-owned desktop/native349 files were
edited by this executing chat.

## Actual hosted browser result

The separate hosted job has **passed** on G. Its manifest records G and the
driver above, route `/office/`, no native bridge, and successful Writer,
Spreadsheet, Presentation and explicit conversion-limit cases. The downloaded
individual reports confirm Writer offline edit/save/reopen, Spreadsheet
style/formula/unknown-part roundtrip, ten rich Presentation-note operations, and
no page errors. These are new G results, separate from c0's older browser proof.

## Fresh Linux converter results

Both new G packages passed the actual private-runtime macro, native conversion,
independent-content and legacy checks. Each legacy report records **31
opened/saved/reopened cases and one expected invalid-input rejection with an
alternative**, not 32 successful openings. Both positive macro controls executed
their own marker before production safe-profile blocking was checked.

| Package | Bytes | SHA-256 |
| --- | ---: | --- |
| AppImage | 429812216 | `866044e566dfb1e9933edc666671e0ebe9bea37cc6eae41ed66c678985a8a347` |
| DEB | 383783890 | `6634cc1750e8073e57487af664a67ccbe769bbe85645d18e9c8a8d9950443c38` |

Proof archive `runtime317-proof-Linux`, SHA-256
`7d46c6288b0b78edb1044098988be85ea3a3ba509f80cfd875babb59bf67ba9f`.
Installer archive `runtime317-installers-Linux`, SHA-256
`8f2aad02b9205baf2209bb080da5dead0fd6bc02ba962805a9c39a97f06cbca5`.
The result explicitly says `scope: converter-only`, with native interface
`status: not-run`; GUI acceptance remains separate.

Hosted archive `runtime317-hosted-browser`, SHA-256
`53a5625c1dc79bdba7cbd0f6d12c2f1f06d86e1067ddef72eeb9feed63bf0ab8`.

## Windows and macOS converter results

Both remaining platforms completed fresh macro, native conversion, independent
content and all 32 legacy cases on G. Each legacy report records 31 successful
open/save/reopen cases and one expected invalid-input rejection.

| Package | Bytes | SHA-256 |
| --- | ---: | --- |
| Windows x64 NSIS | 384522997 | `00a7836ffb387d03917ce5b2a73f3620274f49b568fcbbd1f2af09556732ad5f` |
| macOS ARM64 DMG | 373703908 | `af83cdd95ff21fafa4c1757cc9cd2a0abb47afb794dd53c6e1014c9b15ee612b` |

Windows converter-proof archive SHA-256:
`3d01838a95769099cb48328de75e2db4a0cf51208f4c18ca3ee2b2f09407a830`;
Windows installer archive:
`4f3eb92e300690fe9f00e5bd1beaa8dcae8194ee18c7a94b1f519776df539b51`.
Mac converter-proof archive:
`cd4f4e06c4aed06a70435ee72f198a500f377db3a33121c169e89c24e65b49f6`;
Mac installer archive:
`3d2c200bd9f64ae8a0ed2cd9b7f1b5fbead8d49669ea4e0a425f582c68b52ae8`.

## Actual native controls and separate visual limits

| Route | Control result | Original image observation |
| --- | --- | --- |
| Windows NSIS / real WebView2 | Passed installed ODT open, enabled native-pointer Save As, bundled source, original preservation and owned cleanup | Readiness capture shows readable document heading/body; Save As shows actual private runtime |
| Linux DEB / real WebKitGTK | Passed with original new G package and complete G converter proof | Original X11 readiness PNG is readable, as are the WebDriver images |
| Linux actual AppImage | Same controls passed through the original archive entry point, not substituted with a DEB | Original X11 readiness PNG is readable |
| macOS DMG / real WKWebView | First attempt blocked on trusted AX `-25204`; the bounded driver correction's same-byte recheck passes enabled AXPress and actual bundled-source/safe-profile observation | Fitted Save As window is readable and unobstructed. **Document glyphs remain absent before the dialog**, despite a 109-word status; document painting is not passed |

Windows native archive SHA-256:
`e2bc2ecf8f3f3584100264a16b46ee7bd9f30ea43a054f721011ddcea06cce09`.
Linux native archive:
`fcba3151c0f3ef4b1bdb8eb00c5422b543c8ecac91fba9bb37fcd4ddf6d20037`.
Both Linux native X11 PNGs are 168,997-byte RGB 1280×1024 files with identical
SHA-256 `5724e59f4ee8ec9b66af4800071132e708aeb4ee66ec5a11d190eee796da5a98`.
They were reviewed separately. A previously reported black DEB viewer result was
rechecked against the ZIP members and original disk files and corrected by the
integration chat; it was not a black source image. No Linux repeat was performed
for that viewer discrepancy.

## Bounded Mac driver correction, unchanged application/package

[Run 43867748532](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43867748532)
uses driver `8c4576e535a78b1d6e3feff3eff6a874c8bb9229` and rechecks only Mac
against the exact G DMG above, verifying its complete proof from the initial run.
Build, generic project checks, other platforms and browser were skipped.

The driver retries only trusted `CannotComplete` for the same still-live owned
PID, within an overall 180-second operation limit. Permission failures,
unsupported AX errors and another/dead PID remain blocked. Three local boundary
tests passed; Python syntax compiled. No TCC permissions or renderer flags change.
The driver records display bounds and fits only its own window by normal native
position/size operations, then waits for enabled Save As and captures the ready
document before opening the dialog. G's default window is 1440×950; the test
display is 1024×768 and G's configured minimum is 800×600.

Actual recheck: window fitted to position 12,31 and size 1000×668. AXPress and
bundled runtime/safe profile are observed; no new crash reports or alert windows,
original unchanged and owned app closed. Retry count was zero: the initial
`-25204` did not recur, so the retry alone is not established as the cause of
the later control success. Archive SHA-256:
`478635240215636ed76737f2fed6276ffb1d3818aaabab74112aa837a1201ee8`.

The original `native-interface-ready.png` still shows a blank/dark document
page. Its SHA-256 is
`07cfe27a4fd2b45ca08a2e9c8991289ce518d71a38ca3bbc347667a8afb4de7f`
(142,072 bytes). The following `native-interface.png` clearly shows the actual
runtime version, included source and macros-off profile in Save As. These two
observations remain separate. The glyph cause is unknown and has been reported
to the integration chat for separate ownership; it is not identified with the
Linux DMABUF issue. No product/renderer change was made.

The first blocked Mac archive remains historical, SHA-256
`530e2c037116be68cfa4af1741b994301909199556d01a0e4ec1fdfdfc0e5486`.
The initial full run remains red for that blocked native control. Successful
same-G Windows/Linux, converter and browser results are retained with their
original run identities. The later Mac job being green does not make its
unpainted document a visual pass.

#30 remains open for its actual catalog-input criterion. The independent EPUB
bug #356 is under development on a separate branch and is excluded from G;
the c0/G matrix still has 17 extensions without input-fixture proof. Other
architectures and signed/notarized release variants are not certified here.
No main merge, release, local app/converter or recording session was started.
