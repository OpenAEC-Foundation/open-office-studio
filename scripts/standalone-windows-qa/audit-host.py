"""Independently recheck archived actual native preflight receipts and saved bytes."""
import hashlib
import json
from pathlib import Path
import sys

root=Path(sys.argv[1] if len(sys.argv)>1 else 'docs/tests/standalone-windows-2026-11-23/host-preflight/attempt5')
report=json.loads((root/'report.json').read_bytes())
assert report['status']=='passed-host-only' and report['interactive']
assert len(report['steps'])==2 and report['steps'][0]['pid']!=report['steps'][1]['pid']
assert [s['phase'] for s in report['steps']]==[0,1]
assert all(s['focusAndText'] for s in report['steps']) and report['steps'][1]['reopen']
assert all(c.get('exited') and not c.get('forced') for c in report['cleanup'])
assert {c['pid'] for c in report['cleanup']}=={s['pid'] for s in report['steps']}
for index,step in enumerate(report['steps']):
    focus=json.loads((root/f'focus-{index}.json').read_bytes())
    close=json.loads((root/f'close-{index}.json').read_bytes())
    assert focus['status']=='passed' and focus['ownedPid']==focus['foregroundPid']==step['pid']
    assert close['status']=='passed' and close['ownedPid']==step['pid'] and close['wmClosePosted']
saved=(root/'saved.txt').read_bytes()
assert saved.decode()=='STANDALONE23 CTRL SAVE REOPEN'
native=json.loads((root/'native-save.json').read_bytes())
assert native['status']=='passed' and native['nativeSaveInvoked'] and native['pathReadbackMatches']
assert native['ownedPid']==report['steps'][0]['pid']
assert native['filenameMethod']=='physical-keys-owned-native-filename'
assert native['saveMethod']=='actual-Enter-owned-native-Save-dialog'
print(json.dumps(dict(status='passed-host-only',newProcessReopen=True,savedSha256=hashlib.sha256(saved).hexdigest(),finalAppAcceptance=False)))
