# #375: bounded Linux source-build/test proposal

**Status on 2026-11-24: the fourth witness stopped on an own resource-build
invocation error before the baseline test. Earlier failures remain unchanged;
initialization, patched importer/Cppunit and runtime acceptance are unproven.
The reviewed source-wrapper correction is now running in one separately
allocated fifth witness; no new acceptance is inferred.** This is a private QA witness for the reviewed importer patch,
outside P2/P3/374 intake. It does not authorize application installers, macOS
builds, a runtime catalog pin, release publication or a main merge.

## Concrete inventory, 2026-11-23

- This repository exposes zero self-hosted Actions runners.
- All 29 visible Actions caches were inspected. Relevant caches contain packaged
  runtime assets or Rust targets, not a LibreOffice source/configuration/build
  tree or ccache. A ~221 MB Linux `kantoorruntime-*` cache is a binary input.
- The existing application recipes download/extract the official runtime. No
  LibreOffice autogen/make recipe was found in its scripts/workflows.
- The known local STI source cache and this task's cache contain selected source
  files for read-only research, not a configured build tree. No local Windows
  runtime compilation or GUI is proposed.

An external existing build host/cache may still be assigned by integration; none
is assumed or claimed here. If assigned, first record its commit, configuration,
compiler, dirty files, disk and ABI before reusing it.

## Source/toolchain constraints verified from primary sources

Exact upstream source: `9dea406ab7695df6325b11b0e19fdca8db4b7276`.
Its [README](https://github.com/LibreOffice/core/blob/9dea406ab7695df6325b11b0e19fdca8db4b7276/README.md)
and [configure.ac](https://github.com/LibreOffice/core/blob/9dea406ab7695df6325b11b0e19fdca8db4b7276/configure.ac)
require GCC >=13 or Clang >=18 and C++20, with JDK >=17 for Java build parts.
The JDK 11 used successfully as the existing UNO diagnostic client is **not** a
suitable source-build toolchain.

The current [Ubuntu 22 runner image](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2204-Readme.md)
lists GCC up to 12 and Clang up to 15. A compatible newer compiler is therefore
not assumed on that image. Switching directly to an Ubuntu 24-built runtime
would also change the libc baseline; it must not silently replace the existing
runtime tested on Ubuntu 22.

## One proposed cold-build witness, after allocation

Use an own **Ubuntu 24.04 x86_64** job, explicit GCC 13 and JDK 17, Python 3.12,
GNU make and the recorded Ubuntu package toolchain/dependencies. This first
witness is only accepted on Ubuntu 24; it makes no portable Ubuntu 22/RHEL9 or
Windows/macOS runtime claim. A later distribution runtime needs its own
coordinated baseline-compatible toolchain and platform build plan.

1. **Preflight only, <=5 minutes:** record image version, `uname`, CPU count,
   `free`, `df`, compiler/linker/JDK/Python/make versions and existing relevant
   packages. Require at least 4 CPUs, 15 GiB usable RAM and **65 GiB free space in
   one task-owned source/build filesystem**. Stop before source download if any
   gate is missing. No arbitrary system-directory cleanup, new paid runner,
   global swap/sysctl change or assumed persistent cache.
2. **Acquire/configure, <=30 minutes:** one shallow upstream checkout of the
   exact commit, no history beyond that input, in an isolated job directory.
   Verify Git commit and the patchset's primary file hashes. Record all fetched
   external archive hashes. Install only the agreed Ubuntu build dependency
   packages, recording exact versions. An unresolved toolchain dependency is a
   concrete stop, not an automatic third-party compiler installation.
3. Use a development configuration with Impress/Draw and the UOF/XSLT and OOXML
   filters intact, `--disable-mergelibs --disable-lto --disable-debug
   --disable-dbgutil --disable-symbols --without-help --without-myspell-dicts
   --with-lang=en-US --with-parallelism=3`, GCC13/JDK17 explicit. Confirm every
   switch against the pinned configure before running; record the complete
   autogen input/configuration. This configuration is deliberately **not** an
   ABI-compatible binary replacement for the official merged P2 build.

   Proposed dependency recipe, only after allocation: the official Ubuntu 24
   `apt-get build-dep libreoffice` source-package dependency set, plus explicit
   `gcc-13 g++-13 openjdk-17-jdk gperf bison flex zip unzip python3-dev
   libxslt1-dev`. Record the source-package version, repository URLs and every
   installed package version/archive checksum before configuration. This is a
   starting recipe rather than a claim that Ubuntu's older LO dependency set
   already satisfies the pinned newer source; stop on unresolved requirements.
   No third-party PPA or compiler-from-source bootstrap is included.
4. Install only the new test diff and unchanged genuine UOP/authored control
   fixtures first. Build/run
   `make -j3 CppunitTest_xmloff_draw CPPUNIT_TEST_NAME=testUOFExplicitRectangleFillColors`
   against the original importer. Keep a red result only if it is the expected
   stale Accent1 assertion, not a dependency/compiler/filter failure.
5. Apply only the importer diff and verify its exact patched hash. Run the full
   `make -j3 CppunitTest_xmloff_draw`, including the new inheritance controls and
   existing draw/theme tests. This is a real LibreOffice target: the pinned
   [module definition](https://github.com/LibreOffice/core/blob/9dea406ab7695df6325b11b0e19fdca8db4b7276/xmloff/Module_xmloff.mk)
   and [test recipe](https://github.com/LibreOffice/core/blob/9dea406ab7695df6325b11b0e19fdca8db4b7276/xmloff/CppunitTest_xmloff_draw.mk)
   include it. No standalone imitation of the color implementation is accepted.
6. Run the resulting private source-built converter on the unchanged original
   UOP using the safe profile, then the independent source-derived RGB/content
   oracle and actual presentation engine title edit/Undo/Redo/PPTX save/fresh
   reopen. None of these has yet run on the patched importer. Other known
   canvas/stroke source failures remain explicit and outside #375.

**Bound:** one job, <=270 minutes overall; configure/acquisition <=30 minutes,
compiler/test command time <=210 minutes, final private-runtime/oracle receipts
<=20 minutes, remainder cleanup/artifact upload. Stop on OOM, missing dependency,
<10 GiB remaining disk or the time bound; retain logs without retrying the whole
build automatically. All own processes/profile/mounts must be cleaned up.

**Engineering estimate, not a measured promise:** a cold target with its large
LibreOffice dependency graph may need 40–70 GiB disk, roughly 12–16 GiB peak RAM
at three compiler jobs, and 4–8 hours on a 4-CPU host. Thus even the bounded job
may time out; an already allocated 8-CPU/32-GiB host with >=100 GiB free disk is
preferable and may reduce this to roughly 2–4 hours. No such host is currently
available in the repository inventory. This is not a small incremental compile
merely because the source change is small.

[GitHub's published standard-runner resources](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
guarantee only 14 GB storage (public Linux: 4 CPUs/16 GB RAM); the 65-GiB disk
gate cannot be assumed. If the actual preflight is below it, report that
allocation blocker and stop instead of downloading a large source tree.

## Artifact and provenance contract

- Always: a compact JSON descriptor, source/patch/fixture hashes, all compiler,
  linker/configuration/package versions, source status/tree, test commands,
  baseline red assertion, corrected Cppunit XML/logs, resource/failure receipts
  and original/final converter/engine outputs. Cap diagnostic logs at 50 MB;
  do not upload the entire source, build tree, ccache or a release suite ZIP.
- On success only: a separate runtime-only private test payload, if `instdir`
  is complete and self-contained for the exercised conversion/UNO route.
  Inspect its links/licenses/launcher/ELF/dependencies before packing; stop if
  it depends on paths outside its own payload. Do not mix newly compiled pieces
  into the official merged P2 runtime. Limit compressed payload to 900 MB;
  otherwise report the measured size before uploading it.
- Give the runtime a **new descriptor and verifier contract**: upstream commit,
  patch SHA256, patched source/tree, full build configuration/toolchain, QA
  producer commit/run/job, file-mode/link/content manifest, tar/ZIP/launcher/ELF
  hashes, runtime version and safe-profile hash. The old 15,082-entry P2
  descriptor/artifact may only be named as the diagnostic control, never as the
  identity of changed binaries.
- No installer/product/catalog activation follows automatically from this
  witness. Integration must explicitly allocate the later portable runtime
  build and same-source Windows/Linux/macOS/browser acceptance.

## Allocation requested from integration

Approve this single preflight/conditional cold-build witness and identify the
runner label/filesystem, or supply one concrete existing source-build host/cache
meeting the pinned source/configuration requirements. If neither is available,
the reviewable patchset can be retained but must remain **uncompiled/unfixed**;
do not close #375 or present the diagnostic in-memory export as the product fix.

## Measured read-only preflight

[Run 45169505588](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45169505588),
QA `d4690dc3`, performs only resource inventory on an Ubuntu 24 runner. It passes
the proposed gates: 4 CPUs; 16,464,306,176 bytes physical RAM; 94,684,569,600
bytes free in the current-user-writable workspace/runner-temp filesystem;
GCC/G++ 13.3.0, Temurin JDK 17.0.21 and GNU make 4.3 already installed. No large
checkout, package installation, system cleanup or build occurred.

The full [resource receipt](source-build-preflight.json) and official artifact
ZIP digest are bound in `qa-results.json`. This is evidence that an ordinary
actual job **can** meet the gates, rather than a promise about a later VM. The
build job must rerun them before downloading source. The selected compiler,
private build directory and allocation still require the integration decision;
this preflight does not start a build automatically.

## Allocated execution

Integration subsequently authorized this single bounded witness. The source
recipe adds only the CLI launcher/bootstrap and UOF XSLT package prerequisites
needed for a genuine converter execution; all their make time counts toward the
same 210-minute compiler budget. Skia is disabled for this headless development
witness, with no visual/native/backend equivalence claim. A uniquely labelled
baseline assertion identifies the real stale-theme failure. This test-only
change gives patch SHA256 `e29ec641661c7d114606f058d2e36c5744673cf6ea1781590938d9c5d927f2b4`;
the importer output stays SHA256 `6041110c373f1617c1b1f9256e1e056a36cbf6fafb089e60a9e85a7141d0647b`.

First initialization [45172855782](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45172855782)
stops before any dependency/install/checkout/compiler stage because its APT
layout guard does not recognize the runner's mirror representation. The failed
receipt, including an empty stage list, remains preserved. Only that guard is
corrected: verify Ubuntu noble and its trusted archive keyring, add a separate
official archive/security `deb-src` definition, leave existing binary mirrors
in place.

Continuation [45173253806](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45173253806)
on producer QA `088643c02522d62561b6c456cd2d66c5b4062830` retains the **original**
allocated start epoch `1795436242` (13:17:22 Europe/Amsterdam). The single
270-minute window ends at **17:47:22 on 2026-11-23**; the Python stage controller
reserves the last ten minutes for finalization/upload. No second cold compiler
attempt or new 270-minute window is allocated. New resource gates run on this VM
before the large source acquisition. No acceptance result is inferred from an
in-progress job.

## Final preparation outcome

Integration allowed a limited prefix redistribution to **45 minutes**, retaining
the original absolute 17:47:22 end and 210-minute target compiler ceiling. The
prefix ended at **14:02:22 Europe/Amsterdam**. No new absolute window was opened.

The verified sequence and byte-identical official result ZIPs are retained in
[`source-preparation-outcome.json`](source-preparation-outcome.json). They
separate a reader guard failure, a regional package-download timeout, a harness
`autogen.sh` invocation error, a mismatched Python provider, an explicitly
cancelled old-code dispatch after a transient Git push rejection, and the final
proper provider differential. Earlier FAIL/CANCELLED outcomes remain unchanged.

The final [run 45179488558](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45179488558)
on QA `313fcc39900fac5a566f7c4e31ddb4dea6db3c8e` proves the corrected existing
distribution provider: `/usr/bin/python3.12`, Python 3.12.3, installed
setuptools/distutils/lxml and matching development headers, with explicit
`PYTHON_CFLAGS`/`PYTHON_LIBS` from `/usr/bin/python3-config`. Pinned primary
configure lines 10708–10763 accept these explicit variables. The actual receipt
is [`verified-distro-python-provider.json`](verified-distro-python-provider.json).
No new dependency set, upstream Python patch or fallback runtime was used.

The complete exact upstream checkout and patch preconditions pass. Configure
advances beyond the previous Python error and is stopped after 22.0018 seconds
by the **remaining preparation budget**, exit 124, at original elapsed
2699.7293 seconds. It has not completed configuration. No target `make`, red/green
Cppunit, newly built converter/engine run or new runtime payload/binding exists.
The source patch remains **uncompiled and unvalidated as a product fix**.

All task-owned CI attempts have ended; no further VM was started after this
stop. Only a separate explicit integration allocation can resume source-build
work. The already verified source patch/fixture hashes, initializer corrections
and actual provider receipt can be reused; a new build must still verify its
own VM/source/toolchain and record its exact resulting binary identities. No
main/tag/version/catalog/release intake changed.

## Independent second allocation (2026-11-23)

After the original preparation window ended, the user explicitly requested a
new integration-coordinated bounded build. Integration authorized exactly one
independent witness on QA `73653c134cf6a049e273b975ab9b8452b2f45af3`, retaining
patch SHA256 `e29ec641661c7d114606f058d2e36c5744673cf6ea1781590938d9c5d927f2b4`
and the verified distribution Python binding. This does not relabel or extend
the original failed allocation.

Before dispatch, start epoch `1795439943` was recorded: **14:19:03 CET**. The
preparation deadline is **15:04:03 CET**, the stage-controller deadline is
**18:39:03 CET**, and the overall end is **18:49:03 CET**, including ten minutes
reserved for actual upload/cleanup. Compiler/test time is at most 210 minutes
and also bounded by the remaining overall allocation. A new real configure,
compiler or test failure ends this attempt without automatic repair/retry or
another VM.

[Run 45182719759](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45182719759),
job `137720371933`, confirms the exact QA commit and manual dispatch. It passed
the fresh VM resource/toolchain gate and fixed application-dependency step.
The resulting target-selection failure is preserved below; no patched-runtime acceptance follows. The complete
allocation receipt is [`second-source-allocation.json`](second-source-allocation.json).
This is outside P5 and current release intake; no application build, runtime pin,
main/tag/publication or portable-runtime claim follows from this witness.

## Second witness outcome: stopped, no retry

The exact official artifact **14828210064** is retained byte-for-byte as
[`retained/source-witness-45182719759.zip`](retained/source-witness-45182719759.zip),
171,399 bytes, ZIP SHA256
`3cf159df0870d218067b2f2f46e8b23e247f0ea4151bce9531579bb823df56a3`.
All twenty retained stage-log hashes were verified. The structured
[`second-source-outcome.json`](second-source-outcome.json) includes the exact
run/source/configuration binding, primary source hashes/excerpts and failure.

Fresh resource/toolchain gates, official APT dependencies, source/fixture hashes,
distro-Python binding and configure passed. Configuration took 27.8423 seconds;
`config_host.mk` SHA256 is
`dd1a2a7278e926bbb628f48e718ec631d99fbc039f0563faa7710ca14a9ebdd5`.
Actual original-source compilation began at **14:22:33 CET**. The CLI prerequisite
command returned exit 2 after 3916.3008 seconds. The recorded error is:

```text
make[1]: *** No rule to make target 'Package_instsetoo_native_ooenv'.  Stop.
make: *** [Makefile:187: Package_instsetoo_native_ooenv] Error 2
make: *** Waiting for unfinished jobs....
```

This is an **own harness target-selection error**, not a demonstrated importer
compiler/test failure. On the exact source, `Module_instsetoo_native.mk` registers
that package only if `ENABLE_OOENV` is set. Pinned `configure.ac` defaults it off
for this non-debug/non-dbgutil configuration; the retained actual configuration
records `export ENABLE_OOENV=`. The harness nevertheless requested that optional
target unconditionally. Make let its already running parallel jobs complete,
including the original importer and final soffice.bin link, before returning the
failure. That does not prove a complete or usable converter/runtime payload.

The baseline-red stage was not reached. The production importer patch was never
applied in this build; new Cppunit tests, corrected converter/engine edit/save/
fresh-reopen and runtime packaging were not run. No new runtime binding or
product acceptance exists. The job completed at **15:28:04 CET**, well before the
allocated overall limit. No other VM, retry or repair build followed.

For a separately authorized future continuation, first make target selection
reflect the configured module: omit the optional ooenv package when it is not
registered, and check the requested list before expensive compilation. Enabling
an unnecessary ooenv feature merely to manufacture the target is not proposed.
This is a recorded bounded harness proposal only; no new harness/product patch
or allocation is included. The importer patch, all earlier failures and P2/P5
release identities remain unchanged. Corrected-runtime Linux functional checks
and same-source Windows/macOS/browser/native acceptance remain outstanding.


## Reviewable target-selection correction after the new user request

The user requested coordination of a correction and one further bounded witness.
The own QA harness now reads actual generated `ENABLE_OOENV` and includes the
optional target only for `TRUE`. Before compilation it verifies the exact pinned
module hash, target recipe declarations/files and their resolved source paths;
unsupported, missing or duplicate configuration values stop before expensive
work. No `--enable-ooenv`, importer patch, dependency or source-pin change is made.

Seven local controls pass, using the actual failed-run configuration from the
verified official ZIP plus explicit positive/negative controls and small cached
primary source recipes. The same controls are wired before compilation on a
future actual VM. This is only harness verification, not C++ or runtime
acceptance. See [`target-selection-correction.json`](target-selection-correction.json).
At this point no further build has been dispatched; a fresh integration-approved
allocation and its exact epochs/QA commit remain required.

## Third allocation after target-selection correction

Integration authorized exactly one standard Ubuntu24 source witness on harness
commit `e0883ddfb8bc516651048f2dc5afea4c66b3982e`, unchanged upstream/importer
patch and all existing resource/source/toolchain/profile gates, separately from
P5. The pre-dispatch capacity check examined every queued/in-progress/waiting run
and its jobs: two active runs and zero queued/waiting Linux jobs. No critical P5
Linux queue dependency was present.

Start epoch `1795445063` was recorded before the only actual dispatch:
**15:44:23 CET**, preparation end **16:29:23 CET**, controller end
**20:04:23 CET**, overall end **20:14:23 CET**, with ten minutes reserved for
upload/cleanup. Compiler/tests are limited to 210 minutes within the remaining
total budget. No automatic repair/retry, extra VM, paid host, configuration,
dependency, upstream/app/runtime-pin change or P5 intake is authorized.

[Run 45197419347](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45197419347),
job `137771513436`, confirms the exact harness commit and manual dispatch.
Results are pending. A local date-parsing guard failed before allocation and
before dispatch; it did not start another VM or consume a separate build.
The actual registered allocation is
[`third-source-allocation.json`](third-source-allocation.json). All previous
FAIL/CANCELLED outcomes remain unchanged.

The later hard stop supersedes local continued work and all unused start
permissions. See [`stop-2026-11-23.md`](stop-2026-11-23.md). The external job is
left to finish without local monitoring; no follow-up is automatic.

## Result inspected after the new user instruction on 2026-11-24

The completed third witness passes CLI prerequisites and target-selection
regressions, but crashes opening the original UOP in the baseline test before
the required stale-theme assertion. It produced no corrected runtime. The exact
official ZIP and stage hashes are preserved in
[`third-source-outcome.json`](third-source-outcome.json). The unapplied, separate
test resource-dependency proposal and limits are in
[`test-initialization-proposal.md`](test-initialization-proposal.md).

Integration initially allowed only read-only diagnosis/proposal and then
authorized reviewable own test-only harness preparation. A new build remains
blocked until P5 package verifier `45352330223` and the independent LinuxSuite
final audit finish, no critical P5 Linux job is queued, and integration explicitly
allocates one witness with new epochs. There is no automatic dispatch on time or
prerequisite completion. Four local source/resource controls and static checks
pass; real initialization and color acceptance remain unproven. Earlier failures
and the original stop receipt remain unchanged.

## Fourth allocation after release-capacity clearance

Integration confirmed P5 package verifier `45352330223` SUCCESS and independent
LinuxSuite final audit completion, then explicitly allocated one standard
Ubuntu24 source witness on exact QA `f652710eca7301ca55113db7344c9bd6dd734409`.
The fresh pre-dispatch inventory examined two active runs and found no queued
or waiting Linux job. Source/configuration, importer patch `e29ec641...` and
test-initialization patch `bf6b5995...` are unchanged from the reviewed inputs.

Epochs were recorded before dispatch: start `1795508007`, **09:13:27 CET on
2026-11-24**; preparation end **09:58:27**, controller end **13:33:27**, total
end **13:43:27**, with ten minutes reserved for upload/cleanup. All compiler/test
work, including UI resources, remains within 210 minutes and the remaining total
budget. No automatic retry, repair, extra VM or paid host is authorized.

[Run 45354246604](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45354246604),
attempt 1/job `138308003947`, confirms that exact QA commit. Actual VM resource/
toolchain and fixed dependency steps passed; the combined witness step is
running. No initialization, stale-theme baseline, production fix or runtime
acceptance is inferred. Full immutable input/time/queue binding is preserved in
[`fourth-source-allocation.json`](fourth-source-allocation.json). This witness
is outside P5/application builds, native acceptance, runtime pins and intake.

## Fourth result: stopped at the early resource build

The run finished at **09:16:57 CET** with FAILURE, well before its time limits.
Exact source/fixture/hash gates, four initializer controls, the test-only recipe
patch/context/output hash, configure and seven target-selection controls passed.
The UI resource make stage returned exit 2 after 21.5056 seconds:

```text
No rule to make target '.../external-tars/libxml2-2.15.4.tar.xz',
needed by '.../source/workdir/UnpackedTarget/libxml2-2.15.4.tar.xz'.
```

This is an own harness invocation error. The direct `make -f Makefile.gbuild`
call omitted the normal top-level preparation. Pinned `Makefile.in:186–187`
explicitly supplies `bootstrap fetch` prerequisites for `UIConfig_modules/%`
before invoking gbuild. Actual `DO_FETCH_TARBALLS=TRUE`; the existing pinned
archive was absent because that path had not run. `download.lst:458–460` already
pins libxml2 2.15.4 and its checksum; no new dependency or upstream change is
needed to explain this failure. Only the concat-deps C build helper is observed;
the baseline and production importer stages were not reached.

Artifact **14902320491** is retained byte-for-byte in
`retained/source-witness-45354246604.zip`: 142,002 bytes; ZIP SHA256
`97ca9de4c69fa75c9ebb8e84b681cb02c385ef58ff5fec4846a8e02b522077d2`;
expiry **2027-02-22T08:13:31Z**. All 24 stage-log hashes were verified. Exact
source/wrapper/configuration excerpts and result bindings are in
[`fourth-source-outcome.json`](fourth-source-outcome.json).

No installed resource proof, stale-theme assertion, production importer compile,
full draw suite, converter/engine or new runtime payload was reached. The earlier
SIGSEGV remains unexplained by a runtime differential. No automatic correction,
retry or extra VM was started. A future separately allocated change could use
the source-defined top-level `UIConfig_modules/simpress` wrapper; that is a
recorded strategy only, not an implemented repair or a new allocation. P5,
runtime pins, main, versions and release intake remain unchanged.

## Source preparation correction requested after the fourth result

The new explicit user request asks integration to coordinate a correction and
one further bounded witness. The own harness now selects the pinned top-level
`make -j3 UIConfig_modules/simpress` wrapper instead of calling Makefile.gbuild
directly. Exact Makefile.in and gbuild Helper hashes are added to source gates,
and actual `DO_FETCH_TARBALLS=TRUE` is required before execution. The existing
WORKDIR, test patch, UI resource hash and all production assertions remain.

Five local source/resource controls pass, including rejection of a changed
bootstrap/fetch wrapper; AST and whitespace checks pass. No make/Office execution,
archive fallback, new dependency/configuration, source/importer pin change or
new build occurred. Historical FAIL receipts stay unchanged. See
[`source-bootstrap-correction.json`](source-bootstrap-correction.json).

The correction is reviewable only until integration gives a separate allocation.
No old start epoch or unused time is reused and no automatic dispatch follows.

## Fifth allocation on the reviewed source-bootstrap correction

Integration reviewed exact QA `4fbbdd39c1b6311d4705531a10e3f72b18931408` and
explicitly allocated one new standard Ubuntu24 witness outside P5. The fresh
pre-dispatch inventory examined two active runs and found no queued/waiting
Linux job. LO/importer/test-initialization pins and all source/configuration/
resource/toolchain requirements remain unchanged.

Before dispatch, start epoch `1795508869` was recorded: **09:27:49 CET on
2026-11-24**. Preparation ends **10:12:49**, controller **13:47:49**, total
**13:57:49**, including ten minutes reserved for upload/cleanup. Compiler/tests
remain capped at 210 minutes within the remaining controller budget. There is
no automatic repair, retry, extra VM, paid host or dependency fallback.

[Run 45356331378](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/45356331378),
attempt 1/job `138314969231`, confirms the exact producer commit. Fresh VM
resource/toolchain and fixed dependency steps passed; the combined source witness
is active. No bootstrap/resource/baseline/production-runtime acceptance follows
from that status. Exact allocation/queue binding is in
[`fifth-source-allocation.json`](fifth-source-allocation.json). Only real
failure or final evidence will be delivered to integration; P5/app/runtimepin/
main/intake remain unchanged.
