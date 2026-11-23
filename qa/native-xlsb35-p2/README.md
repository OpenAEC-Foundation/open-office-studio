# Native XLSB #35 — installed P2 Office DEB, Linux

User-authorized platform split, coordinated by the existing integration chat:
this branch owns **Linux only**, on a disposable private CI display. The existing
Windows operator owns Windows after GNM; the existing Mac operator owns macOS
after its critical P2 input preflight. No local app/session is operated here.

Application: `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
`5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1`.
No product source, catalog, version, closed intake, main, tag or publication change.

## Pinned native input and reused controls

The coordinator-approved native descriptor is copied unchanged from
`7c5c4d9f0084467f37f9c68a4181d0f1c9f0c79e`, SHA256
`fc296348a7029ecd9740575664a18ab4bbc0a501f6bc7d90a8657e91a9809a92`.
The shared immutable package verifier from `b15892cd` checks the canonical P2
Linux job/artifact/report, recovery ZIP digest, exact DEB member/bytes/hash/control,
then the **actual installed ELF** before GUI startup. Recovery input is explicitly
authorized for this native owner; the prior content-only consumer remains separate.

The expected DEB SHA256 is `23258ac32f9368a6512b04ffcfda9a3f2be50dafeee6d8c7ca36a3a525a5f5d1`;
installed ELF must be `62923344ce4d11f6892ed1b1d4064ff5b85ce50c0286bb0a527bd121e46dd287`.
No app/suite build or full Desktop ZIP download is performed.

`shared-source.json` records every copied helper's immutable Git origin/digest.
The b15892cd transport permits only read-only DOM observation and native input,
with exact Office PID/starttime/executable/XID/foreground checks and owned-window
GDK captures. The 9f321450 picker protocol binds a real FileChooser sender to
the exact Office PID and portal backend; it guards backend executable/starttime,
private D-Bus/DISPLAY/XAUTHORITY and unique dialog XID. AT-SPI must prove the exact
focused path before native Enter. Shared protocol contracts are reused, not
presented as an actual P2 native picker pass.

## One genuine source, preflight and content oracle

The exact fixture/oracle from the completed content-only proof is retained:
real LibreOffice/core XLSB, source commit `bd7011e96264ddfe5506839319dd610975328a59`,
7,651 bytes, SHA256 `e06ae79ed345495eee0bf5e7fd7a32638af0b646c5819f7d83a4f6fb97a151a3`.
Its MPL-2.0 upstream provenance is recorded in `source-oracle.json`.
Binary source records and independent upstream expectations establish 30 formulas
and cached values of 3. The source-derived ZIP/XML oracle is independent of the
application/converter output; no renamed XLSX or output-derived golden is used.

1. Launch the actual installed Office with the genuine XLSB path. Wait for the
   selected document, Spreadsheet canvas and actual editable name/formula inputs.
2. Preflight real input focus and the visible Save As control. Verify default XLSX/bundled-runtime
   information in the actual Save As UI, then complete the real native picker.
   Independently verify all 30 original formulas/caches, fully quit and reopen
   the saved XLSX in a **new Office PID** before broader editing.
3. Through native keyboard input, edit A15 to `=40+2`. Native Ctrl+S writes XLSX;
   independently verify A15=42 and the other29=3, with all 30 formulas preserved.
4. Fully quit, reopen in another new PID, inspect A15 and A30, capture the actual
   native screen, independently verify the unchanged saved file and source bytes.

No editor bridge, DOM model setter, mocked IPC or direct converter invocation is
used by this native test. Conversion and writes happen through installed Office's
normal Rust IPC/private runtime and filesystem paths. Original XLSB is preserved.

## Scope, cleanup and status

This is installed **DEB native** acceptance of one XLSB case on virtual X11/software
graphics. It does not certify AppImage, final signed/standalone packages, physical
hardware, Windows/macOS, all #35/#30 formats or optional XLSB export.
Full process quit is through the real WebDriver session close, not the app menu.

All settings/profiles belong to this ephemeral CI host. The driver must close
Office, driver and owned portal-observer groups; screenshots use synchronous
owned-window capture processes, not a persistent recording session. Cleanup is recorded
in the result; no other chat's processes/session may be terminated.

Status: **PASS for the bounded Linux installed-DEB native case**. Tested harness
`85e9c49ebe50df632751cbfa08d8083dae884c8c`, CI [45157164075](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45157164075),
job `137632939907`. Proof artifact `14808249573` (648,478 bytes), SHA256
`62dab9aeafe98fb3a4825152fcab4f3cc215bcee9b5614abad13522a4d7010f6`.
See `result.json` and exact-byte receipts under `evidence/`.

Actual Office PIDs `4685 -> 6467 -> 6684` prove fresh process launches. The GTK
SaveFile request binds Office4685 to portal4720 and unique dialog XID4194311;
read-only AT-SPI proved the exact focused target path before native Return.
All30 original formula/caches passed before editing; A15=`40+2`/42 and other29=3
passed after real Ctrl+S and again after the final fresh reopen. Final XLSX SHA256
`6aa34959dddd5a0aed025b62beb0dc31223919da4776f4c5b8fe7b49e03cf0c2`.
The original XLSB and QA fixture stayed unchanged. Actual native screenshots were
reviewed, the downloaded artifact digest checked, and the independent XML oracle
was rerun against the downloaded workbook. Office/driver/observer process groups
closed; accessibility setting returned to its initial `false`.

Initial imported-copy Ctrl+S remains unclassified and is not certified. The first
save uses the real visible Save as control; edited XLSX Ctrl+S is separately proven.
Source/reopened documents use real Office CLI file-open, not a native OpenFile
picker. SaveFile picker is proven. Screens retain font-substitution and existing
protection/extension warnings; no font/protection/extension claim is made.

Previous content-only Linux proof stays valid at `fb7e7b8a`; it is separate from
this native acceptance.

First native run `45154508819` stopped before input: the driver inspected the
engine name box that P2 deliberately hides via CSS. The visible P2 control is
`.rekenblad-naamvak`; the driver now targets it, retaining actual editability and
visibility checks. No product failure or native pass is claimed from that run.
Its verified evidence ZIP is SHA256
`0837aad9d6eed7289a12149f4e5675006ec504d0787ec637476e8b06b19c2afa`;
Office and driver cleanup passed. The Save As runtime label is read from P2's
English locale, and the shared caller now uses immutable `3f4ddecd` readiness.

Run `45155931118` proved the visible name box, actual A1/A15 formula/value
selection, canvas and grid focus. Its initial imported-copy Ctrl+S produced no
visible Save As dialog, so it stopped; no shortcut pass or product diagnosis is
claimed. Evidence ZIP SHA256
`4e6dbcdb6bd2d41c90c10d5e955c74798eb9a96ccea2609c085039d90f910204`.
The next preflight uses the actual visible Save As toolbar control to test the
requested XLSX-save route. Edited-file native Ctrl+S remains mandatory later;
there is no fallback that silently certifies an unobserved shortcut.
Run `45157037178` was cancelled before native testing after source inspection
found its hardcoded toolbar label had wrong capitalization. Both Save As and
bundled-runtime labels are now derived from the frozen P2 English locale.
