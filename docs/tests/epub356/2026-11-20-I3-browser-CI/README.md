# I3 browser CI audit: Windows, Linux and macOS

Existing CI run `44716499924` completed successfully for all three OSes and
both `/` and `/office/` routes. Application source is I3
`7f126f4b8e5269a54388cf78c48c78d2acc0daa1`, tree
`8bc608488760e48919d7fb4e72a42569175b52a4`; separate QA harness source is
`61d277d64798d9e765ba04a2205ca576944d70aa`. The issue's consumer runs from
the exact application checkout. Each receipt/probe report binds application,
tree and exact route; aggregate summaries separately bind the QA harness.

This is a read-only audit of retained evidence, with no new application,
preview, native operation, build or CI run. Official ZIP digests and relevant
original ZIP/extracted bytes were checked. Each actual saved DOCX passed the
independent content/image/order/source-preservation oracle, and its full
`EPUB356 EDIT` marker was independently found in XML. All six routes passed.

The same issue agent covered all eighteen original PNGs: eleven unique images
were viewed individually in sequence; three identical images reused that
review, and four Windows images reused the parent's exact-byte I3 local image
review. The full review and per-image hashes are in `audit/audit.json`.
Book content is readable. Early gallery loading, disabled ribbon/ruler layout,
replacement-font notices, partial marker visibility and fading-toast limits are
recorded; this is not full glyph/pagination or native/#359 acceptance.

`hashes.json` maps archived original reports, build receipts, QA summaries,
saved DOCX, PNGs and the independent audit files. Text conversion is disabled
for exact byte preservation. Original paths inside JSON remain unchanged.
The original audit SHA-256 is
`57350092ec1d3e14661f06988953d2bcca0564cb6a7c180f191703d93352fe21`;
its original checksum manifest has SHA-256
`e657529ec18d6de9e4bc3343bac9ea36cd05d9a47cd3717d3a796c826e05017f`.

Native I3 acceptance still requires its separate canonical installer release
and native save/new-process reopen proof. Historical native I2 results remain
at I2. The user's 15:20 Amsterdam safe stop remains in force.
