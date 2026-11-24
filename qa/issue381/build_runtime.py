"""Build only libwps against the verified private runtime's existing librevenge.

Linux CI only. No runtime acquisition, appbuild, system library replacement or
release pin change happens here. Original and incremental patched builds share
the exact source recipe/configuration and retain separate artifacts.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
from deadline import remaining
from abi_contract import compare_files
from runtime_prefix import Audit, manifest_inventory

ROOT=Path('.local/issue381').resolve()
OUT=ROOT/'build-proof'
RETAINED=Path('docs/tests/issue381-20261124/retained').resolve()
BASE='b696ab86bd1c128729a079b68c0082e6df3d36a5'
SONAME='libwps-0.4-lo.so.4'
REVENGE='librevenge-0.0-lo.so.0'

def sha(path):
    with Path(path).open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()
def write(name,data):
    (OUT/name).write_bytes((json.dumps(data,indent=2)+'\n').encode())
def run(argv,name,cwd=None,env=None,timeout=600):
    with (OUT/(name+'.stdout')).open('wb') as stdout,(OUT/(name+'.stderr')).open('wb') as stderr:
        completed=subprocess.run(argv,cwd=cwd,env=env,stdout=stdout,stderr=stderr,timeout=min(timeout,remaining('build')))
    assert completed.returncode==0,(name,completed.returncode)
def text(argv,env=None):return subprocess.check_output(argv,text=True,env=env)
def unpack(archive,destination):
    assert not destination.exists(),str(destination)
    destination.mkdir(parents=True)
    with tarfile.open(archive) as source:source.extractall(destination,filter='data')
def dynamic(path):
    listing=text(['readelf','-d',str(path)])
    return dict(soname=re.findall(r'\(SONAME\).*?\[(.*?)\]',listing),
        needed=sorted(re.findall(r'\(NEEDED\).*?\[(.*?)\]',listing)),
        paths=re.findall(r'\((?:RPATH|RUNPATH)\).*?\[(.*?)\]',listing),raw=listing)

def main():
    assert sys.platform=='linux' and os.environ.get('GITHUB_ACTIONS')=='true'
    remaining('preflight')
    OUT.mkdir(parents=True,exist_ok=True)
    assert text(['git','diff','--name-only',BASE,'--','src','src-tauri','vendor','packages','assets','public','package.json','pnpm-lock.yaml']).strip()==''
    canonical=json.loads((ROOT/'runtime-evidence/runtime-binding.json').read_bytes())
    canonical_root=Path(canonical['privateRoot']).resolve()
    canonical_program=Path(canonical['program']).resolve()
    assert canonical_program.is_relative_to(canonical_root)
    manifest=ROOT/'runtime-input/artifact/entry-manifest.json'
    assert sha(manifest)=='79204b36527a7fed0f073b5290df26a86c6a610ba4f78ddf36883507b28da029'
    expected=manifest_inventory(json.loads(manifest.read_bytes()))
    prefix_audit=Audit(OUT/'canonical-build-inventory')
    prefix_audit.check('before-build',canonical_root,expected,'Read-only library/header linkage, no canonical converter execution')
    program=canonical_program.parent
    original=program/SONAME
    assert sha(original)=='c6f5c5dc6bcabf01e83591a9365983171a538fcf41f77294523bc0a77f82ecc4'
    assert sha(program/REVENGE)=='2b19422f1da6181bacf3c73017349647ff918dbe5d1b8b589c796def13aad837'
    baseline=OUT/'packaged.so';shutil.copy2(original,baseline)
    meta=json.loads(Path('patches/libwps-wq2-vlookup.json').read_bytes())
    archive=RETAINED/'libwps-0.4.14.tar.xz'
    assert sha(archive)==meta['upstream']['tarSha256']
    headers=RETAINED/'librevenge-0.0.6.tar.bz2'
    assert sha(headers)=='52a65e904d255dbdd97a8b7bb28d6574e14f999eb01416aff004502406d0904d'
    build=ROOT/'library-source'
    unpack(archive,build)
    unpack(headers,ROOT/'dependency-headers')
    source=build/'libwps-0.4.14'
    revenge_headers=ROOT/'dependency-headers/librevenge-0.0.6/inc'
    patches=[('rpath.patch.0',0),('libtool.patch.0',0),('enumarith.patch',0),
        ('0001-const-up-some-things.patch.1',1),('tdf148749.patch.1',1),('libwps-bundled-soname.patch.0',0)]
    recipe=[]
    for name,level in patches:
        patch=RETAINED/('lo-'+name)
        run(['patch','--batch','--forward','--fuzz=0',f'-p{level}','-i',str(patch)],'apply-'+name,cwd=source)
        recipe.append(dict(name=name,sha256=sha(patch),strip=level))
    causal=source/'src/lib/QuattroDosSpreadsheet.cpp'
    assert sha(causal)==meta['upstream']['originalSha256'],'LO patches changed causal source'
    link=ROOT/'runtime-link';assert not link.exists();link.symlink_to(program,target_is_directory=True)
    assert ' ' not in str(link),'Build link must avoid whitespace for libtool'
    env=dict(os.environ)
    for key in ('GH_TOKEN','GITHUB_TOKEN','ACTIONS_RUNTIME_TOKEN','ACTIONS_ID_TOKEN_REQUEST_TOKEN'):env.pop(key,None)
    env.update(REVENGE_CFLAGS='-I'+str(revenge_headers),
        REVENGE_LIBS=f'-L{link} -l:{REVENGE}',PKG_CONFIG='',LD_LIBRARY_PATH=str(program))
    flags=['--with-pic','--enable-shared','--disable-static','--with-sharedptr=c++11','--without-docs',
        '--disable-tools','--disable-debug','--disable-werror','--enable-silent-rules',
        'CXXFLAGS=-O2 -fPIC',"LDFLAGS=-Wl,-z,origin -Wl,-rpath,'$$ORIGIN'"]
    report=dict(applicationCommit=BASE,applicationTree=text(['git','rev-parse',BASE+'^{tree}']).strip(),
        harnessCommit=text(['git','rev-parse','HEAD']).strip(),parentRuntime=canonical,
        designation='DERIVED_PRIVATE_QA_ONLY_NOT_OFFICIAL_RUNTIME',canonicalRuntime=canonical,
        originalLibrarySha256=sha(original),librevengeSha256=sha(program/REVENGE),
        librevengeHeadersSha256=sha(headers),libwpsArchiveSha256=sha(archive),patches=recipe,
        configure=flags,compiler=text(['g++','--version']),platform=text(['uname','-a']),
        patchSha256=sha('patches/libwps-wq2-vlookup.patch'),variants={},passed=False)
    write('build.json',report)
    run(['./configure',*flags],'configure',cwd=source,env=env)
    prefix_audit.check('after-configure',canonical_root,expected,'Configure only writes the private source build tree')
    for variant in ('rebuilt-control','patched'):
        prefix_audit.check('before-'+variant,canonical_root,expected,'Read-only canonical dependency linkage')
        if variant=='patched':
            run(['patch','--batch','--forward','--fuzz=0','-p1','-i',str(Path('patches/libwps-wq2-vlookup.patch').resolve())],
                'apply-381',cwd=source)
            assert sha(causal)==meta['upstream']['patchedSha256']
        run(['make','-j2'],'make-'+variant,cwd=source,env=env)
        libraries=[p for p in (source/'src/lib/.libs').glob(SONAME+'*') if p.is_file() and not p.is_symlink()]
        assert len(libraries)==1,libraries
        library=OUT/(variant+'.so');shutil.copy2(libraries[0],library)
        old_dynamic=dynamic(original);new_dynamic=dynamic(library)
        assert old_dynamic['soname']==new_dynamic['soname']==[SONAME]
        assert old_dynamic['needed']==new_dynamic['needed'],'Dependencies differ from original runtime library'
        assert new_dynamic['paths']==['$ORIGIN'],new_dynamic['paths']
        symbol_contract=compare_files(original,library,'qa/issue381/abi-symbol-policy.json')
        linked=text(['ldd',str(library)],env=env)
        assert 'not found' not in linked
        revenge_line=next(line for line in linked.splitlines() if REVENGE in line)
        resolved=Path(revenge_line.split('=>',1)[1].split(' (',1)[0].strip()).resolve()
        assert resolved==program/REVENGE
        report['variants'][variant]=dict(file=str(library),sha256=sha(library),bytes=library.stat().st_size,
            sourceSha256=sha(causal),dynamic=new_dynamic,symbolContract=symbol_contract,
            symbolVersions=text(['readelf','--version-info',str(library)]),ldd=linked)
        write('build.json',report)
        prefix_audit.check('after-'+variant,canonical_root,expected,'Compiler/linker/ABI checks must preserve canonical entries/modes/bytes')
    report['variants']['packaged']=dict(file=str(baseline),sha256=sha(baseline),dynamic=dynamic(baseline),
        symbolContract=compare_files(original,baseline,'qa/issue381/abi-symbol-policy.json'))
    report['runtimeUntouched']=sha(canonical_program.parent/SONAME)==report['originalLibrarySha256']
    assert report['runtimeUntouched']
    prefix_audit.check('after-build',canonical_root,expected,'Complete canonical inventory unchanged after compiler/linker/ldd')
    report['passed']=True;write('build.json',report)

if __name__=='__main__':main()
