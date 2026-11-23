# Native Find and two-document isolation passed

Run 45165715341, QA 021c3ff3a6db30e41218b32114d6f4fd5cde2de9, exact unchanged P2. Artifact 14813629072; ZIP 1ebbd602018702cd3333f647a2cbf5c71ca3c47d771aee404f7bf1ccda43c0e9.

The genuine visible first-cell click, native X, Command-save/XML and Undo/Redo/reset passed. Command-F opened Find; actual native abc typing, Undo to empty, Redo to abc and reset all kept the inserted-column sentinel intact. Native Escape restored Document input; document Undo then restored its original three columns. Original Find-typed and Find-Undo displays were inspected. Capture binds the exact unique AX/CG main window when auxiliary windows exist, preserving original pixels without changing app focus.

A second private copy opened in the same PID. Genuine native document tabs selected A/B; each document's Undo/Redo affected its own table only. Both were normally saved. Independent final private DOCX XML is A=3x4 with the inserted column, B=original3x3 with every original cell intact. Both final original displays were inspected. Normal Command-Q closed the app and its owned container was removed.

The immediate B snapshot was taken while its expected original cells were already present, before the asynchronous save replaced those bytes. Its original-fixture hash is retained. The final private B bytes match the report (5f300f3d60a8303c7227a403dac1777bc123dadecbb9d4b2bb2d35e87ac3767f) and independently confirm exact original3x3 after save. Both versions are preserved; final acceptance uses the actual final private files, not that early B snapshot.

Scoped Find/two-document controls pass. The report keeps nativePass=false and retains earlier Tab AX failures. No full issue361/modal/signed-package acceptance is claimed. Only the missing bounded Tab-history saved-XML observation remains in this scope.
