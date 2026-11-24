"""Private, one-use runtime copies; complete inventories remain fail-closed."""
import gzip
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import stat


def sha(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def inventory(root):
    result = {}
    for path in sorted(Path(root).rglob('*')):
        info = path.lstat()
        entry = {'mode': stat.S_IMODE(info.st_mode)}
        if stat.S_ISLNK(info.st_mode):
            entry.update(type='symlink', target=str(path.readlink()))
        elif stat.S_ISDIR(info.st_mode):
            entry.update(type='directory')
        elif stat.S_ISREG(info.st_mode):
            entry.update(type='file', bytes=info.st_size, sha256=sha(path))
        else:
            entry.update(type='unsupported', rawMode=info.st_mode)
        result[path.relative_to(root).as_posix()] = entry
    return result


def manifest_inventory(entries):
    result = {}
    for entry in entries:
        name = entry['path']
        path = PurePosixPath(name)
        assert not path.is_absolute() and '..' not in path.parts and ':' not in name and '\\' not in name
        assert name == path.as_posix() and name not in ('', '.')
        assert name not in result
        value = {'mode': int(entry['mode'], 8), 'type': entry['type']}
        if entry['type'] == 'file':
            value.update(bytes=entry['bytes'], sha256=entry['sha256'])
        else:
            assert entry['type'] == 'directory', 'Shared input contract has only directories/files'
        result[name] = value
    return result


def differences(expected, actual):
    return {
        'missing': sorted(expected.keys() - actual.keys()),
        'extra': sorted(actual.keys() - expected.keys()),
        'changed': {p: {'expected': expected[p], 'actual': actual[p]}
                    for p in sorted(expected.keys() & actual.keys()) if expected[p] != actual[p]},
    }


class Audit:
    def __init__(self, destination):
        self.destination = Path(destination)
        self.destination.mkdir(parents=True, exist_ok=False)
        self.steps = []

    def check(self, label, root, expected, reason):
        actual = inventory(root)
        data = (json.dumps(actual, sort_keys=True, separators=(',', ':')) + '\n').encode()
        archive = self.destination / (label + '.json.gz')
        archive.write_bytes(gzip.compress(data, mtime=0))
        delta = differences(expected, actual)
        passed = not any(delta.values())
        self.steps.append(dict(label=label, root=str(root), reason=reason, passed=passed,
                               inventory=archive.name, inventorySha256=sha(archive),
                               entries=len(actual), differences=delta))
        (self.destination / 'steps.json').write_bytes((json.dumps(self.steps, indent=2) + '\n').encode())
        if not passed:
            raise AssertionError('Unexpected runtime mutation: ' + label + '; see ' + str(self.destination / 'steps.json'))
        return actual


def fresh_variant(canonical, destination, manifest, library_relative, library_source,
                  original_sha, selected_sha, audit):
    """Never execute canonical. No existing destination is reusable or cleaned up."""
    canonical, destination = Path(canonical).resolve(), Path(destination).resolve()
    assert not destination.exists(), 'One-use variant prefix already exists'
    assert not destination.is_relative_to(canonical) and not canonical.is_relative_to(destination)
    expected = manifest_inventory(manifest)
    assert expected[library_relative]['type'] == 'file'
    assert expected[library_relative]['sha256'] == original_sha
    assert sha(library_source) == selected_sha
    audit.check('canonical-before-copy', canonical, expected, 'Exact verified input; never executed')
    shutil.copytree(canonical, destination, symlinks=True)
    audit.check('variant-copied', destination, expected, 'Byte/mode-identical private copy of canonical input')
    audit.check('canonical-after-copy', canonical, expected, 'Copy must not modify canonical input')
    derived = {p: dict(v) for p, v in expected.items()}
    if selected_sha != original_sha:
        target = destination / library_relative
        shutil.copyfile(library_source, target)  # Preserve copied mode, never normalize it.
        derived[library_relative].update(bytes=Path(library_source).stat().st_size, sha256=selected_sha)
    audit.check('variant-derived', destination, derived,
                'DERIVED_PRIVATE_QA_ONLY_NOT_OFFICIAL_RUNTIME; only selected libwps bytes may differ')
    return derived, expected
