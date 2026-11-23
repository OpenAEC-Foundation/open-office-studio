# Bounded Windows #377 supplement

`shared_formula.xlsb` and its original source oracle are unchanged from
`fb7e7b8ad95b9d13ed0ac1a33f70fd9906082588:qa/xlsb35-p2`, previously used by
the genuine native Windows XLSB proof. LibreOffice core MPL-2.0 test fixture,
7651 bytes, SHA256
`e06ae79ed345495eee0bf5e7fd7a32638af0b646c5819f7d83a4f6fb97a151a3`.
`origin.json` binds the source Git blobs and the unchanged proven native
Open-dialog helper. The original is real ZIP/BIFF12 XLSB, not renamed XLSX.

This supplement runs only after the original signed P5 Spreadsheet core has
passed. It reuses that same original app child on its own fresh hosted Windows
host. No parent download, suite files, product build or thirty-formula matrix.
The native picker opens XLSB through real Rust IPC and the private converter.
One A15 edit establishes a visibly dirty copy. Ctrl+S and ordinary Save must
each propose XLSX; cancelling must leave the source SHA/size/mtime/file identity
unchanged and keep the copy dirty. Only then is this synthetic copy discarded
through the ordinary close UI. Identity, signatures, private resources and own
process/profile cleanup remain mandatory. The six-app core outcomes stay separate.
