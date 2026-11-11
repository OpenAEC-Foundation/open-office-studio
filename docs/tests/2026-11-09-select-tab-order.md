# Settings dropdown tab order (#24)

Verified in Chromium on Windows on 9 November 2026, against main `f4a03889`
and the candidate production build.

An open ThemedSelect adds a temporary focusable listbox or search field to the
dialog's tab order. Previously, Shift+Tab closed the menu but returned to the
same dropdown's trigger. Users needed another Shift+Tab to reach the preceding
control. This affected the save-format selectors, language search (including
filtered or empty results), theme and Writer shortcut profile.

On Tab the dropdown now commits its close before the parent dialog computes
the next focus target, and restores focus to the trigger first. The existing
dialog tab handler then moves forward or backward from that logical control.
The close must be synchronous: otherwise the temporary menu node would still
be considered a tab stop. No dialog-stack or focus-trap code changes are needed.
Tab continues to cancel the highlighted option; Enter still accepts it.

Validation:

- The same eighteen production browser cases pass 10/18 on the old build and
  18/18 on the candidate, with no page errors. Eight Shift+Tab cases reproduce
  the extra stop. Controls cover forward Tab, filtered/empty language search,
  cancelling an uncommitted selection, Escape, Enter and closed dropdowns.
- `pnpm exec tsc --noEmit` and `pnpm exec vite build --configLoader runner` passed.
- Full Vitest suite (`--configLoader runner --maxWorkers 2 --testTimeout 15000`):
  175 files passed, 1,987 tests passed, ten existing skips.

Run `node scripts/test-keuzelijst-tab.mjs` after building the app. Playwright
and Chromium are required; `OFFICE_PLAYWRIGHT_MODULE` can name an existing
installation by module URL. `OFFICE_TEST_DIST` chooses baseline/candidate;
`OFFICE_TEST_UIT` chooses the report/screenshot directory. Defaults are `dist`
and `.local/proef-keuzelijst-tab`. The test edits only disposable browser state.

This is a partial fix for #24. It does not change the shared Escape-stack work
in PR #193, theme handling in the Spreadsheet sorting dialog, or any document
editing code. NVDA, VoiceOver and an installed native Windows build were not
tested; this report records production-browser keyboard focus only.
