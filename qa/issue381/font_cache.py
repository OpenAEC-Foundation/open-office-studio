"""Explicit UUID metadata and isolated caches for private #381 QA only."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import uuid

from runtime_prefix import inventory, sha

VARIANTS = ('packaged', 'rebuilt-control', 'patched')
FONT_ROOT = 'payload/usr/libexec/Open Office Studio/kantoorruntime/'
UUID_PATHS = (FONT_ROOT+'program/resource/common/fonts/.uuid', FONT_ROOT+'share/fonts/truetype/.uuid')


def load_policy():
    policy = json.loads(Path('qa/issue381/font-cache-policy.json').read_bytes())
    return validate_policy(policy)


def validate_policy(policy):
    assert policy['schemaVersion'] == 1 and policy['referenceVersion'] == 21301
    for path, digest in policy['referenceFiles'].items():
        assert sha(path) == digest, ('Fontconfig reference bytes changed', path)
    assert set(policy['variants']) == set(VARIANTS)
    seen = set()
    for entries in policy['variants'].values():
        assert set(entries) == set(UUID_PATHS), 'Only the two observed font UUID paths'
        for entry in entries.values():
            text = entry['uuid']
            parsed = uuid.UUID(text)
            assert str(parsed) == text and parsed.version == 5 and parsed.variant == uuid.RFC_4122
            assert len(text.encode('ascii')) == entry['bytes'] == 36
            assert entry['mode'] == '0644'
            assert hashlib.sha256(text.encode('ascii')).hexdigest() == entry['sha256']
            assert text not in seen, 'UUID collision between private variants/directories'
            seen.add(text)
    return policy


def metadata_expected(expected, variant, policy):
    result = {p: dict(v) for p, v in expected.items()}
    for path, entry in policy['variants'][variant].items():
        assert path not in result, 'Never overwrite existing payload bytes'
        assert result[Path(path).parent.as_posix()]['type'] == 'directory'
        result[path] = dict(type='file', mode=0o644, bytes=36, sha256=entry['sha256'])
    return result


def seed_metadata(prefix, expected, variant, audit, policy):
    assert sys.platform == 'linux', 'Actual POSIX metadata creation requires the allocated Linux witness'
    planned = metadata_expected(expected, variant, policy)
    audit.check('before-font-metadata', prefix, expected, 'No metadata present in original verified payload')
    current = {p: dict(v) for p, v in expected.items()}
    for index, (path, entry) in enumerate(policy['variants'][variant].items()):
        target = Path(prefix)/path
        assert target.parent.resolve().is_relative_to(Path(prefix).resolve())
        with os.fdopen(os.open(target, os.O_WRONLY|os.O_CREAT|os.O_EXCL, 0o644), 'wb') as stream:
            stream.write(entry['uuid'].encode('ascii'))
        current[path] = planned[path]
        audit.check('font-metadata-'+str(index), prefix, current,
                    'Explicit private metadata derivation, pinned UUID bytes/mode/hash; no existing entry normalized')
    return planned


class CacheGuard:
    def __init__(self, base, variant, audit):
        assert variant in VARIANTS
        self.base, self.variant, self.audit = Path(base).resolve(), variant, audit
        self.base.mkdir(parents=True, exist_ok=True)
        self.before = inventory(self.base)
        assert all(Path(p).parts[0] in VARIANTS for p in self.before), 'Unowned cache root entry'
        assert not any(Path(p).parts[0] == variant for p in self.before), 'Cache cannot be reused'
        self.path = self.base/variant
        self.xdg = self.path/'xdg'
        (self.xdg/'fontconfig').mkdir(parents=True, exist_ok=False)
        self.finish('cache-created')

    def environment(self):
        return {'XDG_CACHE_HOME': str(self.xdg), 'FC_DEBUG': '16'}

    def finish(self, label='cache-after-converter'):
        actual = inventory(self.base)
        own = {p:v for p,v in actual.items() if Path(p).parts[0] == self.variant}
        assert all(v['type'] in ('file','directory') for v in own.values()), 'No cache symlinks/devices'
        expected = {**self.before, **own}
        self.audit.check(label, self.base, expected,
                         'Own fresh external font cache may vary; every other variant path/mode/byte/hash stays exact')


def validate_cache_log(log, prefix, variant, policy, cache):
    reads = []
    observed = {(Path(path).resolve(), text) for path,text in
                re.findall(r'FcDirCacheReadUUID (.+) -> ([0-9a-f-]{36})',log)}
    for path, entry in policy['variants'][variant].items():
        token = 'FcDirCacheReadUUID '+str(Path(prefix)/path)+' -> '+entry['uuid']
        assert ((Path(prefix)/path).resolve(),entry['uuid']) in observed, 'Actual fontconfig reader did not confirm pinned metadata: '+path
        reads.append(token)
    writes = re.findall(r'FcDirCacheWriteDir dir "[^"]*" file "([^"]*)"', log)
    assert writes, 'No actual isolated font-cache write observed'
    for path in writes:
        assert Path(path).resolve().is_relative_to(cache.xdg.resolve()), ('Global/cross-variant cache write',path)
        name = Path(path).name
        foreign = [entry['uuid'] for other, entries in policy['variants'].items() if other != variant for entry in entries.values()]
        assert not any(token in name for token in foreign), 'Cross-variant cache UUID observed'
    for entry in policy['variants'][variant].values():
        assert any(Path(path).name.startswith(entry['uuid']+'-') for path in writes), 'Pinned directory did not write its own isolated UUID cache'
    return dict(metadataReads=reads, cacheWrites=writes, externalCache=str(cache.path))


def qualification_environment(env, output):
    return {**env, 'LD_DEBUG_OUTPUT': str(Path(output)/'host-loader'),
            'XDG_CACHE_HOME': str(Path(output)/'xdg')}


def observer_uuid(policy, variant):
    namespace=uuid.UUID(policy['variants'][variant][UUID_PATHS[0]]['uuid'])
    value=str(uuid.uuid5(namespace,'issue381-host-qualification-reader'))
    assert value not in {e['uuid'] for entries in policy['variants'].values() for e in entries.values()}
    return value


def run_qualified_probe(cache, operation):
    before=inventory(cache.path)
    cache.audit.check('converter-cache-before-host-probe',cache.path,before,
                      'Fresh converter cache must remain byte/mode/path-identical during observer qualification')
    try:
        return operation()
    finally:
        cache.audit.check('converter-cache-after-host-probe',cache.path,before,
                          'Observer writes in the converter cache are rejected before converter launch')
        cache.finish('variant-caches-after-host-probe')


def qualify_host(output, env, variant, policy, timeout, cache):
    output = Path(output)
    assert not output.resolve().is_relative_to(cache.path) and not cache.path.is_relative_to(output.resolve())
    output.mkdir(parents=True, exist_ok=False)
    (output/'xdg/fontconfig').mkdir(parents=True,exist_ok=False)
    def operation():
        child=subprocess.run([sys.executable, 'qa/issue381/fontconfig_host.py', str(output), variant],
                             env=qualification_environment(env,output), capture_output=True, timeout=timeout)
        (output/'stdout.log').write_bytes(child.stdout)
        (output/'stderr.log').write_bytes(child.stderr)
        return child
    child=run_qualified_probe(cache,operation)
    assert child.returncode == 0, child.stderr.decode(errors='replace')
    report = json.loads((output/'report.json').read_bytes())
    assert report['passed'] and report['version'] == policy['referenceVersion']
    assert report['readerDebugToken'].encode() in child.stdout, 'Actual host UUID reader not observed'
    report['readerDebugObserved'] = True
    (output/'report.json').write_bytes((json.dumps(report,indent=2)+'\n').encode())
    return report
