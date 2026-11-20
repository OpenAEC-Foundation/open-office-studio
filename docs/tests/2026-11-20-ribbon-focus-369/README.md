The Linux ribbon keyboard-focus defect is tracked separately as #369, related to the native acceptance gap encountered in #362. Product commit 49ea8576222af1824628502b5b59243c0a297e9d changes only Lint.tsx/focus.ts; QA and runner-mirror changes are separate commits.

Exact WebKitGTK 2.50.4, real owned-window pointer/XTest input: old ArrowDown/Right gives two states without focus-visible; Tab gives three visible states; the standard keyboard focusVisible option gives two visible states. Trusted input, document focus and exact window ownership are recorded. This is a standalone cause diagnostic, not Office-native acceptance. The final two GTK images show the preceding paint frame; they do not certify the last target.

The actual React ribbon component passes 16 headless Chromium keyboard/pointer cases. Its minimal styling and default outlines do not validate the full Office theme, 4px ring, clipping, collapsed popup or native app. 19 targeted existing unit tests and TypeScript pass. Old failed attempts are kept separately with their exact scope.

Full new-source browser/native validation remains open. In particular Linux 923/Forge+Light collapsed Delete and Enter/Escape, strict 4px/Y geometry, native Windows/macOS checks and the separate WebDriver screenshot timeout remain unresolved. No old failure, partial Tab result or green build is relabelled.

receipt.json contains exact source/harness/artifact hashes, source links, failed-attempt classifications and cleanup. No local GUI/capture, main write, tag, publication or issue closure occurred.
