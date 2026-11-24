"""Allocated Linux-only host identity and real public-API UUID qualification.

No application/fontset/renderer configuration is changed. Probes use empty,
temporary directories outside the private payload, not the converter profile.
"""
import ctypes
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import uuid

from font_cache import load_policy, observer_uuid
from runtime_prefix import inventory, sha


def main(output, variant):
    assert sys.platform == 'linux' and os.environ.get('GITHUB_ACTIONS') == 'true'
    policy = load_policy()
    lib = ctypes.CDLL('libfontconfig.so.1')
    lib.FcGetVersion.restype = ctypes.c_int
    version = lib.FcGetVersion()
    (output/'report.json').write_bytes((json.dumps(dict(passed=False,version=version,expectedVersion=policy['referenceVersion']))+'\n').encode())
    assert version == policy['referenceVersion'], ('Unqualified Fontconfig version',version)
    paths = {Path(line.split()[-1]).resolve() for line in Path('/proc/self/maps').read_text().splitlines()
             if '/libfontconfig.so.' in line and not line.endswith('(deleted)')}
    assert len(paths) == 1, paths
    library = paths.pop()
    dynamic = subprocess.check_output(['readelf','-d',str(library)],text=True,timeout=5)
    linked = subprocess.check_output(['ldd',str(library)],text=True,timeout=5)
    assert 'not found' not in linked
    dependencies = []
    for path in re.findall(r'=> (/\S+)',linked):
        target=Path(path).resolve()
        dependencies.append(dict(path=str(target),sha256=sha(target)))
    package = subprocess.check_output(['dpkg-query','-W','-f=${Version}', 'libfontconfig1'],text=True,timeout=5)
    assert package.startswith('2.13.1-'), ('Package version differs from qualified base',package)
    lib.FcConfigCreate.restype=ctypes.c_void_p
    lib.FcConfigDestroy.argtypes=[ctypes.c_void_p]
    lib.FcDirCacheCreateUUID.argtypes=[ctypes.c_char_p,ctypes.c_int,ctypes.c_void_p]
    lib.FcDirCacheCreateUUID.restype=ctypes.c_int
    lib.FcDirCacheLoad.argtypes=[ctypes.c_char_p,ctypes.c_void_p,ctypes.c_void_p]
    lib.FcDirCacheLoad.restype=ctypes.c_void_p
    lib.FcDirCacheUnload.argtypes=[ctypes.c_void_p]
    config=lib.FcConfigCreate();assert config
    try:
        writer=output/'writer';writer.mkdir()
        assert lib.FcDirCacheCreateUUID(os.fsencode(writer),0,config)
        data=(writer/'.uuid').read_bytes()
        assert len(data)==36 and str(uuid.UUID(data.decode('ascii'))).encode()==data
        assert stat.S_IMODE((writer/'.uuid').stat().st_mode)==0o644
        assert set(inventory(writer))=={'.uuid'}
        reader=output/'reader';reader.mkdir()
        text=observer_uuid(policy,variant)
        (reader/'.uuid').write_bytes(text.encode('ascii'))
        before=inventory(reader)
        assert lib.FcDirCacheCreateUUID(os.fsencode(reader),0,config)
        cache=lib.FcDirCacheLoad(os.fsencode(reader),config,None)
        if cache:lib.FcDirCacheUnload(cache)
        assert inventory(reader)==before, 'Existing pinned UUID was rewritten'
        report=dict(passed=True,version=version,packageVersion=package,library=str(library),
            sha256=sha(library),dynamic=dynamic,ldd=linked,dependencies=dependencies,
            writerUuid=data.decode('ascii'),writerMode='0644',readerPreserved=True,readerUuid=text,
            observerCache=os.environ['XDG_CACHE_HOME'],
            readerDebugToken='FcDirCacheReadUUID '+str(reader/'.uuid')+' -> '+text,
            scope='Actual host API behavior plus pinned upstream2.13.1 reference; not historical writer attribution or complete ABI equivalence')
        (output/'report.json').write_bytes((json.dumps(report,indent=2)+'\n').encode())
    finally:lib.FcConfigDestroy(config)


if __name__=='__main__':main(Path(sys.argv[1]).resolve(),sys.argv[2])
