# Issue 382: filename policy only

Product commit: bb781170bb28880e597cfbcb5293872f62b0fecc, based on unchanged
P5 b696ab86bd1c128729a079b68c0082e6df3d36a5. Product delta is limited to
src/import/sjabloon.ts and its existing test module. Integration into a future
product round and PR base remain coordinator-owned.

Windows regression: six ETT/DPT filename cases fail before the fix, while
19 controls pass; all25 pass after the fix. The shared production function
is also executed through Vite SSR, not copied or reimplemented.

policy.mjs probes62 filenames through the actual production module:
six lowercase/uppercase/mixed-case ETT/DPT cases, existing template controls
and ordinary ET/DPS/document controls. Browser mode loads that same module
through production Vite configuration in a headless existing CI browser.
It serves an isolated blank test page and does not start the application.
All created browser/server resources are closed in finally.

Replay from the exact product checkout with its frozen dependencies:

    node PATH_TO_QA/policy.mjs APP_COMMIT NEW_OUTPUT node
    ISSUE382_BROWSER_EXECUTABLE=EXISTING_CHROME node PATH_TO_QA/policy.mjs APP_COMMIT NEW_OUTPUT browser

The CI workflow checks out the exact product commit/tree, retrieves only the
QA helper from its separate workflow head and retains JSON receipts. Its push
trigger runs Ubuntu only. macOS is manual and may run only after integration
confirms no queued critical P5 Mac job. No native app, application build,
Office runtime, browser download, content/conversion/save or corpus test.

No qualified original ETT fixture or qualified DPT content oracle is supplied.
These checks do not establish import, engine fidelity, new-document behavior,
source overwrite protection or native platform acceptance for either format.
Existing fixture/source research remains with its previous owner.
