# Second I2 native attempt: Mac passed, Windows/Linux blocked

Native run `44712664526` used harness
`5f4cc24a67a539cb68104f2ec8ce6d5803c27106` and the same I2 application
`5acab18c516e1fb07118cb41f807a3c0e05182bf`, canonical desktop `44704167183`.
The canonical installer manifest was unchanged. This directory preserves 34
original evidence files plus their original manifest, with exact byte hashes
and text conversion disabled. Original CI/local paths remain inside reports.

## macOS DMG: real native save and new-process reopening

The verified DMG SHA-256 is
`dd4b251ece7153719e6ba2e2db9912120ae69cbd70bd97b723fc0e84e81c1c0c`.
The actual native Go-to-Folder field passed owned PID, nested native-sheet
ancestry and exact absolute-path readback checks. A normal Return selected the
target folder; the ordinary native Save button wrote the actual DOCX.
The independent oracle passed original EPUB preservation, both chapter markers
and order, Unicode/content, the Hout/42 table row and exact referenced PNG.

- Initial owned PID: `2147`; reopened owned PID: `2615`.
- Saved DOCX SHA-256:
  `8cfe646500c3c8ff47dfda6086d385c2b10fde186462f6c8d314438d9ebaa2c3`.
- Original unchanged, both owned app processes closed, and temporary test
  package data disposed: reported true.
- The reopened process uses the same normal app-data profile on this disposable
  CI Mac; this is a different process, not a claim of a new Mac profile.

The parent independently viewed all six original Mac PNGs in sequence. Initial
and reopened chapter headings, body, list and image are readable; the reopened
Hout/42 row is visible. The first ready viewport partly clips the bottom of
the table and toasts cover the right edge. The initial `native-interface.png`
shows the document, not the custom runtime/source panel; the reopened image
with that name does show the runtime/source panel. Before-folder and
target-folder images show the actual native Save sheet. This supports readable
book content within the captured view, not complete pagination/glyph acceptance
or a #359 fix. Native malformed-input handling was not tested by this sequence.

## Windows and Linux: new observed test-tool limitations

Windows still reached the actual Save dialog. Its focused filename HWND is a
native Edit, ID 1001, under the owned FileNameControlHost and #32770 ancestry;
UI Automation exposes it as Pane without ValuePattern. This attempt therefore
blocked before saving. The subsequent test-only preparation requires exact
focused HWND/process/class/control ID/ancestor/default name, bounded native
WM_GETTEXT/WM_SETTEXT, exact path readback and the ordinary native Save button.

The Linux display-order correction worked: the real GTK Save chooser now
appeared under portal PID `5336`, separate from application PID `5307`, with no
WM_TRANSIENT_FOR. Strict same-app-PID attribution correctly blocked input.
Subsequent preparation subscribes before the actual app Save, observes the
real frontend sender credentials and matching forwarded request handle, binds
the live portal backend PID, and requires its unique Save window. No SaveFile
request is injected and a title alone never establishes ownership.

The parent also viewed the original Windows and Linux `native-os-save.png`
individually. The seven remaining Windows/Linux PNGs are preserved without an
independent parent image-review claim. All corresponding source-preservation
and cleanup results remain in the unmodified reports. Neither platform reached
save/oracle/reopen; Linux DEB was not attempted after AppImage blocked.

## Preparation only; integration hold

Test-only preparation `de173e56a4737d7a955cdefe5a2b748004b47e6d` is pushed.
Nine Node artifact/overlay contracts, ten synthetic portal protocol rejection
tests, fourteen pure Windows ownership/readback cases with C# declaration
compilation, Python/PowerShell AST, Node syntax and diff checks passed. Actual
Win32 operation and live D-Bus correlation/owned-group cleanup remain CI-pending.

Integration requested a hold because a #362 CSS correction may require a new
application point and canonical installers. No further I2 native job was
started. The valid Mac result is evidence for I2 and must not be silently
relabeled as proof of a future candidate. New source/artifacts require an
explicit integration release and matching checks. The 15:20 Amsterdam stop
remains in force; no `main` or release operation is authorized.
