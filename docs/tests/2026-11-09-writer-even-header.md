# Writer even-page header editing (#209)

Tested on Windows on 2026-11-09 against main `f4a03889` and the fixed
production Vite bundle in Chromium.

## Reproduction

A three-page document has separate first, even, and default headers and
footers. On the original bundle, Edit Header on page 2 displays the editor
over the even header, but an ordinary keypress changes `hf:rId9` (the default
header) instead of `hf:rId11` (the even header). No clipboard is needed.

With the page-2 header above the visible scroll area, the production browser
regression also fails on the original bundle: Edit Header never opens the
inline editor. The same regression passes on the fixed bundle.

## Change

Carry the actual layout hit's relationship ID through the edit target,
content lookup, selection region, and inline removal action. Compare that ID
when switching between different header/footer parts. Read first-page
classification from section references, since the parser labels all standalone
header/footer parts as `default`.

The ribbon preserves the chosen page across a package reload. Before its
synthetic margin double-click, it scrolls that margin into view and verifies
that the hit element belongs to the chosen page. This prevents clicks from
landing on a ribbon control when a page's margin is offscreen.

## Validation

- Full suite: `pnpm exec vitest run --maxWorkers=2` — 176 files passed;
  1,991 tests passed and 10 existing optional tests skipped.
- Four new tests cover both header/footer variant lookup, first-page
  references beyond page 1, missing parts without fallback, and compatibility
  checks for both pinned engine modules.
- `pnpm exec tsc --noEmit` and production Vite build passed.
- `scripts/test-tekst-kopvoetdoel-gui.mjs` covers the clipped even margin,
  actual keypress input, unchanged body/other parts, Undo/Redo, saved DOCX
  parts and reopening, first/default headers, even footers, switching from
  first to even while editing, inline even-header removal, and creating a
  missing even header followed by reload and immediate input.

The script uses `OFFICE_TEST_DIST` and optionally `OOS_PLAYWRIGHT_MODULE` for
an existing Playwright installation. It writes its JSON report and saved DOCX
under `.local/proef-kopvoetdoel`. Spelling/autocorrection are disabled for these
focused browser checks. The installed desktop application, PDF export, and
other operating systems were not retested.
