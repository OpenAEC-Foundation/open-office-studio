# Original I3 browser evidence for #356

Both actual local Windows headless Chromium routes `/` and `/office/` passed
at I3 application `7f126f4b8e5269a54388cf78c48c78d2acc0daa1`, tree
`8bc608488760e48919d7fb4e72a42569175b52a4`. Integration built the shared
727-asset outputs; this chat consumed their strict receipts without rebuilding,
installing dependencies or changing application source. Source was clean
before and after. The read-only lease is released.

This archive retains 21 byte-identical original files: actual saved DOCX,
independent oracle, reports, original PNGs, execution logs and shared-build
receipts for both routes, plus the final handoff. `hashes.json` maps the original
integration-checkout paths. Text conversion is disabled for exact bytes.

The real EPUB/offline edit/DOCX download/reopen and malformed-input/tab
preservation assertions passed. The independent file oracle checked chapter
order, content/Unicode, Hout/42 in the same row, original EPUB preservation and
the exact referenced PNG. The parent separately confirmed the full edit marker
in both saved DOCX XML files. Reports record no JavaScript errors, no external
requests, no native bridge, successful cleanup and exit zero. Owned browser,
context and preview processes closed; no GUI/Computer Use recording started.

The parent viewed all six original PNGs individually in sequence and verified
their hashes. Original book headings, body/list, PNG and table are readable.
Early reopen images still show the gallery loading and do not make the added
edit marker's leading characters fully legible. The malformed-input toast is
captured during an opacity transition, separately from its passing DOM check.
These are explicit visual limits, not complete glyph/pagination acceptance or
a #359 diagnosis. This is local Windows browser evidence, not native desktop
operation or the complete three-platform browser CI matrix.

Final handoff SHA-256:
`64d231d696d942c597b53309bfb79978863e9fed682818ca266c9be83d70d7ef`.

| Route | Report SHA-256 | Build receipt SHA-256 |
| --- | --- | --- |
| `/` | `da24ffaf26516c9e1a6b8a64410118291aacff27682ad3c4eaa0ba8658b46322` | `8f1f4ac5bea1ee075935561c5c97e41f081380ee2371ebf2d1fe912d262b6b27` |
| `/office/` | `c351040495b3cedfce22ca8d40751437c285838632f0c039c6c8621c062055df` | `51f84eebb1963332f5272df61120ea9a3dadd45f5e7785bc329cd325ba571d63` |

Native I3 tests still await integration's exact canonical packages/manifest.
Historical I2 results remain separate and have not been relabeled.
