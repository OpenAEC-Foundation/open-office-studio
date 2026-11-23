# Standalone Spreadsheet: Linux P5 native evidence

Source `b696ab86bd1c128729a079b68c0082e6df3d36a5`, tree
`e30879fd772871e690847c061ef66e6b81808a05`, version `2026.48.1`.
The actual standalone DEB passed the full native case, including both GNM
aliases. AppImage passed its core XLSX flow and `.gnm`, but `.gnumeric` lost
the WebDriver session after a verified real native OpenFile dialog. This
remaining observation is open; no complete Spreadsheet release approval follows.

| Actual installer | SHA256 | Core XLSX | Additional GNM regression |
| --- | --- | --- | --- |
| DEB | `2975d44e7c0a6456aa0bd66c151a83b26ee9b2bd13a775a3c19db051fc15cd11` | PASS, PID 23667 → 23831 | `.gnm` 23941 → 33189 and `.gnumeric` 33553 → 42881: PASS |
| AppImage | `950bb92b52af3977dd7f163670418acb72fc6230e20184c1a77a0bc23e2bc59d` | PASS, PID 4915 → 5132 | `.gnm` 5253 → 14366: PASS; next `.gnumeric` PID 14738 invalid session |

[Run 45194487509](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45194487509)
is overall **failed**, QA `548a342cb79e2db317c9157b83bbd7b49635c6b1`.
Its own-app-only input `14824139421` came from the one verified parent preparation
`45188332685`; no Office suite was available to the isolated app host. Exact
identity `org.openaec.spreadsheet-studio`, running ELF hashes, separate profiles,
OS dependencies and full owned-process/profile cleanup are in the original raw
reports. The DEB resolves declared zenity through normal APT. AppImage precedes
DEB and has no secretly installed zenity; a foreign-original Ctrl+S confirmation
is outside this test.

Core native editing saved A1=9, B1=`A1*3` with cached value 27 and C1=`A1+B1`
with cached value 36. Full quit/new-PID reopen and independent saved ZIP/XML
inspection confirmed these exact cells in both forms. Saved XLSX SHA256 is
`573093879ddeeaf21ebf5958267d146077ddc40ce148ca42e174f842966b7c05`.
Both reopened native GDK screenshots were visually reviewed.

Every completed GNM case used the same genuine 2062-byte fixture, unchanged
SHA256 `0ae783979ec180a4a6378d9b6c43ae5af05b47e5a5d18b26dea72e4fa1ed6be6`.
The native picker/Rust IPC/bundled runtime route verified eight typed cells,
four formulas and values, two sheets, a real Sheet2!A1 edit, recommended XLSX
Save as, full quit/new PID and independent XML. All three completed outputs have
SHA256 `1dcc4821688c4ef2f016c62879da03fc9915054e72b915c74f223ce52c1196c4`.
Their reopened marker PNGs were visually reviewed. No other format variants
are certified.

The previous P5 run `45190082427` stopped in the native GTK picker after Alt+O,
before the failing import. QA `813b16c5a203fac32aca254d2143dfb049fedf99`
uses unchanged proven STW helpers: passive OpenFile observation before Ctrl+O,
actual app credentials/request/private bus → GTK peer, exact PID/start/ELF/XID,
read-only focused path verification and native Return. All four new picker
receipts passed and their observers/attributed peers were closed.

The AppImage `.gnumeric` invalid-session observation has no proven product or
driver cause. The original log only contains the same AT-SPI socket warning
also seen on passing DEB cases. A bounded same-input AppImage-only follow-up,
`45197550291`, adds read-only OS process/window/resource failure diagnostics;
it changes no input, delay, retry or content criteria. The earlier P2 native
“Couldn't open” observation also remains separately unexplained. A later pass
cannot erase either earlier failure.

[receipt.json](linux-spreadsheet-p5-proof/receipt.json) binds artifact `14828631845`,
5142530 bytes, whole ZIP SHA256
`948517759acfc3e4be36aa3436aa6f27b697286860bcdb41524df8c53599611f`,
raw reports, saved XLSX bytes, native PNGs and precise partial results.
No main merge, publication or signature certification is claimed.
