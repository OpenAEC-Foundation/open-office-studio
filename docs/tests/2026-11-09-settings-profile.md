# Settings author profile — issue #23

Based on main `f4a03889`, verified on Windows on 9 November 2026.

The author name previously lived separately in `open-tekst-auteur`, outside
the settings file and cross-window synchronization. Name and initials now
belong to the saved `gebruiker` preferences. Older names migrate without
resurrecting a deliberately cleared profile. Previewing settings never changes
the author used for an edit; saving updates already open editors. The comment
dialog keeps the configured initials when it changes the remembered name.

New comments inserted through the host ribbon dialog receive the chosen
initials in the saved DOCX. The fixed editor API cannot accept initials, so the
host records the newly inserted comment identity after the React projection
updates, and stamps only its opening XML tag during serialization. The record
uses the stable document handle, comment ID, author and timestamp, normalized
to the whole-second precision written by the engine. Other authors, comment
contents, relationships and unrelated ZIP parts are preserved.

Validation:

- `pnpm exec tsc --noEmit`: passed.
- `pnpm exec vitest run --configLoader runner --maxWorkers 4 --testTimeout 15000`:
  177 files passed, 1,994 tests passed, ten existing skips. An initial run with
  unrestricted parallelism hit the existing five-second icon-test timeout;
  the isolated icon test and the bounded full run passed.
- `pnpm exec vite build --configLoader runner`: passed. The runner loader
  avoids an esbuild configuration-directory access restriction in this sandbox.
- `node scripts/controleer-i18n.mjs --ns settings`: all nine offered languages
  passed; the new label is also present in all 23 prepared language folders.
- `node scripts/test-auteursprofiel.mjs`: six production Chromium checks passed,
  with no page errors: legacy migration and spaces in names; reload and cancel;
  cross-tab synchronization; a real comment and downloaded DOCX containing
  custom initials `XYZ`; reopening and resaving after changing defaults;
  reset, save and reload without restoring the old name.

The browser script requires Playwright and Chromium. It can load an existing
Playwright installation through the `OFFICE_PLAYWRIGHT_MODULE` file URL.
Build the app first; results go to `.local/proef-auteursprofiel` (or
`OFFICE_TEST_UIT`). All document content in this test is synthetic.

Limits: this is a partial implementation of #23, so the issue should remain
open. Default directories, measurement units and default spelling language are
outside this change. Custom initials are stamped for new comments created in
the host ribbon dialog; the engine's live avatar and its sidebar reply UI
continue to use their existing behavior. Native Windows restart/build behavior
was not independently tested here. Asset preparation could not compile the
unchanged spelling WASM without the Rust wasm32 toolchain; the browser checks
explicitly disable spell checking. The TypeScript and Vite production build
were checked separately.
