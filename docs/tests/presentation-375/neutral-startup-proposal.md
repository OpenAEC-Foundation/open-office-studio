# #375: neutral startup differential for review

Prepared from QA commit `9af1844fe9b3aab10efb5349d0c9ac237f923858` under the
integration coordinator's test-only authorization. No build, VM, runtime allocation
or Office execution is authorized by this preparation. The existing workflow and
source-build controller are unchanged and do not yet consume this proposal.

## Exact source and minimal change

Upstream remains LibreOffice `9dea406ab7695df6325b11b0e19fdca8db4b7276`.
First apply only the existing #375 test diff/fixtures and the reviewed simpress UI
test-recipe patch. Keep the production importer original. Then the new
`375-neutral-startup-proposal.patch` changes only:

- `xmloff/qa/unit/draw.cxx`: an own diagnostic fixture, explicit A/B choice,
  phase observations and an independent blank-Impress startup control. The
  original UOP color/save/reopen/XML assertion block is byte-for-byte unchanged.
- `xmloff/CppunitTest_xmloff_draw.mk`: direct `svt` test linkage for the directly
  called `SVT_DLLPUBLIC` SvtMiscOptions constructor/destructor/accessors. No new
  external dependency or product-library change is proposed. Linking is not yet
  compiler-validated.

Patch SHA256: `1e7134852548e4f37b1073755882ab1a42ed0f63931acca8c62624364b358a84`.
The JSON manifest binds before/after bytes of both files. `neutral_startup.py`
also verifies the original importer, options implementation/header, ItemHolder2,
UnoApiTest and canonical CppunitTest recipe. Its default action is read-only;
`--apply` applies only these two verified QA files, never builds or runs Office.

## Arm choice and object lifetime

Only `OOS_375_STARTUP_ARM=A` and `B` are accepted; unset means A. Any other value
fails before document loading. Both arms use the same compiled test binary and
configuration, with no intervening source edit or relink. The new binary is not
claimed byte-identical to an earlier failed witness.

A uses the original setup: it never constructs SvtMiscOptions or calls its
accessors in the diagnostic code. Both arms assert no component and zero desktop
documents/frames before any document load and record the observed phase.
These counts observe the current desktop; they do not establish the history of
earlier indirect options construction or any transient frame in base setup.

B constructs ordinary SvtMiscOptions only after those empty-desktop checks. It
uses the configured defaults, calls no setter, then observes the effective theme
and whether it was selected automatically. A fixture-owned unique_ptr keeps the
object alive through the entire test, original assertions, document disposal and
base teardown. It is explicitly reset only after base teardown returns. If setup
or teardown fails, ordinary fixture destruction still owns its lifetime; no
temporary's implicit retention by ItemHolder2 is assumed.

No shared BootstrapFixture, UnoApiTest, product guard, chosen theme, Hidden
document load, skipped view or LOK activation is changed. No new date/color/
geometry normalization, fixture replacement or fourth initialization arm exists.

## Proposed single-allocation execution, not connected or run

`neutral_startup.plan()` describes exactly four separate invocations: blank A,
blank B, authentic UOP A, authentic UOP B. Each is a new process; blank uses the
existing `private:factory/simpress` route, UOP retains its original loading route.
Canonical pinned `CppunitTest.mk:148-149` recreates the test's `.user` directory
from `workdir/unittest` for every invocation. Thus the URL/path is the same but
the directory is freshly created each time. An allocated controller must retain
each completed directory under its distinct `startup-profiles/<route>-<arm>`
label before the next call, record directory identity and configuration hashes,
and demonstrate that no previous profile content is reused. There is no new
bootstrap argument, alternate configuration or unsupported profile override.

The future controller must hash the compiled test library, loaded runtime
libraries, original importer, source/configuration, unchanged UOP, installed UI
resource and canonical profile seed before and after the four invocations. It
must preserve each process result, phase markers, test log, actual stack/core
where retained, profile receipt and cleanup. A's startup failure remains a real
failure, never the expected color red. An approved diagnostic may compare that
failure with B; this does not permit unrelated retries or initialization variants.

All execution still requires a separate explicit integration allocation. No
exact reusable binary/host/cache is known. A source build would need new absolute
epochs and resource/toolchain/source/fixture gates, at most 270 minutes total,
45 preparation, 210 compiler/test within the remaining 260-minute controller,
and 10 minutes reserved for upload/cleanup. No auto-retry, extra VM or paid host.
These are proposed upper bounds, not an allocation.

## Criteria and causal limits

- Original importer plus UOP B must reach the unchanged
  `UOP375_STALE_INHERITED_FILL_THEME` equality assertion in the named test.
  A different assertion, crash, timeout, missing resource or teardown failure
  remains a failure. Merely finding the marker text does not prove the required
  assertion outcome.
- Blank A/B distinguish startup sensitivity from the authentic input's color
  problem. A startup failure and B reaching the original color red support an
  initialization-order hypothesis; they do not identify the invalid runtime
  object or establish a product/native/visual fix. Instrumentation and common
  linkage effects remain causal limits.
- If no clean original color red is observed, retain the new failure and stop;
  do not apply the importer or start another build. Even a useful differential
  needs the coordinator's technical review before it becomes an accepted setup.
- Only after that review may the unchanged importer patch `e29ec641...` proceed
  to full xmloff_draw and scoped converter/engine/edit/Undo/Redo/PPTX-save/fresh-
  reopen validation under a newly recorded source/build/runtime identity.
  This proposal neither runs nor automatically enables that continuation.

Six offline controls pass: exact patch/application plus the complete unchanged
oracle; changed recipe refusal; weakened color-oracle refusal; changed options
implementation refusal; already-modified importer refusal; and exactly two
arms/two document routes with separate fresh-profile labels. These are static
source controls, not C++ compilation or runtime acceptance.

All historical failures and UI-resource evidence remain unchanged. Linux C++/
runtime/color acceptance and Windows/macOS/browser/native acceptance remain OPEN.
P5/release, product runtime pins, versions, main and publication are untouched.
