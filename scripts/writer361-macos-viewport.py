"""One ordinary native Maximize action; original screenshots and raw AX only."""
import json
import math
import os
from pathlib import Path
import runpy
import sys
import time

OBS = runpy.run_path(str(Path(__file__).with_name('writer361-macos-ribbon-observation.py')))
VALUE = OBS['value']
WINDOW = OBS['capture_window']
CAPTURE = OBS['capture_original']


def button(snapshot, label):
    matches = [n for n in snapshot.get('rawNodes', [])
               if VALUE(n, 'AXRole') == 'AXButton' and VALUE(n, 'AXEnabled') is True
               and label in [VALUE(n, 'AXTitle'), VALUE(n, 'AXDescription')]
               and 'AXPress' in n.get('attributes', {}).get('actions', {}).get('value', [])]
    if len(matches) != 1:
        raise PermissionError('Expected one enabled native AXPress control: '+label)
    return matches[0]


def fitted(snapshot, pid):
    w = WINDOW(snapshot, pid)
    d = snapshot.get('mainDisplay', {}).get('bounds', {})
    if not all(type(d.get(k)) in [int, float] and math.isfinite(d[k]) for k in ['X', 'Y', 'Width', 'Height']) or d['Width'] <= 1 or d['Height'] <= 1:
        return False
    b = w['bounds']
    return (b['X'] >= d['X']-1 and b['Y'] >= d['Y']-1
            and b['X']+b['Width'] <= d['X']+d['Width']+1
            and b['Y']+b['Height'] <= d['Y']+d['Height']+1)


def alpha_target(snapshot, pid):
    w = WINDOW(snapshot, pid)['bounds']
    matches = []
    for n in snapshot.get('rawNodes', []):
        role = VALUE(n, 'AXRole')
        if role not in ['AXCell', 'AXStaticText'] or str(VALUE(n, 'AXValue') or '').strip() != 'alpha':
            continue
        p, s = VALUE(n, 'AXPosition'), VALUE(n, 'AXSize')
        if not isinstance(p, dict) or not isinstance(s, dict):
            continue
        if not all(type(v) in [int, float] and math.isfinite(v) for v in [p.get('x'), p.get('y'), s.get('width'), s.get('height')]):
            continue
        # Reject the collapsed10px accessibility mirror and identical cell boxes.
        twins = [other for other in snapshot.get('rawNodes', []) if VALUE(other, 'AXRole') in ['AXCell', 'AXStaticText'] and VALUE(other, 'AXPosition') == p and VALUE(other, 'AXSize') == s]
        if len(twins) != 1 or s['width'] <= 1 or s['height'] < 12 or s['width'] >= w['Width']/2:
            continue
        if p['x'] < w['X'] or p['y'] < w['Y'] or p['x']+s['width'] > w['X']+w['Width'] or p['y']+s['height'] > w['Y']+w['Height']:
            continue
        matches.append({'index': n['index'], 'role': role, 'value': 'alpha', 'position': p, 'size': s})
    if len(matches) != 1:
        raise PermissionError('Reliable unique native alpha geometry remains unavailable; no canvas click or paint primer attempted')
    return matches[0]


def maximize_once(action, out, identity, pid):
    if sys.platform != 'darwin' or os.environ.get('GITHUB_ACTIONS') != 'true' or os.environ.get('OOS_361_EXECUTE') != '1' or identity.get('macViewportSetup') != {'mode': 'native-maximize-once', 'executionApproved': True}:
        raise RuntimeError('Separately released disposable native viewport setup only')
    out = Path(out)
    out.mkdir(parents=True, exist_ok=False)
    report = {'status': 'blocked', 'pid': pid, 'source': identity['sourceCommit'], 'packageSha256': identity['packageSha256'], 'executableSha256': identity['executableSha256'], 'actionsSent': 0,
              'limits': ['Only the observed maximized viewport; no359cause/paint-fix claim', 'No editor input, script bridge, privacy change or AX size setter']}
    try:
        labels = json.loads(Path('src/i18n/locales/en/shell.json').read_text(encoding='utf-8'))['titleBar']
        before = action('raw-snapshot')
        report['beforeWindow'] = WINDOW(before, pid)
        report['beforeMainDisplay'] = before.get('mainDisplay')
        report['maxControl'] = button(before, labels['maximize'])
        (out/'before-ready-raw-ax.json').write_text(json.dumps(before, indent=2), encoding='utf-8')
        report['beforeOriginalCapture'] = CAPTURE(before, pid, out/'before-ready.png')
        report['actionsAttempted'] = 1
        action('ax-press-label', labels['maximize'])
        report['actionsSent'] = 1
        deadline = time.monotonic()+15
        while True:
            after = action('raw-snapshot')
            changed = WINDOW(after, pid)['bounds'] != report['beforeWindow']['bounds']
            try:
                button(after, labels['restore'])
                if changed and fitted(after, pid):
                    report['status'] = 'observed'
                    break
            except PermissionError:
                pass
            if time.monotonic() >= deadline:
                break
            time.sleep(.25)
        (out/'after-maximize-raw-ax.json').write_text(json.dumps(after, indent=2), encoding='utf-8')
        report['afterWindow'] = WINDOW(after, pid)
        report['afterMainDisplay'] = after.get('mainDisplay')
        report['afterOriginalCapture'] = CAPTURE(after, pid, out/'after-maximize.png')
        if report['status'] != 'observed':
            raise PermissionError('Native Maximize did not expose a changed on-screen viewport and Restore-down label')
        return report
    except Exception as error:
        report['reason'] = str(error)
        raise
    finally:
        (out/'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
