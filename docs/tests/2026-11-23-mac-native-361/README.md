# Native Mac361 remaining controls on P2

Only last-cell Tab, ordinary cell typing, Find-input Undo/Redo and two-document
history isolation are in scope. The [earlier native359/body/column core](../2026-11-23-mac-native-body/README.md)
remains closed and valid. No product correction or additional app build is made.
Source remains P2 `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
`5a644e397ecc6af5452a49b6404edf953687d1b2`, version2026.48.1. ZIP/DMG/executable
remain `9b0a335a…`, `7ba6db8a…`, `e1779fe6…`; full identities are in each report.

The existing original361 fixture is copied privately into separately named A/B
documents; the source SHA256 remains
`f0eddcec6a630776774e4c3baf834ff4f89e3970d86ce183bba9814494b3f4f1`.
Reused successful run45151872444 is independently gated on its immutable report
SHA256, successful run/artifact metadata and the identical source/package/exe.

| Missing control | Exact criterion |
| --- | --- |
| Cell typing/current-host preflight | Visible alpha click; native X; CmdS/XML; Undo/Redo preserve all other cells; restore and save original3×3 |
| Last-cell Tab | Visible delta in row3/column1, exactly three native Tabs; third creates empty row4; native newrow typing is a separate history operation |
| Row/text histories | First Undo clears newrow but retains row4; second Undo removes row4; two Redos restore those operations separately |
| Find | Native CmdF and actual Find-input focus; typed abc Undo/Redo changes only that field while a four-column document sentinel remains intact; native Escape restores document focus and document Undo works |
| Two documents | Genuine open-file route into the same PID; native A/B tab selection; each Undo/Redo affects only its own history; both saved XML contents independently checked |

First execution [45156137621](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45156137621),
QA699a3fa1, passed the new host/cell typing/save/XML/Undo/Redo preflight. Exactly
three posted Tab attempts left the table3×3; the original display shows the caret
in the last cell. Driver versus product remains unresolved. Find/two-document
cases were not reached. Artifact14808443160 ZIP SHA256
`e0d2f8d8ba9e2f70e1fa9e0270633ba8bcebe8d0f9f14a7f5720442478e6b04d`
and full extraction are retained at `.local/nov23-P2-361-remaining-first/`.
The [published first-failure audit](first-targeted-Tab/owner-audit.json) also
independently verifies the typed-X and restored DOCX snapshots. Failure remains
failure; the owned CI app was closed and its container removed.

The one targeted Tab-HID variant is run45157451631, immutable QA1af35a5f.
It retains the same visible target, exactly three Tabs and unchanged row/text
criteria. It was still queued at11:46CET. No extra Tab or input retry is used to
obtain a pass. If Tab still fails, Find/two-document cases will run in a clean
independent control and carry that failed Tab outcome explicitly.

Separately prepared driver locator01988240 uses exact native filename tooltips
for the two test-document tabs. Preserved P2 AX data proves their aggregate
AXTitle also contains dirty status and the child Close button. This correction
does not change the already queued Tab variant. Native modal-dialog Undo,
standalone apps/formats and the later signed-package final combination are
separate controls; this folder makes no full361 or release-ready claim.
