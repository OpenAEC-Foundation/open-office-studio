# P5 isolated native Suite input contract

SchemaVersion 1 is shared by DEB and AppImage. Templates have `executionApproved: false`, null byte/artifact/ELF fields and must never authorize a download or native start. Final descriptors will use the same paths without `.template`.

`parent.installerArchive` is the official P5 canonical `uitgave-Linux` archive, with exact source/tree/version/run/job/attempt/gates and digest/size/time binding before one full download. `parent.packageMember` and `packageReportMember` are the actual original canonical ZIP members. `package.member` is the unchanged original package normalized only to the named transfer member; bytes never change.

Release reports are members inside the canonical ZIP; they do not have a separate canonical build report artifact. `parent.reportArchive` remains null or identifies a **QA-produced small metadata/report-copy artifact**, explicitly marked `provenanceScope: selected canonical report copies` with its own producer run/commit. It must never be mistaken for a second canonical-source archive or cause another parent download. The Suite transfer itself includes the byte-identical original package report; its hash equals `parent.packageReportSha256`.

`artifact` identifies the separate Suite transfer ZIP with official Actions ID/name/producer/digest/size. `qaPin.producerCommit` binds its producing QA code. Six standalone app hosts receive only their own app artifacts and no Suite files.

`package.payloadElf` is producer-observed **payload metadata only**. The consumer must independently inspect the actual DEB installed ELF or AppImage SquashFS/extracted/running ELF, check its bytes/hash/mode/architecture, and bind its real PID/APPIMAGE/APPDIR/profile before native use. AppImage RPATH rewriting can make its ELF hash differ from DEB; no common-ELF assumption is allowed.

DEB `control` comes from actual `dpkg-deb -f`. For AppImage it is package/source/desktop metadata explicitly identified as such, not a Debian control section. SignatureBinding records actual available detached signature members/status and applicable verification. Missing/unsigned state is never silently labelled verified. No publication is authorized.
