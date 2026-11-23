# #30: one native Windows UOS/UOF1 route

Integration assigned this single free scope after completed Windows GNM/XLSB.
STW remains exclusively with750b; the UOS source owner e0d7 now works on UOT.
No overlapping file/native-host operation, new product intake or app build is
performed. This chat's Windows6-app preparation remains preserved and queued;
the Windows STW case belongs to750b.
The estimate given to the user is45–90 minutes including CI/driver checks and
independent evidence, conditional on newly discovered problems.

Use the exact existing ordinary P2 Windows suite: application
`dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
`5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1`, Desktop
`45143305147`, Windows job `137586342967`, attempt1. The successful native
Windows XLSB driver is reused with its source/run/job/attempt, complete artifact
digest, canonical package-report, exact NSIS member, independently derived x64
payload==installed-exe and own native app/runtime/profile identity gates.
Ordinary unsigned P2 is not final signed-release or standalone approval.

The original `fixture.json` and `oracle.py` are imported byte-for-byte from
`4f94d347b38b851780aa3304c269a8ee385eed94:scripts/qa-uos`. Original immutable
`ffc_1.uos`,79904 bytes/SHA256
`ac80140bd5d7fa6ef4a0afdaa34c36e8e2988a46737f9a66e0478e0fec8cb20c`,
is genuine UOF1 plain XML, not renamed ODS/XLSX. Its CC0 license and upstream
README are fetched and hash-checked by that unchanged source oracle. The
historical header text `pxl` is preserved. It derives three sheet names/order,
156 populated source cells (four text/152 numbers), and **zero original formulas**.

Actual operation is only on a disposable hosted Windows VM. Native Ctrl+O and
the owned real file picker select the source; normal production Rust IPC and
the app's safe bundled converter create its editable XLSX copy. A short native
focus/Windows-Control/SaveAs/fullquit/newPID/reopen preflight completes before
the broader history/calculation case. Native Save As must actually suggest XLSX,
without selecting a synthetic replacement format.

Ordinary formula input adds Sheet1!E2=`=SUM(A2:D2)`, expected2 from original XML
values0,1,1,0; changing A2 to7 must produce9. Actual Ctrl+Z restores A2=0/result2,
and Ctrl+Y restores A2=7/result9. The real visible E2 canvas cell is clicked to
establish grid keyboard focus before history keys. Production accessibility
labels are read only and corroborated by original native screenshots; no test
mirror, DOM state injection, engine mutation or Node conversion bridge exists.
Sheet2!A1 receives exactly `QA_UOS_23NOV` through the normal formula input.

Native Ctrl+S saves the actual file. Byte-for-byte snapshots preserve the real
original save (156 cells) and intermediate added-SUM save (157 cells/result2).
`stage_oracle.py` delegates original/final checks to the unchanged source oracle;
its only supplemental case derives the intermediate SUM from original XML.
Final/save/reopened XML must retain exactly158 populated cells, correct types,
all three sheets/order, the exact formula/cache9 and second-sheet marker.

The edited app exits normally, all owned WebViews must disappear, and a third
process opens the saved XLSX via the actual native picker. Source/UI samples,
calculation/second-sheet persistence and another native Save As are checked.
Startup alone cannot pass. All original source/license/README bytes are retained
for independent checks, and the original UOS must remain unchanged.

Own processes, WebView policy, install/native profiles and guarded temp resources
are cleaned. No local GUI/Computer Use/screen recording is started. The actual
source proof is portable XML-only; no Office runtime is executed locally.
This is one source example, not UOF2, UOS export, pre-existing UOS formula import,
styles/charts/macros, other OS or complete #30/catalog approval. Product files,
shared indexes/versions/workflows, main/tags/releases/publication are unchanged.

## Completed native result

[Run45157740183](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45157740183),
job `137634883689`, passes at harness
`72c91b746502d5fd8aa08f920b2e028b4c624c23`. Exact application/package point
remains the ordinary P2 suite above. No product correction was required.

Before operation, the full canonical Windows ZIP is verified against SHA256
`ecce5a188abbb5b17e52c4097d7add95ddeaaa8c24a9a4e6c492049d16902733`.
Canonical package report and exact NSIS member agree on384512913 bytes/SHA256
`85d5155a0322ce296eb4f57485235cdb725f4f293c7642bc562971ff924357ce`.
Independent extract-only x64 payload and actual installed executable both have
SHA256 `feab08d3bc09895745c75653b2f8c806e04efa7fc36101debff8b278da599a67`.
The actual app process/id/version, own profile and own bundled safe runtime are
checked before input. Installer/app are `NotSigned`, as expected for ordinary P2;
no final signing/standalone approval follows.

The short original-UOS/native Save/full-exit/newPID-reopen preflight passes before
the broader editing case. All three original sheet names/order and original
source data persist. Actual visible native grid and real formula input confirm
SUM result2, A2=7/result9, native Ctrl+Z→A2=0/result2, Ctrl+Y→A2=7/result9.
Sheet2!A1 text edit is preserved, and final normal full exit/newPID/native-picker
reopening again shows formula/cache9 and the exact second-sheet text. There are
three native picker cases, three normal full exits and two new-process reopens.

The independent downloaded-byte audit checks official proof ZIP/extracted bytes,
source/run/job/attempt/package/executable receipts, original XML/license/README,
actual native lifecycle and these actual native saves/snapshots:

| Output | Checked content | SHA256 |
| --- | --- | --- |
| `uos-original.xlsx` | All156 original typed cells, three sheets, zero formulas | `c4db7491a3b28247f78d9c79383d54b7d710bbc83cec6f3ca7364fb66df950bb` |
| `uos-sum-before.xlsx` | All157 populated cells, added SUM/cache2, A2 still0 | `f10a844415655053d8bca65e97b0abb92ad0a7639f7fa69e2c2e8aa31f24ffbd` |
| `uos-working.xlsx`, `uos-edited.xlsx` | All158 cells, A2=7, SUM/cache9, Sheet2 marker, three sheets | `389c321f783c5849ad60f9a4aea9385d5a5185da0eb00011921c39a7f9aef55a` |
| `uos-reopened.xlsx` | Same158 expected typed cells/formula/cache and three sheets after full restart | `7ff69dd3e3531a786f08737934db62a98ff67d3213f31c542f3e94af90bbb6fd` |

All eight original successful native screenshots were reviewed serially. They
show source headers/data, readable SUM2→9→Undo2→Redo9 and native A2 changes,
then readable result9 and `QA_UOS_23NOV` after restart. Production accessibility
readbacks are corroborated by visible native canvas output. The product's
editable-copy and generic protection/unknown-extension advice are separate UI
observations, not a newly established defect or full style/chart fidelity claim.

First run `45156981522` remains failed: after source inspection the driver left
Sheet3 selected before entering the intended Sheet1 formula. Source156-cell
save and full-exit/reopen had succeeded, but intended Sheet1!E2 was empty.
Its artifact and an independent original156-cell audit are preserved separately.
The driver correction selects Sheet1 explicitly and waits for the actual selected
production sheet tab; functional assertions/source/package inputs stay unchanged.

Passing artifact `14809801710`, whole ZIP SHA256
`a526e268692c9e3c02aa4b0694c856d0a5e6dc34446ae214b03949a352455966`,
and the original failed proof are retained under [`evidence/`](evidence/):201
byte-preserved files with official metadata, original ZIPs and input/license/
README, actual outputs, native UI/process/runtime/profile/cleanup records, images,
independent audit and SHA inventory. Large canonical installer bytes are bound
by the verified receipt and are not committed.

The successful run confirms old owned WebViews gone, normal exits without
forcekill, own policy/install/native-WebView profiles/temp removed, and original
UOS unchanged. The failed run explicitly cleans only its owned unsaved process
tree and stays a failure. No local GUI/Computer Use/recording session was started.

Repeat the independent original-artifact/source/native-lifecycle/output audit:

```sh
python -B qa/uos-native-windows/audit.py
```

Node/Python/PowerShell syntax and Git whitespace checks pass. All201 evidence
files match their SHA inventory and staged Git bytes; the imported original
oracle/config match their exact source Git blobs. Existing shared86-extension/
32-source coverage remains consistent and unchanged. GNM/XLSB deliveries and
Windows6-app preparation stay preserved. Other platforms, UOF2/UOS export and
original-formula import remain separate; #30 is not closed by this one case.
