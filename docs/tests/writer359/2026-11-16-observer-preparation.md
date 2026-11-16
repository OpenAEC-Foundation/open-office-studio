# #359: opt-in font/frame observer preparation

Prepared after explicit user approval, coordinated with the existing integration
chat. Hard stop: 16 November 2026, 15:20 Europe/Amsterdam. This is future test
instrumentation, **not a product correction or a native Mac result**. Application
integration remains separately owned; #359 and #30 stay open. No CI run, app
build, app launch, converter, server or screen-recording session was started.

## Files and activation boundary

- `scripts/writer359-observer.mjs`: build-time source overlay and optional plugin
  factory. Explicit `enabled: true` is required. Disabled transforms return the
  original source; disabled plugins do nothing. No production Vite configuration
  imports or enables it.
- `scripts/writer359-observer-runtime.mjs`: browser/worker-safe in-memory recorder
  and bounded MessageChannel collection; no Node imports, network or polling.
- `scripts/writer359-observer.test.mjs`: local Node contract/behaviour tests using
  the actual pinned SDK 0.5.1 source, read-only.

Four original SDK files have exact SHA-256 guards in `SDK_PARTS`. Unknown files,
changed source bytes and changed boundary markers are rejected; the overlay
never writes dependencies. Register the diagnostic plugin **before** existing
SDK adapters, both for the main build and `worker.plugins`, only in a future
isolated diagnostic config. Hashes describe the original SDK bytes, not an
already modified intermediate transform. Current integration navigation and
other product adapters must remain present after the diagnostic overlay.

Example for that future test-only configuration:

```js
import { writer359DiagnosticPlugin } from "./scripts/writer359-observer.mjs";
// Add first in each isolated main/worker plugin list:
writer359DiagnosticPlugin({ enabled: true });
```

## Recorded boundaries and limits

The recorder covers font-byte request/completion, FontFace registration/load,
font failure and the SDK's own synthetic loadingdone dispatch; worker surface
attach start/result; published frame; first-page callback invocation; glyph-run
entry, outline draw return and fillText fallback entry. A true attach result,
published frame or first-page callback does **not** prove readable native pixels.
The glyph marker records return from the draw path, not a visible-pixel readback.

Only allowlisted event names and finite numeric/boolean metadata are retained.
There is no document text, font family, filename, error message, document object,
DOM/canvas content, bitmap or raw worker-protocol payload in the trace. Each
realm retains at most 512 records and a dropped counter; snapshots are copies.
If records were dropped, absence of a later marker proves nothing. Record order
is per realm, with performance time origin + relative time for same-host
comparison; the harness must label separate worker handles itself.

No extra await, timer, animation frame, font load, render request or document
mutation is added to an engine path. Recording itself still adds synchronous
work and allocations and can change the race. Instrumented observations must
therefore remain separate from original uninstrumented controls.

The runtime adds only its own namespaced worker-message listener. It ignores
ordinary SDK messages. `requestWorkerTrace(worker)` makes one request with a
default 1-second timeout (maximum allowed 5 seconds), closes its ports on
success/error/timeout, and by default requires acknowledgement that the worker
recorder/listener stopped. The returned snapshot describes the buffer before
that stop. `stopObserver()` stops the main-realm recorder. App/worker termination
remains part of native harness cleanup. No persistent capture stream exists.

## Next native experiment: explicit remaining work

1. Agree and pin one application source/tree, SDK, document hash and package
   variants with the integration chat. These helpers pin SDK 0.5.1; they do not
   silently adopt the older G app or certify the later accepted 7632 app.
2. Preserve untouched initial and fresh-process native captures from an
   uninstrumented package at that point. Record actual host, PID/window,
   preference, fonts/readiness and input hashes.
3. Build a **separate diagnostic package** from that same product source with
   the explicit overlay. Preserve its initial captures before collecting any
   observer buffer. Keep its package/diagnostic commit identity distinct.
4. Connect a test-only native readout transport and retain the relevant worker
   handles in the isolated harness. That native transport is **not implemented
   or validated here**. Browser harness code can import the browser-safe runtime
   helpers; it must not import the Node build-time transformer into the app.
5. Collect main and worker buffers once, stop the observers, and compare font,
   attach, draw-return, publication and callback ordering with the raw images.
   Missing worker events or a full buffer cannot be interpreted as no painting.
6. Keep any later edit/save comparison separate; independently verify source
   preservation and close only owned apps/workers/ports/mounts. No renderer flag,
   theme change or document mutation should be presented as a correction.

This preparation does not identify app versus compositor causality or provide
the still missing physical/live Mac observation. A reproducible responsible
boundary and fixed-point platform regression evidence are required before a
product change can be accepted.

## Local verification

Seven targeted Node tests passed: inert default/hash rejection; actual four SDK
transforms with Node syntax parsing and unchanged dependency bytes; exact plugin
file matching; bounded metadata/no text retention/snapshot isolation/stop;
actual frame-publication payload and listener order; namespaced worker readout
and listener disposal; successful, malformed, failed and timed-out requests.
Node exits normally after the channel tests. No shared dependency cache is
written and no install or build is needed.

```powershell
# Normal checkout with its pinned dependencies:
node --test scripts/writer359-observer.test.mjs
# This worktree used a read-only existing SDK installation via:
$env:OOS359_SDK_ROOT = 'C:/Users/alper/Desktop/Documents/ChatGPT/code slaafjes/work/oos-formats-356-epub/node_modules/@betteroffice'
```

These are local source/behaviour checks, not Windows/Linux/macOS/browser UI
passes. No product files changed, so prior valid product results remain separate
and are not relabeled as instrumentation tests. Production integration,
native readout, diagnostic builds and platform validation remain future work.
