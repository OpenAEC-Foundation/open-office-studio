# Writer offline save after dependency preparation

The production application failed to save an edited DOCX after going offline, even after the old blank-template preparation. The real Ctrl+S/Save As route first requested the lazy `saveResidentDocument` chunk from its document worker. Preloading only the main-thread parser did not prepare that worker. Loading its JavaScript alone was also insufficient: the worker still needed the OPC and document-parser WASM instances.

The existing version-pinned compatibility layer now installs a separate preparation request in the document worker. The editing application's preparation asks each live worker through a private MessageChannel to load its save module and parse the small bundled blank document. The active document is never flushed or serialized for this preparation. Later workers are prepared after the editing application has opted in; standalone read-only viewers keep lazy loading. Each worker shares one acknowledged preparation, failed preparation can be retried, and terminating a worker cancels the pending request. Canonical module paths keep the worker factory and preparation registry shared in Windows builds.

The SDK-worker source SHA and the maximum size of the embedded blank template are checked during the build. Original save errors remain visible; this change does not treat an unsuccessful preparation as a successful save.

## Validation

- Before the correction, the real production Ctrl+S/Save As probe failed on the missing worker save chunk and then on missing worker OPC/parser WASM. Source logs remain under `.local/integratie-2026-11-10-offline-*`.
- Ten targeted tests cover existing worker startup plus preparation sharing, read-only laziness, later workers, refusal/retry and termination cleanup.
- Production build and TypeScript pass. `node scripts/proef-writer-offline.mjs dist` observes completion of the preparation, disables networking, edits and saves through the real interface, checks the downloaded DOCX text and reopens it. No production diagnostic bridge is used.
- The Linux desktop CI now repeats that production regression after building. Native platform packaging and the standalone read-only example remain separately checked by their existing workflows.

This check establishes the tested edited-save route after preparation. It is not a promise that arbitrary new documents, conversions or externally linked resources can first be opened without a network connection.
