# GNM Linux native P2 DEB acceptance

Scoped QA only. Product/source P2 `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree `5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1`. No app build, Desktop archive download, product change or publication.

## Inputs and reused protocol

- Recovery artifact `14804990580`, run `45146535263`, archive SHA-256 `dad8d71594470ed7216c9f5d48f65fc2531d9c2b8de1b80b213d823a1e34606f`. Member `canonical-office.deb`, SHA-256 `23258ac32f9368a6512b04ffcfda9a3f2be50dafeee6d8c7ca36a3a525a5f5d1`. Actual installed ELF must equal `62923344ce4d11f6892ed1b1d4064ff5b85ce50c0286bb0a527bd121e46dd287`.
- Parent Desktop run `45143305147`, Linux job `137586343061`. The package validator checks the Linux job, archive/report and recovery chain independently of other platforms.
- Existing tested package/PID/XID/XTest/readonly transport and owned-window capture files copied byte-for-byte from QA `6bb8d6fafa06718b0a0ea5aff9cbcf70856e16c1`. Native-input descriptor canonical hash `fc296348a7029ecd9740575664a18ab4bbc0a501f6bc7d90a8657e91a9809a92`.
- Oracle and genuine gzip/XML fixture copied byte-for-byte from `d21243acad54235e2674f7e89f44db75cf6bcb44`. Fixture `universal-content.gnumeric`, 2062 bytes, SHA-256 `0ae783979ec180a4a6378d9b6c43ae5af05b47e5a5d18b26dea72e4fa1ed6be6`, upstream LibreOffice commit `92c170f11d44857d8e365f2e29fb449dfb567ff5`. Both suffixes use these same valid bytes; no claim of two distinct producer variants.

## Acceptance route

A fresh hosted Ubuntu 22.04 runner installs only the verified Office DEB. The private X11/DBus/profile session first verifies real focus, Ctrl text replacement, XLSX save, full process exit and a new PID reopening the saved value. Each GNM extension then opens through Ctrl+O and the real native GTK file picker, uses production Rust IPC and the bundled converter, checks two sheets and all eight original values/formulas using actual selection and readonly semantic UI, edits Sheet2!A1 via real keys, selects recommended XLSX in the ordinary Save as dialog, saves through the native picker, fully exits and reopens under a new PID. Independent ZIP/XML oracle verifies eight typed cells, four formulas and cached values, two sheets and the edit marker. Original source hash remains unchanged. No model setters, File injection, custom editor bridge or backend conversion invocation is used.

## Native result: PASS for this Office DEB scope

[Run 45155198992](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45155198992), job `137626236395`, succeeded on harness `c576379059fa819ac64017f9c84e1e519ce135fa`. It performed 58 checks and retained 23 validated owned-window captures. The downloaded entire proof ZIP matched artifact `14807469215`, SHA-256 `af6201d1238c34efd5f41926322563cd4075115b11215a218904097a0a007ee5` (2,223,084 bytes).

| Input | Native route | Full quit / fresh PID | Independent preservation |
| --- | --- | --- | --- |
| `.gnm`, genuine 2062-byte input above | Real Open file picker → production Rust IPC → bundled converter → eight cell values/types and four formulas → two sheet tabs → actual Sheet2!A1 edit → recommended XLSX Save as and native picker | 5108 → exit → 5774 | Eight original typed cells, four formulas and caches, two sheets and `GNM30 EDIT` survive; original SHA unchanged |
| `.gnumeric`, same genuine bytes | Same native route, separately opened and saved | 6137 → exit → 6797 | Same independent ZIP/XML and original-source checks pass |

Both native saved outputs have SHA-256 `1dcc4821688c4ef2f016c62879da03fc9915054e72b915c74f223ce52c1196c4`. Native preflight also saved an XLSX edit via Ctrl+S and reopened it under new PID `4731 → 4993` before acceptance. Inputs use actual native pointer/keys, pinned executable/PID/starttime/XID and focus checks; DOM access only observes the selected document's public UI.

The installed private runtime ELF is `/usr/libexec/Open Office Studio/kantoorruntime/program/soffice.bin`, SHA-256 `9ceb3439812e6196b181d362903d835ebfc0bff09bcc85617f6d5f0cb54bc947`. Both native Save as dialogs reported `LibreOffice 26.8.2.2 ... (included with the app, safe profile: macros off)`. No external converter override was set.

The [compact receipt](2026-11-23-gnm-linux-native-p2-proof/receipt.json), SHA-256 `fcb19341a0914a40f450f193be6abaa4ed7907cd571663e14c452ff1a0000645`, binds input provenance, all cell observations, PID transitions, artifact identity, runtime, captures and cleanup. The complete raw report is preserved in [gzip form](2026-11-23-gnm-linux-native-p2-proof/raw-native-report.json.gz), uncompressed SHA-256 `81cb436bdc47189bb50272f5163e83b14126ff8bc058f974d091a7331ddd4235`. Saved XLSX, exact source bytes, oracle receipts and representative images are preserved beside the [file hash manifest](2026-11-23-gnm-linux-native-p2-proof/files.sha256.json).

## Limits and cleanup

AppImage operation and native standalone Spreadsheet remain separate pending final cases. This is genuine native Office-DEB acceptance, not a green-build inference or complete release approval. Only the pinned two-sheet Gnumeric producer fixture is covered. Font substitution and generic protection/unknown-extension notices are visible; all formatting, protection and arbitrary Gnumeric variants are not certified.

Four failed QA attempts are retained with source/run/artifact/report hashes and complete compressed reports: native Open action timing, a read selector including the hidden preflight document, the default Node output-buffer limit for the large bundled-runtime package inventory, and a reused Open/Save diagnosis-image filename. These are driver failures; their criteria were repaired without product changes or weakening acceptance. The successful run independently completes both whole routes.

All own application PIDs disappeared after closing, the detached driver exited and no persistent capture client was opened. Synthetic profile/Xvfb/DBus/portal resources belong to the disposable hosted runner and end at its teardown. No local GUI/capture or user profile was used. No product change, main merge/push, release tag or publication occurred.
