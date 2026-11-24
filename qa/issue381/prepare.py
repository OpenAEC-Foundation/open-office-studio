"""Prepare only private source-unit inputs from retained, hash-pinned bytes."""
import hashlib
import io
import json
from pathlib import Path
import tarfile
import zipfile

def prepare():
    root=Path('.local/issue381').resolve()
    retained=Path('docs/tests/issue381-20261124/retained')
    meta=json.loads(Path('patches/libwps-wq2-vlookup.json').read_bytes())
    archive=(retained/'libwps-0.4.14.tar.xz').read_bytes()
    assert hashlib.sha256(archive).hexdigest()==meta['upstream']['tarSha256']
    root.mkdir(parents=True,exist_ok=True)
    (root/'libwps-0.4.14.tar.xz').write_bytes(archive)
    original=root/'libwps-original'; original.mkdir(exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(archive)) as source:
        for name in ['QuattroDosSpreadsheet.cpp','QuattroDos.cpp','WKSContentListener.h']:
            (original/name).write_bytes(source.extractfile('libwps-0.4.14/src/lib/'+name).read())
        for name in ['COPYING.MPL','COPYING.LGPL']:
            (original/name).write_bytes(source.extractfile('libwps-0.4.14/'+name).read())
    old=(original/'QuattroDosSpreadsheet.cpp').read_bytes()
    assert hashlib.sha256(old).hexdigest()==meta['upstream']['originalSha256']
    # Apply the reviewable diff, not a second implementation of the fix.
    lines=old.decode().splitlines(True)
    patch=Path('patches/libwps-wq2-vlookup.patch').read_text().splitlines(True)
    assert len([l for l in patch if l.startswith('@@')])==1
    start=next(i for i,l in enumerate(patch) if l.startswith('@@'))
    old_start=int(patch[start].split()[1][1:].split(',')[0])-1
    at=old_start; result=lines[:at]
    for line in patch[start+1:]:
        if line.startswith((' ','-')):
            assert lines[at]==line[1:];at+=1
        if line.startswith((' ','+')):result.append(line[1:])
    result.extend(lines[at:])
    new=''.join(result).encode()
    assert hashlib.sha256(new).hexdigest()==meta['upstream']['patchedSha256']
    patched=root/'libwps-patched'; patched.mkdir(exist_ok=True)
    (patched/'QuattroDosSpreadsheet.cpp').write_bytes(new)
    evidence=(retained/'wq2-runtime-result.zip').read_bytes()
    assert hashlib.sha256(evidence).hexdigest()=='4fc2da77b1e52eaa9ddc97ba8c8b4e3f119b9f9b9a16f9b3747fe98dd1a8711b'
    inputs=root/'inputs'; inputs.mkdir(exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(evidence)) as prior:
        for name in ['source.wq2','source-license.md','source-author-oracle.md','converted.xlsx']:
            (inputs/name).write_bytes(prior.read(name))
    assert hashlib.sha256((inputs/'source.wq2').read_bytes()).hexdigest()=='5431c7f8ae2840b93864049531448cdd7c79d939d31465e23abfefd1817703ce'
    return root

if __name__=='__main__':
    print(prepare())
