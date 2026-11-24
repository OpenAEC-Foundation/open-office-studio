# #375: connected diagnostic controller, pending allocation

Integration reviewed proposal `04ca88a08ac180bbd13519b98f704a068d5ef9dc` and
authorized this own test-only connection. Root independently repeated six source
controls. Its review receipt was reported as SHA256
`fa186c1ac561c149caea7ab4d78fdb3aaaac865054fbb342b21aabd5ff698e7e`.
No VM/build/runtime allocation is implied; none has been dispatched.

## Actual execution path

Only manual phase `startup-differential` reaches this source controller. The
former `source-build` automatic importer/full-draw/engine continuation is removed
from this execution path. Original flags, upstream/importer/fixture pins, Ubuntu
dependency policy, distribution Python, source/resource gates and 270/45/210/
260/10-minute bounds remain. Each subprocess now also refuses an exhausted
controller budget and records its actual process-group leader PID.

The controller verifies the two source patches, runs source/controller controls,
prepares the existing UI/CLI goals, and compiles the test binary once with the
pinned gbuild `gb_SUPPRESS_TESTS=TRUE` mechanism. This is a build-only stage;
no zero-test result is counted as a test pass. It then verifies original importer
and exact patched QA-file bytes, and executes precisely:

1. blank-A: `testUOP375BlankImpressStartup::TestBody`;
2. blank-B: the same leaf selector;
3. UOP-A: `testUOFExplicitRectangleFillColors::TestBody`;
4. UOP-B: the same leaf selector.

There is no source edit/relink or alternative initialization between arms. Before
and after each arm, fingerprint every installed runtime entry, linked test/helper
library/executable, external cppunit library, configuration/profile seed, both QA
files, original importer, authentic UOP and primary diagnostic sources. Symlink
targets must resolve inside the own source/build tree. Actual changed identity
stops the matrix. Modes, paths, link targets and file digests are recorded;
timestamps are not treated as binary changes.

Before each call the canonical `.test.user` directory must be absent. Gbuild
creates a fresh one. Afterward its actual device/inode and full manifest are
recorded; it is renamed within the own build filesystem and retained while the
next arm runs. A separate copy is uploaded under its unique route/arm label.
The profile is never restored/reused. Likewise each `.test.core` directory is
retained before gbuild can clear it on the next call. Core bytes up to 64 MiB per
arm are copied into evidence; larger cores remain only on the temporary host,
with size/hash and the missing-upload limitation explicitly recorded. Original
test logs are copied separately and excluded from build-log truncation.

## Actual-result classification

The canonical primary `sal/cppunittester/cppunittester.cxx` binds selector
matching, the real `[_RUN_____]` event, completion event and final outputter.
Each success/red requires exactly one correct started and completed leaf,
appropriate original phase/arm/route observations and completed base teardown.
An empty/wrong selector, skipped/suppressed test, crash, timeout, extra failure or
different assertion is FAIL. A FAIL stays FAIL even when the other arms are
useful; it is not renamed to the expected color red.

An original color red additionally requires the exact assertion source line,
original message, expected Unknown=-1 versus actual Accent1=4, original test
name, and statistics Run=1/total failures=1/assertions=1/errors=0. The enum header
is pinned. Output formatting was read from the unchanged official cppunit1.15.1
archive bound by upstream download.lst: 814363 bytes, SHA256
`89c5c6665337f56fd2db36bc3805a5619709d51fb136e51937072f63fcc717a7`.
Pristine `src/cppunit/CompilerOutputter.cpp` SHA256 is
`d818e9d8b9e1747475ad92ba61ee7572f3162046d245f3c21727ee8099e1b980`.
Its actual build-source bytes and libraries are also fingerprinted in the matrix.
This was a bounded primary-source read, without installation or build.

Any arm FAIL leaves the CI result failed after retaining the matrix. If all four
classifications are valid and B reaches the original color red, the diagnostic
protocol may finish successfully; product acceptance remains false. Every path
stops at the technical-review checkpoint. There is no importer/full-draw/engine
call and no automatic next allocation. No runnable build/cache is uploaded by
this diagnostic-only path; a later continuation still needs an explicit host/
artifact/allocation strategy. This limitation is not a completed color fix.

## Checks and outstanding work

Six source controls PASS after the selector update; twelve synthetic controller/
protocol controls PASS, including genuine-event/count requirements, wrong
value/line/test refusal, crash/teardown rejection, immutable runtime, unique
actual profile directories, and per-arm core retention. Synthetic logs/dummy
binaries test only the harness; they are not Office/Cppunit runtime evidence.
Python AST and whitespace checks pass. A local YAML parser is unavailable;
the own nine-line workflow delta is manually reviewed, not machine-validated
locally. No dependency was installed for this check.

Original neutral patch `1e713485...`, importer `e29ec641...`, all historical FAILs
and UI-resource bytes remain intact. Runtime/C++/color and platform acceptance
remain OPEN. No product/P5/PR384/main/runtime pin/release/version changes.
