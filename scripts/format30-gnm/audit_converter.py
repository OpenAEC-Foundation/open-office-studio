"""Recheck all real downloaded XLSX data/formulas against original Gnumeric XML."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import zipfile

spec=importlib.util.spec_from_file_location('gnm_oracle',Path(__file__).with_name('oracle.py'))
oracle=importlib.util.module_from_spec(spec);spec.loader.exec_module(oracle)
APP='dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b';TREE='5a644e397ecc6af5452a49b6404edf953687d1b2'

def audit(root):
    run=json.loads((root/'run.json').read_bytes());meta=json.loads((root/'artifact-metadata.json').read_bytes())
    assert run['id']==45147245169 and run['head_sha']=='c55b4559e7088fab26540e5e20cecbfb79e93da8' and run['conclusion']=='success'
    assert meta['id']==14805290890 and meta['digest']=='sha256:'+hashlib.sha256((root/'artifact.zip').read_bytes()).hexdigest()
    with zipfile.ZipFile(root/'artifact.zip') as archive:
        members=[entry.filename for entry in archive.infolist() if not entry.is_dir()]
        assert len(members)==len(set(members))
        assert set(members)=={p.relative_to(root/'files').as_posix() for p in (root/'files').rglob('*') if p.is_file()}
        for name in members:
            assert archive.read(name)==(root/'files'/name).read_bytes(), name
    proof=root/'files/gnm-P2-converter-proof';canonical=root/'files/gnm-P2-canonical'
    report=json.loads((proof/'report.json').read_bytes());verified=json.loads((canonical/'verified.json').read_bytes())
    plan=json.loads((canonical/'candidate.json').read_bytes())
    assert report['applicationCommit']==APP and report['applicationTree']==TREE and report['desktopRun']==45143305147
    assert report['harnessCommit']==run['head_sha'] and report['version']=='2026.48.1'
    assert report['status']=='passed' and report['dataAndRoutePassed'] and report['loaderClosed'] and report['sourceLevelBrowserGuard']
    assert report['artifact']==verified and plan['artifact']['packages']==verified['packages']
    assert verified['applicationCommit']==APP and verified['applicationTree']==TREE and verified['artifactId']==14804062140
    assert verified['archiveSha256']=='4704f7fdfe85a711a1c3f8a1da6114461bf17edde090d18f1665397ad23abbc6'
    expected_packages={'appimage':'5f4660c1deb0e29b80d75ae8356c72c29b84b50bd746a2932f28ae1af978e944',
                       'deb':'23258ac32f9368a6512b04ffcfda9a3f2be50dafeee6d8c7ca36a3a525a5f5d1'}
    assert {p['kind']:p['sha256'] for p in verified['packages']}==expected_packages
    assert {c['kind'] for c in report['cases']}==set(expected_packages)
    expected=oracle.source_contents((proof/'source.gnumeric').read_bytes());checked=[]
    for case in report['cases']:
        assert case['status']=='passed' and case['temporaryDisposed']
        assert '26.8.2.2' in case['runtimeVersion'] and case['packageSha256']==expected_packages[case['kind']]
        assert case['profileSha256']=='847721a36ebe27c89fa08ca5fc12f228ae11c8429be77940f80dc82b7ed89e40'
        assert [e['ext'] for e in case['extensions']]==['gnumeric','gnm']
        for extension in case['extensions']:
            assert extension['status']=='passed' and extension['sourceUnchanged'] and extension['expectedTypedCells']==8
            assert extension['expectedFormulas']==4 and extension['sheetCount']==2 and extension['secondSheetMarkerSavedReopened']
            for stage in ('converted','saved','reopened'):
                path=proof/case['kind']/extension['ext']/(stage+'.xlsx');data=path.read_bytes()
                assert hashlib.sha256(data).hexdigest()==extension[stage+'Sha256']
                oracle.check(data,expected,stage!='converted')
                checked.append(dict(package=case['kind'],extension=extension['ext'],stage=stage,sha256=hashlib.sha256(data).hexdigest()))
    assert len(checked)==12
    # The upload glob captured nested pip/setuptools Windows launchers. Only
    # direct appimage/deb installer inputs entered extraction or execution.
    assert len(verified['ancillaryNotExtracted'])==28
    assert all('/python-core-' in name and name.endswith('.exe') for name in verified['ancillaryNotExtracted'])
    return dict(status='passed',source=APP,tree=TREE,actualXlsxFilesChecked=12,typedSourceCellsPerFile=8,formulasPerFile=4,sheets=2,
                originalSourceSha256=oracle.SOURCE_SHA,outputs=checked,
                scope='Independent private Linux converter/production engine data proof, not native app/IPC/dialogue/visual acceptance')

if __name__=='__main__':
    root=Path(sys.argv[1] if len(sys.argv)>1 else 'docs/tests/formatendekking/2026-11-23-gnm-proof/converter')
    print(json.dumps(audit(root)))
