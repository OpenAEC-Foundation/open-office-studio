# #375: third witness and minimal initialization proposal

Status on 2026-11-24: integration subsequently permits **reviewable test-only
harness preparation**, with no new build/VM/cache allocation yet. P5 package
verifier `45352330223` and the independent LinuxSuite final audit must finish;
no critical P5 Linux job may be queued at a new allocation. A separate explicit
allocation is still required; no automatic dispatch follows those conditions.
No changed runtime or production fix is accepted.

## Actual result

[Run 45197419347](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45197419347),
attempt 1, job 137771513436, ended on 2026-11-23 at 18:38:04 CET with FAILURE.
Exact QA: `e0883ddfb8bc516651048f2dc5afea4c66b3982e`; upstream:
`9dea406ab7695df6325b11b0e19fdca8db4b7276`; unchanged importer/test patch SHA256:
`e29ec641661c7d114606f058d2e36c5744673cf6ea1781590938d9c5d927f2b4`.

Official artifact 14846696988 is retained byte-for-byte in
`retained/source-witness-45197419347.zip`: 232,119 bytes, SHA256
`e28adc4eb04ee3d8b4c2f7d1a925211d509a4a156e912532728983a5acde2e56`,
expiry 2027-02-21T14:44:25Z. All 22 retained stage-log hashes were verified.
`third-source-outcome.json` contains the source/config/artifact bindings.

PASS: resource/source/fixture/toolchain gates, configure, seven actual Linux
target-selection controls and CLI prerequisite make (3166.7352 seconds). The
previous optional-ooenv target-selection fault is corrected on the real VM.

The new test compiled, linked and started. The baseline make returned exit 2
after 7044.8653 seconds: SIGSEGV during original-importer `loadFromFile`, with
`rtl_uString_release`, `sd::ViewTabBar::~ViewTabBar`, ViewTabBar construction
and Impress view initialization on the stack. The required stale-theme assertion
was not demonstrated. This crash is not the expected red test. The production
importer diff was never applied; corrected/full draw tests, converter/engine/
save/reopen and runtime packaging were not reached. Earlier failures stay FAIL.

## Narrow source finding and uncertainty

[ViewTabBar.cxx:445](https://github.com/LibreOffice/core/blob/9dea406ab7695df6325b11b0e19fdca8db4b7276/sd/source/ui/view/ViewTabBar.cxx#L445)
requires `modules/simpress/ui/tabviewbar.ui` during TabBarControl construction.
[UIConfig_simpress.mk:175](https://github.com/LibreOffice/core/blob/9dea406ab7695df6325b11b0e19fdca8db4b7276/sd/UIConfig_simpress.mk#L175)
declares that existing resource. The
[UIConfig package mapping](https://github.com/LibreOffice/core/blob/9dea406ab7695df6325b11b0e19fdca8db4b7276/solenv/gbuild/UIConfig.mk#L98)
places it in `instdir/share/config/soffice.cfg/modules/simpress/ui/tabviewbar.ui`.

The pinned
[xmloff_draw recipe](https://github.com/LibreOffice/core/blob/9dea406ab7695df6325b11b0e19fdca8db4b7276/xmloff/CppunitTest_xmloff_draw.mk)
has no explicit UIConfig dependency; neither retained make log records a
UIConfig build. The artifact has no installed-tree manifest, so actual resource
absence and crash causality are **not independently proven**. This is a
source-established dependency gap and an initialization hypothesis.

Missing liblangtag registry warnings are a separate observation, not an
established crash cause. No language-data/environment correction is bundled.

## Reviewable proposal; not applied or executed

`375-test-initialization-proposal.patch` adds only the standard
[Cppunit UIConfig dependency](https://github.com/LibreOffice/core/blob/9dea406ab7695df6325b11b0e19fdca8db4b7276/solenv/gbuild/CppunitTest.mk#L472)
on existing `modules/simpress` to the test recipe. Its input/output recipe and
patch hashes are in `third-source-outcome.json`. It is separate from the unchanged
importer patch and has not been applied to the primary source cache or executed.
The own QA harness is now prepared to verify and apply it only in a later
explicitly allocated source witness.

Keep the original UOP, actual Impress opening, RGB/content assertions and
save/reopen semantics. Do not skip the view, simulate the importer, loosen the
baseline matcher or treat SIGSEGV as a color failure. No ViewTabBar/product fix,
configuration/dependency set change or runtime pin is proposed.

Only after a separate allocation, bind the exact host/cache/source/toolchain and
both patches; build the declared UI dependency and record actual resource
presence/hash. Require the genuine original-importer stale-theme assertion before
applying the production correction. Then compile it, run full `xmloff_draw` and
the independent converter/engine/edit/Undo/Redo/PPTX-save/fresh-reopen oracle with
new binary identities. If initialization still fails, preserve it and return for
bounded diagnosis; no automatic unrelated repair or extra build follows.

Corrected-runtime Windows/Linux/macOS/native and real browser checks remain
outstanding. No P5 intake, product activation, main/tag/publication or new
allocation follows from this proposal.

## Prepared own harness, without a build

`test_initialization.py` verifies the exact patch and primary recipe/resource/
gbuild hashes. The harness adds only that test-recipe patch, matches the actual
configured workdir to the pinned canonical UIConfig `.done` target, and will
record the installed `tabviewbar.ui` bytes/hash before the baseline test and
again after corrected draw tests. The retained source tree and new runtime
descriptor include this separate test-recipe change and its resource receipts.
All make work, including UI resources, counts toward the existing 210-minute
compiler/test ceiling and remaining total limit. Configuration, dependencies,
upstream and production importer patch are unchanged.

Four local source/resource controls pass using small cached primary inputs and
temporary authored installed-file controls. They exercise exact input/target
mapping, changed recipe rejection, missing resource rejection and exact/changed
resource bytes. No LibreOffice or make is executed. The existing proposal
context check and AST/whitespace checks also pass. See
`test-initialization-harness-checks.json`; this is not initialization/runtime
acceptance and does not establish the crash hypothesis.
