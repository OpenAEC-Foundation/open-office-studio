"""Bind one existing integration installer to an isolated native core test."""
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[1]
OUT = ROOT / '.local/integration382-windows-native'
REPO = 'repos/OpenAEC-Foundation/open-office-studio/'
PIN = '727903cc7add7591444881cbe87620c9f8b78260'
TREE = '779f342af0146a9a5e7c941ce3665878c20af802'
MAIN = '1b6f9c647178bbe0df1b9e42b5c33cf9fa4c18af'


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)


def api(path):
    return json.loads(subprocess.check_output(['gh', 'api', REPO + path]))


def preflight():
    identity = json.loads((BASE / 'candidate.json').read_bytes())
    assert identity['applicationCommit'] == PIN
    assert identity['applicationTree'] == TREE
    assert identity['requireSigned'] is False  # This is the existing unsigned CI build.
    assert identity['executeNative'] is True
    assert not identity['testTitleOverlap'] and not identity['titleOnly']
    assert identity['focusedCase'] is None
    changed = git('diff', '--name-only', PIN, 'HEAD').decode().splitlines()
    assert changed and all(p.startswith('qa/integration382-windows-native/') or
                           p == '.github/workflows/integration382-windows-native.yml'
                           for p in changed), changed
    assert git('rev-parse', PIN + '^{tree}').decode().strip() == TREE
    assert api('git/ref/heads/main')['object']['sha'] == MAIN
    assert api('git/ref/heads/codex/integratie-2026-11-16')['object']['sha'] == PIN
    assert api('git/commits/' + PIN)['tree']['sha'] == TREE
    run = api('actions/runs/' + str(identity['runId']))
    assert run['head_sha'] == PIN and run['conclusion'] == 'success'
    assert run['path'] == '.github/workflows/desktop.yml'
    job = api('actions/jobs/' + str(identity['producerJobId']))
    assert job['run_id'] == identity['runId'] and job['run_attempt'] == 2
    assert job['head_sha'] == PIN and job['name'] == 'desktop (windows-latest)'
    assert job['conclusion'] == 'success'
    for name in ['Run pnpm test', 'Windows-pakket bouwen',
                 'Windows-installer werkelijk uitpakken en controleren']:
        assert any(s['name'] == name and s['conclusion'] == 'success' for s in job['steps']), name
    artifact = api('actions/artifacts/' + str(identity['artifactId']))
    assert not artifact['expired'] and artifact['name'] == 'open-office-studio-Windows'
    assert artifact['workflow_run']['id'] == identity['runId']
    assert artifact['workflow_run']['head_sha'] == PIN
    assert artifact['digest'] == 'sha256:' + identity['archiveSha256']
    assert artifact['size_in_bytes'] == identity['archiveBytes']
    assert job['started_at'] <= artifact['created_at'] <= job['completed_at']
    origin = json.loads((BASE / 'driver-origin.json').read_bytes())
    for name, sha in origin['files'].items():
        assert hashlib.sha256((BASE / name).read_bytes()).hexdigest() == sha, name
    fixture = ROOT / 'public/templates/nieuw.docx'
    assert fixture.read_bytes() == git('show', PIN + ':public/templates/nieuw.docx')
    proof = {'application': PIN, 'tree': TREE, 'harness': git('rev-parse', 'HEAD').decode().strip(),
             'producerRun': run, 'producerJob': job, 'artifact': artifact,
             'sourceChanges': changed, 'driverOrigin': origin,
             'templateSHA256': hashlib.sha256(fixture.read_bytes()).hexdigest(),
             'signatureScope': 'Unsigned integration CI installer; not release signing acceptance.'}
    # The driver requires its output directory not to exist yet.
    (ROOT / '.local').mkdir(exist_ok=True)
    (ROOT / '.local/integration382-preflight.json').write_text(json.dumps(proof, indent=2) + '\n')
    print('Exact candidate, successful producer attempt, artifact and unchanged driver checks PASS')


def audit():
    report = json.loads((OUT / 'report.json').read_bytes())
    assert report['status'] == 'passed' and report['errors'] == []
    assert report['identity']['applicationCommit'] == PIN
    assert report['identity']['applicationTree'] == TREE
    assert report['archiveSha256'] == '4e1e26f682a0581dd76511410c3e0aeb06816a29ab640665efe2f527be2b320d'
    assert report['packageSha256'] == '838920e7da539b3dc878a28775844f96440d276afb6e490c44a13b6145471c0b'
    assert report['executableSha256'] == report['payloadExecutableSha256']
    processes = report['processes']
    assert len(processes) == 2 and processes[0]['pid'] != processes[1]['pid']
    for process in processes:
        assert process['exit']['code'] == 0 and not process.get('forcedCleanup')
        assert process['appIdentifier'] == 'org.openaec.office-studio'
    expected = ['NATIVE_WINDOWS_372 alpha', 'beta', '', '', '', 'omega', 'delta', '', '']
    data = (OUT / 'Writer native roundtrip.docx').read_bytes()
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        doc = ET.fromstring(z.read('word/document.xml'))
    ns = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
    cells = [''.join(t.text or '' for t in c.iter(ns + 't')) for c in doc.iter(ns + 'tc')]
    assert cells == expected and len(list(doc.iter(ns + 'tbl'))) == 1
    assert len(list(doc.iter(ns + 'tr'))) == 3
    assert hashlib.sha256(data).hexdigest() == report['saved']['sha256']
    assert report['saved']['cells'] == cells and len(report['checks']) == 12
    for name in ['native keyboard edit', 'native ordinary Undo', 'native ordinary Redo',
                 'normal close exits first process', 'full process reopen renders saved cells',
                 'normal close exits reopened process']:
        assert any(c['name'] == name for c in report['checks']), name
    assert report['cleanup']['ownedAppsClosed'] and report['cleanup']['policyRestored']
    assert report['cleanup']['privateInstallRemoved']
    install = (OUT / 'installed').resolve()
    assert install.parent == OUT.resolve() and install.name == 'installed'
    residual_before = [p for p in install.rglob('*') if p.is_file()]
    # NSIS _?= runs in place and can retain its own uninstaller. Remove only
    # that exact owned file after both application processes and uninstall exit.
    for path in residual_before:
        assert path.resolve() == install / 'uninstall.exe', str(path)
        path.unlink()
    remaining = [str(p.relative_to(OUT)) for p in install.rglob('*') if p.is_file()]
    assert not remaining, remaining
    proof = {'status': 'PASS', 'application': PIN, 'tree': TREE,
             'documentSHA256': hashlib.sha256(data).hexdigest(), 'cells': cells,
             'normalExitPIDs': [p['pid'] for p in processes], 'newPID': True,
             'coreChecks': len(report['checks']),
             'postUninstallFilesRemoved': [str(p.relative_to(OUT)) for p in residual_before],
             'remainingPrivateInstallFiles': remaining,
             'nativeDriver': 'Actual installed WebView2 keyboard/pointer; no DOM/engine setters',
             'limits': ['Synthetic Writer case; no all-module/all-format/rendering certification.',
                        'Unsigned existing CI candidate, not signed published release.',
                        'No local user app or capture session opened.']}
    (OUT / 'independent-xml-audit.json').write_text(json.dumps(proof, indent=2) + '\n')
    print(json.dumps(proof))


if __name__ == '__main__':
    {'preflight': preflight, 'audit': audit}[sys.argv[1]]()
