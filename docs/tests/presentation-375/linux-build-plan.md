# #375: bounded Linux source-build/test proposal

**Status: proposal awaiting integration allocation; no source checkout or build
has started.** This is a private QA witness for the reviewed importer patch,
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
