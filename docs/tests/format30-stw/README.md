# One genuine legacy STW route — P2 QA

The bounded Linux converter/Writer-engine route passes on application commit
`dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b`, tree
`5a644e397ecc6af5452a49b6404edf953687d1b2`, version `2026.48.1`.
This adds evidence under [#30](https://github.com/OpenAEC-Foundation/open-office-studio/issues/30).
It does not close the overview or promote release/catalog coverage.

## Source and independent oracle

`source.json` pins LibreOffice/core `qadevOOo/testdocs/report.stw` at its original
2003 commit. The 11,186 original bytes are an OpenOffice.org XML 1.0 ZIP generated
by StarOffice 6.0 (Win32). Upstream's actual addTemplate test independently confirms
template use. The early generic Writer manifest and missing mimetype entry remain
unchanged; this is neither a renamed modern template nor a generated stand-in.

The Python oracle reads original content/styles/defaults/inheritance independently
of converter and engine output. It requires all eight nonempty body blocks in
order, source-derived size/bold/alignment/caps/small-caps properties, and Heading 1.
There are no source tables, so no nonempty table coverage is claimed.
The two text-placeholder prompts/types/descriptions must survive as showing-placeholder
DOCX text content controls. Generated field-display angle brackets are distinguished
from literal brackets in the cached index entry using the original XML and the
exact runtime's source code. Flattening the controls to plain text is rejected.
Five focused local ZIP/XML-only oracle tests pass; no local office runtime was run.

## Actual Linux execution and reuse

1. [45146601537](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45146601537)
   ran the real P2 production opener with the real pinned private Linux converter
   through its injected dependency seam. No system office installation or suite
   build was used. Runtime archive SHA, executable SHA and full file inventory were
   recorded. The job then failed in the initial field-display oracle, before engine
   testing. Its failed report is preserved, not reclassified as a successful job.
2. `conversion-binding.json` pins the small origin artifact and every reused report,
   inventory and converted DOCX byte. The original STW, P2 source/tree, profile,
   engine WASM and runtime manifest pin are checked again. Subsequent jobs execute
   no converter and download no additional runtime; they reuse only that verified
   actual conversion from the same P2 codepoint.
3. [45148579361](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45148579361)
   at harness `ecac5b1f187cdbbfcf998368c5453d4c20eece75` passes. It loads the real P2
   private Writer kernel, opens the converted document, checks source text, appends
   a marker after the title DOCVARIABLE field using the exported engine anchor,
   checks Undo/Redo, saves DOCX, opens it in a fresh session, and saves again.
   Independent OOXML audits pass on conversion, edited save and reopened save.
   The engine's three existing production compatibility transforms are hashed.
   Two sessions are destroyed, the private kernel copy and Vite loader closed.

The initial title-selection failures in runs 45148093421 and 45148343264 were test
driver errors: this real title is a DOCVARIABLE field, whose cached text is not the
plain paragraph text and whose edit offset comes from its field anchor. The final
driver preserves this field and uses offset 1. These failed attempts remain visible.
No independently reproduced product failure was found in this bounded route;
no new bug issue or product patch was created.

`result.json` records run/artifact/fixture/runtime/file bindings and limitations.
The passing artifact is `format30-stw-Linux`, ID `14805835511`, SHA-256
`d1bba8b2951d0382dd7b2d2d14e977918b102a018c94eecbe5e6af97986c93d5`.
Its payload contains the immutable input, original failed conversion report, full
runtime inventory, engine snapshots, all three DOCX files and XML audit reports.

## Package/platform limits

The executed source runtime is the exact P2-pinned Linux archive. The subsequent
canonical payload comparison **passes**: all 13,946 recorded files have the same
path, byte length and SHA-256 as the actual runtime in the P2 DEB. There are no
missing, extra or changed payload files; this runtime payload has no symlinks.
The launcher and ELF identities match. `package-binding.json` records the complete
parent/producer/manifest/API chain and metadata comparison. Its DEB
SHA-256 is `23258ac32f9368a6512b04ffcfda9a3f2be50dafeee6d8c7ca36a3a525a5f5d1`.
No full release package was downloaded here. Integration independently hashed the
single shared runtime-only artifact ZIP and exposed its small entry manifest. This
chat's bounded prefix retrieval obtained the identical manifest with 5,963,776
transferred bytes; its SHA-256 matches the immutable Git-pinned descriptor. The
shared manifest covers 15,082 entries including directories and package metadata.
No runtime TAR was extracted or executed again by this chat. The full ZIP's digest
is integration's check, not a claim that this chat hashed the entire ZIP.

Source-runtime metadata under `meta/` remains visible. The notices and `.keep`
match; receipt fields match except for `preparedMs` (22,546 versus 33,554). Original
execution permissions were not recorded; the canonical file modes/link roundtrip
were verified by the shared producer, not inferred from the old inventory.
The 13,946 runtime payload entries have canonical JSON SHA-256
`99ebec8e27cba9c102abcf2014d761788e6e44ec5ec5581dc85897a21898f6ae`.

| Platform/route | Evidence | Remaining |
| --- | --- | --- |
| Linux private converter + live Writer kernel, canonical DEB runtime payload | Passed on exact P2, including all payload file identities | Native UI/IPC/dialog and installer acceptance |
| Browser | Node guard passed; additional actual Linux Chromium `/` and `/office/` test in progress | Actual browser artifact audit pending |
| Windows | No runtime/GUI execution in this assignment | Native checks remain open |
| macOS | No build or runner claimed | Native checks remain open |

`native-handoff.md` records integration's current Windows, Linux and macOS owners,
their acceptance steps, and the current browser assignment. Assignments are not
native passes. The actual standalone app bytes/results remain with integration.

This is body-text/selected-style/placeholder evidence for one real template.
Headers/footers, full TOC evaluation, pagination, font substitution, universal STW
variants, GUI/keyboard/file-dialog/native Rust IPC and installer acceptance are
outside this probe. No local GUI/capture or user-profile session was started.
Old PR344/PDF work remains stopped. No main/tag/release/publication, shared file,
product code, version or catalog claim was changed.
