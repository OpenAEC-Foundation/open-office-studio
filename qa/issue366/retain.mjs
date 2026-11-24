// Retain original diagnostic bytes; does not launch or exercise the app.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const base = 'b696ab86bd1c128729a079b68c0082e6df3d36a5';
const output = resolve('docs/tests/issue366-20261124');
const source = resolve('.local/issue366');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const harness = await fs.readFile('qa/issue366/probe.mjs');
const run = JSON.parse(await fs.readFile(join(source, 'repeated-fonts-complete/report.json')));
assert.equal(run.harnessSha256, sha(harness));
assert.equal(run.status, 'diagnostic-complete');
assert.equal(run.cleanup, true);
assert.deepEqual(run.errors, []);
const productDelta = git('diff', '--name-only', base, '--', '.', ':!qa/issue366', ':!docs/tests/issue366-20261124');
assert.equal(productDelta, '', 'all application inputs equal P5');
await fs.mkdir(join(output, 'retained'), { recursive: true });
const retained = [];
async function keep(from, name, compressed = false) {
  const original = await fs.readFile(from);
  const bytes = compressed ? gzipSync(original) : original;
  await fs.writeFile(join(output, 'retained', name), bytes);
  retained.push({ name, bytes: bytes.length, sha256: sha(bytes),
    ...(compressed ? { uncompressedSha256: sha(original), uncompressedBytes: original.length } : {}) });
}
for (const phase of ['initial', 'double-1', 'double-2', 'double-3', 'undo', 'redo', 'fresh-context-reopen'])
  await keep(join(source, 'repeated-fonts-complete', phase + '.png'), phase + '.png');
for (const name of ['source.docx', 'saved.docx'])
  await keep(join(source, 'repeated-fonts-complete', name), name);
for (const attempt of ['baseline-1', 'baseline-2', 'repeated-1', 'repeated-fonts-complete'])
  await keep(join(source, attempt, 'report.json'), attempt + '.json.gz', true);
const phases = [...new Set(run.samples.map(sample => sample.phase))].map(phase => {
  const samples = run.samples.filter(s => s.phase === phase);
  const last = samples.at(-1);
  const before = run.actions.find(a => a.name === phase)?.before;
  const first = samples.find(s => s.layout?.pages === last.layout.pages && s.status?.paginas === last.layout.pages);
  return { phase, actualLayoutPages: last.layout.pages, displayedTotal: last.status.paginas,
    displayedCurrent: last.status.pagina, editorCurrent: last.current, paragraphs: last.paragraphs.length,
    firstMatchingObservationMs: first.ms, pasteCommandBoundaryMs: before?.ms,
    pasteToFirstMatchingObservationMs: before ? first.ms - before.ms : null,
    lastStatusText: last.statusText };
});
const proof = {
  issue: 366, date: '2026-11-24', status: 'NOT_REPRODUCED_IN_BOUNDED_SYNTHETIC_CASE',
  issueResolution: 'OPEN: original fixture/formatting and independently verified expected layout remain unavailable',
  applicationCommit: base, applicationTree: git('rev-parse', base + '^{tree}'),
  harnessCommit: git('rev-parse', 'HEAD'), harnessSha256: sha(harness),
  executionReportedHead: run.source,
  sourceBinding: 'Execution head predates the QA-only font-middleware commit; executed helper hash matches the retained QA commit; all product files equal immutable P5.',
  environment: { node: process.version, platform: process.platform, architecture: process.arch,
    playwright: JSON.parse(await fs.readFile('node_modules/playwright/package.json')).version,
    browser: 'installed Playwright Chromium, headless, isolated contexts; not native Windows',
    route: '/', server: 'Vite development server with read-only API/status observation bridge',
    fonts: '70 original installed bundled font assets, source hashes in raw report; no extra fonts downloaded',
    spelling: 'dictionary assets unavailable; status explicitly reports spelling not available' },
  phases, saved: run.saved,
  checks: { clipboard: 'actual Ctrl+A/C/End/V, exact clipboard source oracle for every doubling',
    content: 'exact paragraph arrays after every operation, independent downloaded DOCX XML and fresh browser-context reopen',
    pageOracle: 'live editor layout.pages.length compared with published status and original visible status-bar screenshots; no inferred 15-page oracle',
    navigation: 'actual keyboard Home/End and current-page display equality; no claim to repair or fully cover caret/navigation',
    undoRedo: 'actual Ctrl+Z/Ctrl+Y, exact prior/restored paragraph arrays and layout totals',
    cleanup: run.cleanup, productChanges: false },
  limitations: ['No reproduction of the original I3 report or cause determination.',
    'No production build, hosted /office/ route, Linux/macOS browser or native operating-system acceptance.',
    'Five-second observation windows per operation; measured prompt updates, no two-minute idle test.',
    'Observed response times include keyboard and 250ms sampling overhead, not exact layout-completion latency.',
    'Initial allowlist failure and incomplete-CJK-font runs are preserved separately; final evidence uses both bundled-font packages.'],
  retained,
};
await fs.writeFile(join(output, 'proof.json'), JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify({ status: proof.status, files: retained.length, phases, saved: proof.saved }, null, 2));
