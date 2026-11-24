"""Exactly four isolated #375 diagnostics; no importer correction or retry."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat

from neutral_startup import plan

TEST_LIBRARY = 'workdir/LinkTarget/CppunitTest/libtest_xmloff_draw.so'
PROFILE = 'workdir/CppunitTest/xmloff_draw.test.user'
TEST_LOG = 'workdir/CppunitTest/xmloff_draw.test.log'
MARKER = 'UOP375_STALE_INHERITED_FILL_THEME'
PRIMARY = {
    'sal/cppunittester/cppunittester.cxx': 'b3c26c9c1439dbe0b7023e4b4a8edb9315e477a318e24b88bae1dd9e57d3dba5',
    'include/docmodel/theme/ThemeColorType.hxx': '6432ce1e4c0c8bfc4df9cfa7ce7a3f5a25e239291ca33c92b42fac78eae10695',
}


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def inventory(source, relative):
    root = source / relative
    assert root.resolve(strict=True).is_relative_to(source)
    entries = []
    for path in [root, *sorted(root.rglob('*'))] if root.is_dir() else [root]:
        resolved = path.resolve(strict=True)
        assert resolved.is_relative_to(source), 'Outside-source diagnostic input: ' + str(path)
        item = {'path': path.relative_to(source).as_posix(),
                'mode': stat.S_IMODE(path.lstat().st_mode)}
        if path.is_symlink():
            item['symlink'] = os.readlink(path)
        if path.is_file():
            item.update(bytes=path.stat().st_size, sha256=sha(path))
        else:
            assert path.is_dir()
            item['directory'] = True
        entries.append(item)
    return entries


def snapshot(source):
    # Include every installed byte and all linked test/helper libraries, not
    # just the launcher. Profiles, test logs and make receipts are outside this.
    roots = ['instdir', 'workdir/LinkTarget/CppunitTest', 'workdir/LinkTarget/Library',
             'workdir/LinkTarget/Executable', 'workdir/UnpackedTarball/cppunit/src/cppunit/.libs',
             'workdir/UnpackedTarball/cppunit/src/cppunit/CompilerOutputter.cpp',
             'workdir/unittest', 'config_host.mk',
             'config_host/config_global.h', 'xmloff/qa/unit/draw.cxx',
             'xmloff/CppunitTest_xmloff_draw.mk',
             'xmloff/source/draw/XMLShapeStyleContext.cxx',
             'xmloff/qa/unit/data/uop-explicit-rectangle-fills.uop']
    entries = [item for relative in [*roots, *PRIMARY] for item in inventory(source, relative)]
    digest = hashlib.sha256(json.dumps(entries, sort_keys=True).encode()).hexdigest()
    return {'sha256': digest, 'entries': entries, 'testLibrarySHA256': sha(source / TEST_LIBRARY)}


def classify(log, code, call, assertion_line):
    selector = call['argv'][-1].split('=', 1)[1]
    started = re.findall(r'^\[_RUN_____\] (.+)$', log, re.M)
    finished = re.findall(r'^(.+) finished in: \d+ms$', log, re.M)
    phase = f"UOP375_STARTUP arm={call['arm']} phase="
    has_fatal = bool(re.search(r'SIGSEGV|SIGABRT|Segmentation fault|core dumped|Fatal error:|terminate called|timed out', log, re.I))
    result = {'exitCode': code, 'startedTests': started, 'finishedTests': finished,
              'startedCount': len(started), 'completedCount': len(finished),
              'classification': 'FAIL', 'fatalObserved': has_fatal}
    if started != [selector] or finished != [selector] or has_fatal or code == 124:
        return result
    if phase + 'before-init documents=0 frames=0' not in log or phase + 'before-load' not in log:
        return result
    if call['arm'] == 'B' and phase + 'options-held theme=' not in log:
        return result
    if call['arm'] == 'A' and 'phase=options-held' in log:
        return result
    if f"UOP375_STARTUP route={call['route']} phase=after-load" not in log:
        return result
    if 'UOP375_STARTUP phase=after-base-teardown options-released' not in log:
        return result
    if code == 0 and re.search(r'^OK \(1\)\s*$', log, re.M) and not re.search(r'assertion failed|FAILURES|Failure', log):
        result['classification'] = 'PASS'
    if call['route'] == 'uop' and code != 0:
        # Bind the actual CppUnit failure location, message and enum values.
        # The primary ThemeColorType header defines Unknown=-1 and Accent1=4.
        location = rf'(?:[^\n]*[/\\])?xmloff[/\\]qa[/\\]unit[/\\]draw\.cxx:{assertion_line}:{re.escape(selector)}'
        original = re.search(location + r'\nequality assertion failed\n- Expected: -1\n- Actual  : 4\n- ' + MARKER + r'(?:\n|$)', log)
        statistics = re.findall(r'^Run:\s*(\d+)\s+Failure total:\s*(\d+)\s+Failures:\s*(\d+)\s+Errors:\s*(\d+)\s*$', log, re.M)
        failures = re.findall(r'^Test name: (.+)$', log, re.M)
        if original and statistics == [('1', '1', '1', '0')] and failures == [selector]:
            result['classification'] = 'EXPECTED_COLOR_RED'
    return result


def execute(source, out, run, environment, remaining, save):
    """Caller owns one allocation/time budget; run returns actual subprocess code."""
    source, out = source.resolve(strict=True), out.resolve(strict=True)
    result = {'completed': False, 'arms': [], 'productFixAccepted': False,
              'technicalReviewRequired': True, 'automaticImporterContinuation': False}
    for relative, expected in PRIMARY.items():
        assert sha(source / relative) == expected, 'Changed primary diagnostic protocol: ' + relative
    test_source = (source / 'xmloff/qa/unit/draw.cxx').read_text()
    lines = [i + 1 for i, line in enumerate(test_source.splitlines()) if 'CPPUNIT_ASSERT_EQUAL_MESSAGE("' + MARKER + '"' in line]
    assert len(lines) == 1
    baseline = snapshot(source)
    (out / 'startup-input-manifest.json').write_text(json.dumps(baseline, indent=2) + '\n')
    result['inputManifestSHA256'] = sha(out / 'startup-input-manifest.json')
    result['identitySHA256'] = baseline['sha256']
    profile = source / PROFILE
    retained = source.parent / 'startup-retained-profiles'
    assert not retained.exists() and not profile.exists()
    retained.mkdir()
    seen = set()
    for call in plan():
        assert not profile.exists(), 'Profile must be absent before canonical gbuild creates it'
        assert snapshot(source) == baseline, 'Pre-arm binary/config/UI/source drift'
        log_path = source / TEST_LOG
        if log_path.exists():
            assert log_path.is_file() and not log_path.is_symlink()
            log_path.unlink()  # Only our stale test log, never a source/runtime file.
        child_env = dict(environment, **call['environment'])
        code = run('startup-' + call['label'], call['argv'], cwd=source,
                   timeout=remaining(), check=False, env=child_env)
        raw = log_path.read_bytes() if log_path.is_file() else b''
        (out / ('startup-' + call['label'] + '-cppunit.log')).write_bytes(raw)
        actual = classify(raw.decode(errors='replace').replace('\r\n', '\n'), code, call, lines[0])
        actual.update(label=call['label'], arm=call['arm'], route=call['route'],
                      selector=call['argv'][-1], logSHA256=hashlib.sha256(raw).hexdigest(),
                      profileAbsentBefore=True)
        result['arms'].append(actual)
        save(result)  # Preserve each actual failure before any following operation.
        core = source / 'workdir/CppunitTest/xmloff_draw.test.core'
        if core.exists():
            actual['coreManifest'] = inventory(source, core.relative_to(source))
            own_core = retained / (call['label'] + '-core')
            core.rename(own_core)  # Prevent the next canonical gbuild cleanup deleting it.
            actual['retainedActualCoreDirectory'] = str(own_core)
            total = sum(item.get('bytes', 0) for item in actual['coreManifest'])
            actual['coreBytes'] = total
            actual['coreUploaded'] = total <= 64 * 1024**2
            if actual['coreUploaded']:
                shutil.copytree(own_core, out / 'startup-cores' / call['label'], symlinks=True)
            save(result)
        assert profile.is_dir() and not profile.is_symlink()
        identity = (profile.stat().st_dev, profile.stat().st_ino)
        assert identity not in seen, 'Reused profile directory identity'
        seen.add(identity)
        actual['profileIdentity'] = list(identity)
        actual['profileManifest'] = inventory(source, PROFILE)
        own_retained = retained / call['label']
        profile.rename(own_retained)  # Same filesystem: retain the actual directory.
        assert (own_retained.stat().st_dev, own_retained.stat().st_ino) == identity
        copy = out / call['retainProfileAs']
        copy.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(own_retained, copy, symlinks=True)
        actual['retainedActualProfile'] = str(own_retained)
        actual['uploadedProfileCopy'] = str(copy.relative_to(out))
        actual['identityAfterSHA256'] = snapshot(source)['sha256']
        actual['identityUnchanged'] = actual['identityAfterSHA256'] == baseline['sha256']
        save(result)
        assert actual['identityUnchanged'], 'Post-arm binary/config/UI/source drift'
        assert not profile.exists()
    result['completed'] = True
    result['baselineExpectedStaleAccent1Failure'] = result['arms'][3]['classification'] == 'EXPECTED_COLOR_RED'
    result['allActualTestcasesNonzero'] = all(a['startedCount'] == 1 for a in result['arms'])
    save(result)
    return result
