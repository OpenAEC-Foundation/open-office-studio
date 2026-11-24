# Bounded native Windows WRI 3.1

User/integration assigned this one free #30 route on24 November. Product P5 is
unchanged: b696ab86bd1c128729a079b68c0082e6df3d36a5,
treee30879fd772871e690847c061ef66e6b81808a05,2026.48.1. This branch starts from
that exact product point and adds only isolated QA files. No product/catalogue
change, release intake, parent preparation, Suite install or app build.

Source/oracle is reused byte-for-byte from e0d7's7ba542fa3164ee70044a9e62f630fc482a4a0432,
`scripts/qa-wri31/{fixture.json,oracle.py}`. Original LibreOffice core fixture
`writerperfect/qa/unit/data/writer/libwps/pass/Write_3.1.wri`, pinned commit
92c170f11d44857d8e365f2e29fb449dfb567ff5:176896 bytes,
blob458482de0fe0da6411c2bc5f0f8880d52ec3aab5,
SHA256d13257b4df644eda291c1e3e7395ceeaf1706ad217106e8ccede595c9beb4364.
Pinned original project notices are downloaded and verified with the source;
no CC0 or independent per-fixture license grant is claimed.

The input oracle is derived from native binary header/FOD/font/paragraph data,
not converter output. Only the17 predefined ordinary body paragraphs including
empties and8 font/justification anchors are accepted. Symbol/Wingdings mapping,
three opaque objects, header/footer, geometry and full-format fidelity remain
excluded. Existing Linux headless P2 evidence is not relabelled native or P5.

The independent Writer child from prep45195780472/f88a805b is the only package
installed on a fresh hosted Windows VM. Complete original binding ZIP, child
ZIP, source/tree/job/attempt, original reports, NSIS/PE identities, Authenticode
timestamps, own appID/profile and own bundled private runtime are mandatory.
Original successful Writer core metadata is retained, not rerun. Consumer-only
configuration cannot trigger the parent preparer.

The actual native Open dialog receives the original WRI through its verified
owned process/filename HWND and genuine keys. No bridge/backend import setter
is used. The short initial source/focus/native-save checkpoint checks all25
source cases before editing. Actual body prefix keys, Undo, Redo and native
Save As produce separate imported/edited/undo/initial DOCX copies. The app then
fully quits, a different process reopens initial.docx and saves reopened.docx.
All five saved files are independently checked against the original binary
oracle (125 bounded case evaluations). Source SHA/size/mtime/nonzero file ID
must remain unchanged. Actual screenshots need separate visual review.

Local pre-dispatch checks pass: Node/Python/PowerShell syntax, exact copied
source-oracle bytes, retained original result ZIP SHA, native source reader
equality and75 prior XML case evaluations. These static replays do not launch
an app, convert a document, or claim new native acceptance. Native results and
any failures will be retained separately; no local GUI/capture is authorized.
