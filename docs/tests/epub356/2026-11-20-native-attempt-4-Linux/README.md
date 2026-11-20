# I3 Linux native acceptance: AppImage and DEB passed

Linux-only run `44722706478`, harness
`75ca3dfe836f58a54c0bde5c1006a24b85b5ec3d`, used unchanged I3 application
`7f126f4b8e5269a54388cf78c48c78d2acc0daa1`, tree
`8bc608488760e48919d7fb4e72a42569175b52a4`, canonical desktop `44715026752`.
Mac's valid I3 pass was reused; no Windows/Mac job was repeated.

Both formats performed real native EPUB open, untouched initial capture,
ordinary custom Save, credential-bound real GTK chooser input, actual expected
filesystem save, independent content oracle, complete owned app closure and
new-process reopening. The original EPUB and saved bytes remained unchanged;
temporary package data was disposed.

| Format | Package SHA-256 | Initial/reopened PID | Actual saved DOCX SHA-256 |
| --- | --- | --- | --- |
| AppImage | `234448049dfb310ce2491387b8dd817313cd97246d2c44ac559978927f2b7964` | `5150` / `5834` | `7f0292d9984cf8a9a9dbc02122e477b1cb2d2d03866f8e7d65e72b6dcc0b128e` |
| DEB | `71a08c403dfb6b02cc49ceb45c5da3734a888657853ea58ea585ef1e66c88247` | `6009` / `6483` | `0299d2e4ef8bbd4a118ffeefe28077769e9b204aab517af218a4b4ab3303ebe4` |

The actual paths end in each format's `initial/saved/leesvolgorde.docx`.
No output was renamed or supplied by an export API. Both independent oracles
check chapter order/text/list/Unicode, Hout/42 in the same row, exact referenced
PNG, original preservation and absence of macros/external active resources.
Native malformed-input handling is not claimed; separate exact-source browser
and import tests cover that scope.

Both real portal requests have frontend app credentials, matching forwarded
request handle and live GTK backend/window PID binding. Observer PIDs `5272`
and `6095`, their monitors and owned groups closed normally, code zero, no
forced cleanup. All four owned app phases report closed, and all driver exits
are recorded as zero. Raw JSON/process/D-Bus receipts are retained.

Parent reviewed twelve unique original PNGs individually in sequence and
reused four byte-identical duplicates, covering all sixteen. Book headings,
body/list, PNG and Hout/42 are readable initially and after reopening. Early
reopen captures show a still-loading gallery, disabled ribbon and changed
font/ruler layout; font substitution notices remain visible. Custom Save
runtime/source panels and real native chooser images are retained. The
after-input image still shows the selected basename, not a readable complete
absolute path; actual expected-path filesystem output is proven separately.
No complete glyph/pagination or #359 resolution is claimed.

This directory preserves the 39 original raw files plus their original hash
manifest. `hashes.json` maps exact source/copy bytes; text conversion is
disabled. Original manifest SHA-256 is
`e02448ce5fe80c61c1958199653635fe65244d9a63850977243fe65e96d3cfbf`.
Proof artifact `14623265643` ZIP SHA-256 is
`2929a5524de744e3eb4b2f6fa50832bee79a9fb67bb3878108d339fe6599039b`.

All owned runs/processes are finished. No local app, preview or recording
session was started. Windows acceptance is assigned by integration to the
existing local I3 Windows owner, with no competing CI operator.
