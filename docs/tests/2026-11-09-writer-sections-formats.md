# Writer section settings and formatting marks (#55)

The existing section controls from PR #185 are retained. This follow-up covers section-boundary marks and independent section settings through native editing and ODF conversion. The shared header/footer and ODF conversion composition is owned by PR #242; its section metadata module originates in commit e4e71c5 and must not be applied twice.

## Behavior

View → Formatting marks toggles paragraph marks and section-boundary labels for the current document. The labels distinguish continuous, next-page, odd-page, even-page and next-column boundaries. The final document section property is not shown as a boundary. Conversion-created empty boundary paragraphs anchor their label to the preceding visible text. The overlay does not edit document content, add undo entries, intercept input or appear in print/PDF.

Marks use the current layout and visible page fragments. Paragraph spans and section anchors are cached for the document version; ordinary editing with marks disabled does not request paragraph geometry.

ODF metadata records section page choices and header/footer sharing identities without storing document text. Restoration requires unchanged content.xml and styles.xml hashes, the expected section count and usable converted header/footer references. External ODF edits or invalid metadata keep the runtime-converted result. The ODF mimetype remains the first uncompressed entry; the content and style parts are not changed by this metadata.

## Validation

- Eight generated fixtures: one to four columns, continuous and next-page sections, three sections with distinct margins and orientation, separator/spacing, a column break, first/even/default headers and footers, linked final-section bands, and PAGE/NUMPAGES fields.
- Two native edit/save/reopen cycles preserve all section choices, header/footer references and fields. Link/unlink checks preserve the expected band identities.
- Real LibreOffice DOCX → ODT → DOCX conversions, followed by two native edit/save/reopen cycles, preserve the same section semantics. Reproduce with `node scripts/test-writer-secties-formaten.mjs --soffice /path/to/soffice`.
- DOCX and ODT reference PDFs from LibreOffice retain the same text and page sizes for all eight fixtures. Native Studio print/PDF was separately inspected: portrait/landscape pages, four columns with separators, a column break, linked bands, Roman page restart and searchable body text are present. The native fixture has five physical pages, including automatic blank parity sheets under different odd/even bands and odd page-number restarts; this is not a claim of pixel-identical pagination with LibreOffice.
- Production UI: marks toggle without making the file dirty; a converted empty section boundary visibly shows “Section break (continuous)” beside the preceding text. Native print/PDF contains no overlay marks.
- Engine tests cover all five section boundary types, no final-section label, no content/history mutation, native save/reopen and empty conversion paragraphs.

These are generated fixtures, not the unavailable original DOCX from issue #130. Historical installers are unchanged.
