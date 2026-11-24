"""Retain completed issue366 evidence; no app/browser/process control."""
from pathlib import Path
import gzip
import hashlib
import json
import shutil
import xml.etree.ElementTree as ET
import zipfile

base = Path.cwd()
rawdir = base / '.local/issue366-idle/two-minute'
out = base / 'docs/tests/issue366-idle-20261124'
ret = out / 'retained'
ret.mkdir(exist_ok=True)
sha = lambda data: hashlib.sha256(data).hexdigest()
raw = (rawdir / 'report.json').read_bytes()
r = json.loads(raw)
assert r['status'] == 'diagnostic-complete' and r['cleanup'] and not r['errors']
assert r['harnessSha256'] == sha((base / 'qa/issue366-idle/probe.mjs').read_bytes())
ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}


def paragraphs(path):
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        root = ET.fromstring(archive.read('word/document.xml'))
    return [''.join(t.text or '' for t in p.findall('.//w:t', ns))
            for p in root.findall('.//w:body/w:p', ns)]


source = paragraphs(rawdir / 'source.docx')
expected = source
assert len(source) == 20
for _ in range(3):
    expected = expected[:-1] + [expected[-1] + expected[0]] + expected[1:]
saved = paragraphs(rawdir / 'saved.docx')
assert saved == expected and len(saved) == 153
assert sum(len(p) for p in saved) == 56640
assert len(' '.join(saved).split()) == 8640
assert paragraphs(rawdir / 'preflight-saved.docx') == source
assert sha((rawdir / 'saved.docx').read_bytes()) == r['saved']['sha256']
rows = []
for phase in dict.fromkeys(s['phase'] for s in r['samples']):
    samples = [s for s in r['samples'] if s['phase'] == phase]
    last = samples[-1]
    assert last['status']['paginas'] == last['layout']['pages'] == last['total']
    matches = [s for s in samples if s.get('total') == last['total']
               and (s.get('layout') or {}).get('pages') == last['total']
               and (s.get('status') or {}).get('paginas') == last['total']]
    mismatch = [s for s in samples if (s.get('status') or {}).get('paginas')
                != (s.get('layout') or {}).get('pages')]
    if phase.startswith('double-'):
        assert last['phaseElapsedMs'] >= 120000
    rows.append({
        'phase': phase, 'samples': len(samples),
        'observedAfterMs': last['phaseElapsedMs'],
        'finalCurrent': last['current'], 'finalTotal': last['total'],
        'finalLayoutPages': last['layout']['pages'],
        'finalStatusTotal': last['status']['paginas'],
        'finalParagraphs': len(last['paragraphs']),
        'firstMatchingFinalTotalElapsedMs': matches[0]['phaseElapsedMs'],
        'transientMismatchSamples': [
            {'elapsedMs': s['phaseElapsedMs'], 'refTotal': s.get('total'),
             'layoutPages': (s.get('layout') or {}).get('pages'),
             'statusTotal': (s.get('status') or {}).get('paginas')}
            for s in mismatch],
        'mismatchAfter5000ms': any(s['phaseElapsedMs'] >= 5000 for s in mismatch),
        'finalStatusText': last['statusText'],
    })
assert not any(row['mismatchAfter5000ms'] for row in rows)
assert r['samples'][-1]['paragraphs'] == expected
(ret / 'report.json.gz').write_bytes(gzip.compress(raw, mtime=0))
for path in rawdir.iterdir():
    if path.is_file() and path.suffix in ('.png', '.docx'):
        shutil.copyfile(path, ret / path.name)
for name in ('environment.json', 'owned-processes-before-cleanup.json',
             'owned-listeners-before-cleanup.json', 'cleanup.json'):
    path = base / '.local/issue366-idle' / name
    if path.exists():
        shutil.copyfile(path, ret / name)
cleanup = json.loads((ret / 'cleanup.json').read_text(encoding='utf-8-sig'))
assert cleanup['remainingCapturedProcesses'] == []
proof = {
    'issue': 366, 'result': 'NOT REPRODUCED; issue remains open; no product patch',
    'scope': 'One synthetic / browser case; >=120s passive observation after each real paste',
    'source': {'commit': r['source'], 'tree': r['sourceTree'], 'version': '2026.48.1',
               'oldProofCommit': '37ec6d04bbf9c21442a5c555605f5c132c3954cb',
               'applicationChanges': False},
    'execution': {
        'startedAtUTC': r['startedAtUTC'], 'finishedAtUTC': r['finishedAtUTC'],
        'helper': 'qa/issue366-idle/probe.mjs', 'helperSha256': r['harnessSha256'],
        'nodeSyntaxCheck': 'PASS', 'processExitCode': 0, 'pageErrors': r['errors'],
        'preflight': r['preflight'],
        'policy': '250ms samples first5s, then2000ms. Passive getters/text only; no API focus/content/layout setters or whenLayoutComplete; no idle interaction',
    },
    'phaseResults': rows,
    'independentXmlOracle': {
        'parser': 'Python zipfile/ElementTree, independent source-derived three concatenation rounds',
        'sourceParagraphs': 20, 'savedParagraphs': 153, 'words': 8640,
        'characters': 56640, 'savedSha256': r['saved']['sha256'],
        'preflightSavedExact': True, 'savedExact': True,
        'freshContextReopenExact': True, 'zipCRCChecks': True,
    },
    'sourceAnalysis': 'source-analysis.json',
    'originalPngVisualReview': {
        'files': ['preflight-fresh-reopen.png', 'double-3.png', 'fresh-context-reopen.png'],
        'observation': 'Original double-3 visibly Page21of21/8640words/56640characters; fresh context Page1of21. No screenshot-only inference of all21page contents',
    },
    'platforms': {'WindowsHostedChromiumViteSlash': 'PASS bounded case',
                  'WindowsNative': 'NOT TESTED', 'LinuxNative': 'NOT TESTED',
                  'macOSNative': 'NOT TESTED', 'hostedOfficePath': 'NOT TESTED',
                  'releasePackage': 'NOT TESTED'},
    'limitations': [
        'Original user fixture/formatting/exact rounds and independently verified15pages unavailable',
        'Live layout array is internal oracle, not external pagination; XML/fresh context prove content persistence',
        'Initial ref/status mismatches retained; none after5s. Stale10of10 for2minutes not reproduced',
        'Spelling dictionaries unavailable and explicitly reported; bundled font hashes retained',
        'No general paste-performance/format/native/release acceptance inferred',
    ],
    'cleanup': {'browserAndViteClosedInFinally': r['cleanup'],
                'allSixCapturedOwnProcessIdsAbsent': True,
                'checkedAtUTC': cleanup['checkedAtUTC'],
                'computerUseOrScreenRecordingStarted': False,
                'sharedProcessesTerminated': False},
    'nextStep': 'Only after explicit next-week user instruction: obtain shareable original document/local path and exact formatting/paste sequence; no issue close or speculative polling fix',
    'retained': {p.name: {'bytes': p.stat().st_size, 'sha256': sha(p.read_bytes())}
                 for p in ret.iterdir() if p.is_file()},
    'rawReport': {'bytes': len(raw), 'sha256': sha(raw), 'compression': 'lossless gzip mtime0'},
    'sourceAnalysisSha256': sha((out / 'source-analysis.json').read_bytes()),
}
(out / 'proof.json').write_text(json.dumps(proof, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
print(json.dumps({'proofSha256': sha((out / 'proof.json').read_bytes()),
                  'savedSha256': r['saved']['sha256'], 'phaseResults': rows}, indent=2))
