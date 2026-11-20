# Original I2 browser evidence for #356

These are unmodified copies of this chat's actual local Windows headless
Chromium results at application `5acab18c516e1fb07118cb41f807a3c0e05182bf`,
for normal `/` and hosted `/office/` routes. They are not native desktop
acceptance or three-platform browser CI evidence.

`hashes.json` maps the original integration-checkout paths to the archived
copies and records their exact byte lengths and SHA-256 values. The original
paths in the copied reports and build receipts remain unchanged. Both source
and copied bytes were checked against the original handoff manifest before
commit. `.gitattributes` disables text conversion for this evidence directory
so that JSON, logs and binary files retain their original bytes in Git.

Each route retains the report, independent saved-file oracle, real saved DOCX,
three original screenshots, execution timestamps/exit status, stdout/stderr,
and integration's shared-build receipt. The build's asset hashes are retained;
the complete generated application build is not included here. The copied
handoff records independent original-image review and resource cleanup.

Original book headings, text, image and table are readable. Early reopening
images show the style gallery loading and do not make the edit marker's
leading characters fully legible. The complete edit marker is confirmed in
the saved DOCX XML. The malformed-input toast was captured during an opacity
transition, separately from its successful DOM assertion. These limitations
remain open visual acceptance limits; no #359 diagnosis or resolution follows
from the file/content passes.

See `../2026-11-20-status.md` for the remaining native checks and the user’s
15:20 Europe/Amsterdam safe-stop instruction.
