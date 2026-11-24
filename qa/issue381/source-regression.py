"""Compile the pinned actual readCell/readFormula functions in an isolated adapter.

This is a source-extraction unit test. External types/byte streams are adapted;
it is not a complete libwps build, ABI check, patched converter or GUI test.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
from prepare import prepare

root=prepare()
out=root/'cpp-regression'
out.mkdir(exist_ok=True)
meta=json.loads(Path('patches/libwps-wq2-vlookup.json').read_bytes())
adapter=Path('qa/issue381/parser-adapter.cpp').read_text()
header_bytes=(root/'libwps-original/WKSContentListener.h').read_bytes()
header=header_bytes.decode()
instruction=header[header.index('\tstruct FormulaInstruction'):header.index('\n\t//! small class use to define a sheet cell content')]

def extract(source):
    cell=source[source.index('bool QuattroDosSpreadsheet::readCell\n'):source.index('\nnamespace QuattroDosSpreadsheetInternal\n{\nstruct Functions')]
    functions=source[source.index('namespace QuattroDosSpreadsheetInternal\n{\nstruct Functions'):source.index('bool QuattroDosSpreadsheet::readFormula(')]
    formula=source[source.index('bool QuattroDosSpreadsheet::readFormula('):source.index('\n////////////////////////////////////////////////////////////\n// send data')]
    generated=adapter.replace('// @INSTRUCTION@',instruction).replace('// @CELL@',cell).replace('// @FUNCTIONS@',functions).replace('// @FORMULA@',formula)
    return source[:source.index('#include')] + generated

source_file=root/'inputs/source.wq2'
assert hashlib.sha256(source_file.read_bytes()).hexdigest()=='5431c7f8ae2840b93864049531448cdd7c79d939d31465e23abfefd1817703ce'
assert hashlib.sha256((root/'libwps-0.4.14.tar.xz').read_bytes()).hexdigest()==meta['upstream']['tarSha256']
with tarfile.open(root/'libwps-0.4.14.tar.xz') as archive:
    assert header_bytes==archive.extractfile('libwps-0.4.14/src/lib/WKSContentListener.h').read()
results=[]
for name,digest in [('original',meta['upstream']['originalSha256']),('patched',meta['upstream']['patchedSha256'])]:
    path=root/f'libwps-{name}/QuattroDosSpreadsheet.cpp'
    data=path.read_bytes();assert hashlib.sha256(data).hexdigest()==digest
    cpp=out/(name+'.cpp');exe=out/(name+('.exe' if os.name=='nt' else ''))
    cpp.write_bytes(extract(data.decode()).encode())
    if os.name=='nt':
        vswhere=Path(os.environ['ProgramFiles(x86)'])/'Microsoft Visual Studio/Installer/vswhere.exe'
        vs=Path(subprocess.check_output([str(vswhere),'-latest','-products','*','-requires','Microsoft.VisualStudio.Component.VC.Tools.x86.x64','-property','installationPath'],text=True).strip())
        batch=out/(name+'.cmd')
        batch.write_text(f'@echo off\ncall "{vs / "Common7/Tools/VsDevCmd.bat"}" -arch=x64 -host_arch=x64 >nul\nif errorlevel 1 exit /b 1\ncl /nologo /std:c++17 /EHsc /Od /Fe"{exe}" /Fo"{out / (name+".obj")}" "{cpp}"\n')
        build=subprocess.run(['cmd','/d','/c',str(batch)],capture_output=True)
    else:
        build=subprocess.run([os.environ.get('CXX','c++'),'-std=c++17','-O0',str(cpp),'-o',str(exe)],capture_output=True)
    (out/(name+'-build.stdout')).write_bytes(build.stdout)
    (out/(name+'-build.stderr')).write_bytes(build.stderr)
    if build.returncode:
        print(build.stdout.decode(errors='replace'),build.stderr.decode(errors='replace'));raise SystemExit(build.returncode)
    run=subprocess.run([str(exe),str(source_file)],capture_output=True)
    (out/(name+'-run.stdout')).write_bytes(run.stdout)
    (out/(name+'-run.stderr')).write_bytes(run.stderr)
    print(name,run.returncode,run.stdout.decode(errors='replace'))
    results.append(dict(variant=name,sourceSha256=digest,generatedSha256=hashlib.sha256(cpp.read_bytes()).hexdigest(),executableSha256=hashlib.sha256(exe.read_bytes()).hexdigest(),buildExit=build.returncode,runExit=run.returncode))
(out/'receipt.json').write_bytes((json.dumps(dict(kind='extracted upstream parser source unit; not a full libwps/runtime test',platform=sys.platform,results=results),indent=2)+'\n').encode())
assert [r['runExit'] for r in results]==[1,0]
