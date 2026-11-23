# GNM Linux native P2 DEB acceptance

Scoped QA only. Product/source P2 `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree `5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1`. No app build, Desktop archive download, product change or publication.

## Inputs and reused protocol

- Recovery artifact `14804990580`, run `45146535263`, archive SHA-256 `dad8d71594470ed7216c9f5d48f65fc2531d9c2b8de1b80b213d823a1e34606f`. Member `canonical-office.deb`, SHA-256 `23258ac32f9368a6512b04ffcfda9a3f2be50dafeee6d8c7ca36a3a525a5f5d1`. Actual installed ELF must equal `62923344ce4d11f6892ed1b1d4064ff5b85ce50c0286bb0a527bd121e46dd287`.
- Parent Desktop run `45143305147`, Linux job `137586343061`. The package validator checks the Linux job, archive/report and recovery chain independently of other platforms.
- Existing tested package/PID/XID/XTest/readonly transport and owned-window capture files copied byte-for-byte from QA `6bb8d6fafa06718b0a0ea5aff9cbcf70856e16c1`. Native-input descriptor canonical hash `fc296348a7029ecd9740575664a18ab4bbc0a501f6bc7d90a8657e91a9809a92`.
- Oracle and genuine gzip/XML fixture copied byte-for-byte from `d21243acad54235e2674f7e89f44db75cf6bcb44`. Fixture `universal-content.gnumeric`, 2062 bytes, SHA-256 `0ae783979ec180a4a6378d9b6c43ae5af05b47e5a5d18b26dea72e4fa1ed6be6`, upstream LibreOffice commit `92c170f11d44857d8e365f2e29fb449dfb567ff5`. Both suffixes use these same valid bytes; no claim of two distinct producer variants.

## Acceptance route

A fresh hosted Ubuntu 22.04 runner installs only the verified Office DEB. The private X11/DBus/profile session first verifies real focus, Ctrl text replacement, XLSX save, full process exit and a new PID reopening the saved value. Each GNM extension then opens through Ctrl+O and the real native GTK file picker, uses production Rust IPC and the bundled converter, checks two sheets and all eight original values/formulas using actual selection and readonly semantic UI, edits Sheet2!A1 via real keys, selects recommended XLSX in the ordinary Save as dialog, saves through the native picker, fully exits and reopens under a new PID. Independent ZIP/XML oracle verifies eight typed cells, four formulas and cached values, two sheets and the edit marker. Original source hash remains unchanged. No model setters, File injection, custom editor bridge or backend conversion invocation is used.

Pending actual CI result. AppImage operation and native standalone Spreadsheet remain separate pending final cases. A green build is not native acceptance.
