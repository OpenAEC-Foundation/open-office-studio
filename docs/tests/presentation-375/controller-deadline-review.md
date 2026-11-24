# #375: hard controller deadline, pending allocation

Follow-up to centrally reviewed `1e06d0f28911ee4509b879b39468fb980acd9c9d`.
Only the identified Python/I/O budget gap is changed. No runtime allocation,
build/VM or dispatch has occurred. Source, importer, neutral C++ patch, four
diagnostic arms, assertions and 270/45/210/260/10 bounds remain unchanged.

The workflow now invokes `source_supervisor.py`. It anchors its deadline to the
same allocated/job start epoch, starts the controller in an exclusively owned
Linux session/group, and waits only until start+260 minutes. This surrounds
hashing, snapshots, core/profile manifests, copies and controller finalization,
as well as subprocesses. At expiry it terminates only that own group, escalating
to KILL after at most five seconds. The controller's stage processes inherit
this group; no independent stage session is created. Ordinary per-stage timeout
is fatal so remaining own helpers are also cleared by the supervisor. Direct
unsupervised controller execution is rejected.

The supervisor then performs only bounded group cleanup and writes a small
independent `controller-envelope.json`, including actual stop/timeout and
remaining upload/cleanup seconds. It does not continue snapshots or file copies.
The existing last `build-report.json` is protected by atomic replacement and
remains alongside raw evidence, even when the worker is killed during I/O.
The ten minutes are an upload/cleanup reserve; cleanup consumes part of that
reserve and its actual remaining duration is recorded. No claim of hard
real-time scheduler precision is made.

Four real local controls PASS (`source_supervisor_checks.py`, tool chunk
`9f560d`): an own Python worker really copies/hashes files and is stopped at a
0.75-second test deadline with more than 590 seconds of the fixed 600-second
reserve left; its progress timestamp stops changing; expired allocation starts
no worker; normal completion retains its outcome; budget increases are refused.
These are ordinary temporary Python/file controls on Windows, not Office or VM
tests. The Linux process-group branch remains to be exercised on the allocated
runner; the same controls run early inside the supervised CI preparation.

The preceding turn was interrupted by the platform cybersecurity classifier
(turn `01a20d84-a0a2-7793-a9f5-6b02921a9124`); no specific trigger was reported.
Commit `1e06d0f2` and its handoff remained saved and clean. This platform event is
separate from product/build results and does not change any historical FAIL.
