# Remaining STW platform acceptance

Integration remains the single coordinator. On 2026-11-23 it assigned the following
STW checks to the existing standalone Writer acceptance owners. These are assignments,
not successful test results. The macOS #359 suite blocker takes precedence.

| Check | Assigned by integration | Current evidence |
| --- | --- | --- |
| Native Windows | Existing tester chat 750b, within its Suite/Writer claim | P2 unsigned-suite I/O and final DOCX XML pass, run 45152204418; confirmed title-rendering defect #374 blocks unconditional visual acceptance; standalone acceptance remains separate |
| Native macOS | Existing chat 6f92 (`optimalisatie`) | Assigned, not yet passed |
| Native Linux DEB and AppImage | Existing `writer_362`, after current P2 core proof | Assigned, not yet passed |
| Actual browser limitation on `/` and `/office/` | This STW QA chat 9d3b | Passed: actual Linux Chromium upload/advice + independent saved-DOCX XML equality, run 45150936369 |

These are integration's latest assignments, superseding its initial allocation to
8020/standalone_linux. Chat 8020 retains GNM; this chat does not take that scope.
The browser driver reuses its proven driver at
`d21243acad54235e2674f7e89f44db75cf6bcb44`, narrowed to the genuine STW fixture.
The full browser artifact ZIP was independently hashed and its reports, images,
source receipts and four saved DOCX files audited; see `browser-audit.json`.
This actual browser evidence is separate from the historical Node guard.

The Windows evidence was independently downloaded and its full ZIP hash verified.
`windows-native-audit.json` confirms native dialog ownership, bundled runtime,
NSIS-payload/installed-PE equality, normal exits and different PIDs (10060 and4176),
all eight source blocks, selected effective styles, heading and placeholders in the final saved DOCX, and
cleanup. The native test used the exact ASCII edit marker
` -- STW30 EDIT 2026-11-23`; the oracle checks that actual variant explicitly.
Earlier saved bytes were overwritten on resave, so their recorded CI-stage audits
are distinguished from this chat's independent audit of the retained final file.

Image review found a separate open observation: `stw-opened.png` has a clear title,
whereas `stw-edited.png` and `reopened.png` show the DOCVARIABLE title cache
overlapping following text. This is an observation in tester750b's native artifacts,
not a newly executed native reproduction by this chat. Integration assigned this
chat source/image/duplicate triage plus one bounded browser comparison; 750b remains
the sole native Windows operator. Source/original-file preservation is not a visual
layout pass. Linux still lacks a current owned-picker pass; macOS waits for its
critical #359 input check and matching Writer package. No completion date is assumed.

The bounded independent browser reproduction confirms the defect as
[#374](https://github.com/OpenAEC-Foundation/open-office-studio/issues/374), not merely
an unverified native screenshot observation. Run 45154167386 displays the unchanged
Windows DOCX with overlap. A diagnostic copy that replaces only its title field with
identical cached text renders without overlap; all other 19 ZIP entry contents,
styles/fontTable, 42 registered font faces and replacement advice are identical.
See `render-audit.json`, `render-diagnostic-audit.json` and the preserved exact small
artifact in `render-proof/`. The derived copy is neither a product patch nor an
acceptable field-flattening workaround. Integration owns fix/intake coordination;
this chat's current assignment is source/image/duplicate triage only.

The actual standalone release packages are not available at this handoff. Integration
will provide their source/version/artifact/package manifest when each platform's own
package is ready. P2 `dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b` remains the frozen
application point for existing STW evidence. Do not silently treat another source,
another app binary or a package build as a native pass on P2.

## One additional Writer case, after the owner's DOCX preflight

Use the immutable original `report.stw` URL and 11,186-byte SHA-256 from `source.json`.
Its original container must remain unchanged. Verify the actual app package and
installed executable identity before opening. Reuse that platform owner's valid
input/focus/save/reopen preflight and isolated standalone environment; do not share
live GUI control or an installed suite/profile between operators.

1. Open the actual STW through the installed app's supported native opening route.
   Confirm an editable new DOCX copy and preservation of the original STW.
2. Confirm the eight nonempty source body blocks and source-derived selected styles,
   Heading 1, and both text-placeholder contracts. The fixture contains no tables;
   its `Index of Tables` heading is not a nonempty table test.
3. Add ` — STW30 EDIT 2026-11-23` after the title field. The source title is a
   DOCVARIABLE field; its editable engine anchor ends at offset 1. Ordinary plain
   paragraph text excludes its cached title. Preserve the original field and cached
   title. Check actual editing plus Undo/Redo where supported by the owner’s driver.
4. Save using the recommended DOCX document format through native app behavior.
   Record path, file bytes and SHA-256. Fully quit the app, verify termination, then
   reopen the saved file in a new process with a new PID. Confirm retained content
   and edit; save again if needed for the independent reopened-file audit.
5. Run `format30-stw-oracle.py source original.stw --report source-oracle.json`,
   then `format30-stw-oracle.py audit saved.docx --oracle source-oracle.json
   --marker " — STW30 EDIT 2026-11-23" --report saved-oracle.json`.
   Audit the reopened save independently as well. These are ZIP/XML checks and do
   not invoke an office runtime. Preserve actual native test evidence separately.
6. Re-hash the original STW. Record the package/source/OS, actual opening/saving
   route, results, native process/PID checks, XML audits and any missing checks.
   Preserve test artifacts and close the owner's own app/test/capture resources.

For the browser case, use the actual supported deployed/local browser build at both
routes. Attempt the real STW open path and verify clear STW desktop/DOCX advice,
no empty imported document, and preservation of the current document. Record the
browser/build/source and actual UI result. This is a limitation check, not STW
browser conversion support. Preserve existing document state and test ownership.

Send results through integration for inclusion in this route's final evidence.
Missing or blocked checks remain explicit; no native result is inferred from the
successful Linux private converter/Writer-engine roundtrip.
