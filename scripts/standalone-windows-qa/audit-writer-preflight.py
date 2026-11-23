"""Actual downloaded Writer bytes and native receipts; explicitly not final 48 QA."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

root=Path(sys.argv[1] if len(sys.argv)>1 else 'docs/tests/standalone-windows-2026-11-23/writer-preflight/attempt3')
spec=importlib.util.spec_from_file_location('standalone_oracle',Path(__file__).with_name('oracle.py'))
oracle=importlib.util.module_from_spec(spec);spec.loader.exec_module(oracle)
report=json.loads((root/'report.json').read_bytes())
assert report['status']=='passed-old-writer-host-preflight-not-final'
assert report['package']['preflightOnly'] and report['package']['application']['key']=='writer'
assert report['applicationCommit']=='cf65adf4b2ca76e4affd89f6f8812bfa4b8bec67' and report['version']=='2026.46.2'
assert report['installer']['sha256']=='0d8db828c23379bddcad8f9028e12cef0e43b00e7a312c3b3ba8652774be7adb'
assert report['executable']['sha256']=='fba52966617016d12bf458b85f59dc0a07088a1424ef34013269dd456d3cc736'
assert report['installer']['signature']==report['executable']['signature']=='Valid'
phases=report['phases'];assert len(phases)==2 and phases[0]['pid']!=phases[1]['pid']
for phase in phases:
    assert phase['status']=='passed-scoped-function' and phase['normalFullExit'] and phase['ownedWebviewsExited']
    assert phase['nativeMetadata']==dict(identifier='org.openaec.writer-studio',version='2026.46.2',name='Open Writer Studio')
    assert phase['process']['pid']==phase['pid'] and phase['process']['path'].endswith('open-writer-studio.exe')
    assert phase['pageUrl']=='http://tauri.localhost/' and not phase['pageErrors']
    oracle.inspect('writer',root/(phase['phase']+'.docx'))
for phase in phases:
    saves=[step for step in report['steps'] if step.get('action')=='SaveDialog' and step['ownedPid']==phase['pid']]
    assert len(saves)==1
    assert saves[0]['status']=='passed' and saves[0]['nativeSaveInvoked'] and saves[0]['pathReadbackMatches']
    assert saves[0]['saveMethod']=='actual-Enter-owned-native-Save-dialog'
    assert any(w['className']=='#32770' for w in saves[0]['ownedTopWindows'])
assert not report['cleanup'].get('forcedOwnedProcessTree')
for key in ('policyRestored','ownedInstallUninstalled','ownedAppExited','ownedTemporaryProfileDisposed'):assert report['cleanup'][key]
assert report['cleanup']['residualOwnedWebviews']==[]
fixtures=json.loads((root/'fixtures/manifest.json').read_bytes())
original=(root/'fixtures/Standalone23.docx').read_bytes()
assert hashlib.sha256(original).hexdigest()==fixtures['docx']['sha256']
print(json.dumps(dict(status='passed-old-writer-host-preflight-only',pids=[phase['pid'] for phase in phases],
                     savedSha256=hashlib.sha256((root/'initial.docx').read_bytes()).hexdigest(),
                     reopenedSha256=hashlib.sha256((root/'reopened.docx').read_bytes()).hexdigest(),
                     originalUnchanged=True,finalSixAppAcceptance=False)))
