"""Independently inspect downloaded real browser DOCX and exact source receipts."""
import hashlib
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
import zipfile

APP='dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b';TREE='5a644e397ecc6af5452a49b6404edf953687d1b2'
SOURCE='0ae783979ec180a4a6378d9b6c43ae5af05b47e5a5d18b26dea72e4fa1ed6be6'

def audit(root):
    meta=json.loads((root/'artifact-metadata.json').read_bytes());run=json.loads((root/'run.json').read_bytes())
    assert run['id']==45145748260 and run['head_sha']=='83792e30de8c2a0530888505079c64da9cc40ebe'
    assert meta['id']==14804780345 and meta['digest']=='sha256:'+hashlib.sha256((root/'artifact.zip').read_bytes()).hexdigest()
    with zipfile.ZipFile(root/'artifact.zip') as archive:
        members=[entry.filename for entry in archive.infolist() if not entry.is_dir()]
        assert len(members)==len(set(members))
        assert set(members)=={p.relative_to(root/'files').as_posix() for p in (root/'files').rglob('*') if p.is_file()}
        for name in members:
            assert archive.read(name)==(root/'files'/name).read_bytes(), name
    overall=json.loads((root/'files/report.json').read_bytes())
    assert overall['status']=='passed' and overall['source']==APP and overall['tree']==TREE
    checked=[]
    for variant,route in (('normal','/'),('hosted','/office/')):
        folder=root/'files'/variant;report=json.loads((folder/'report.json').read_bytes())
        assert report['status']=='passed' and report['source']==APP and report['tree']==TREE and report['route']==route
        assert report['sourceSha256']==SOURCE and report['sourceUnchanged'] and report['noTauri'] and report['documentXmlPreserved']
        assert not report['errors'] and not report['externalRequests']
        assert [c['ext'] for c in report['cases']]==['gnumeric','gnm']
        for case in report['cases']:
            assert case['ext'].upper() in case['message'] and 'desktop' in case['message'] and 'XLSX' in case['message']
            assert case['tabsPreserved'] and case['activePreserved'] and case['messageImage']
        assert not report['cleanup']['errors']
        assert all(report['cleanup'][key] for key in ('contextClosed','browserClosed','serverClosed'))
        receipt=(folder/'build-receipt.json').read_bytes();assert hashlib.sha256(receipt).hexdigest()==report['buildReceiptSha256']
        build=json.loads(receipt);assert build['source']==APP and build['tree']==TREE and build['route']==route
        assert len(build['files'])==report['buildFiles']==727
        documents=[]
        for stage in ('before','after'):
            file=folder/(stage+'.docx');data=file.read_bytes();assert hashlib.sha256(data).hexdigest()==report[stage+'Sha256']
            with zipfile.ZipFile(file) as package:
                assert not any('vbaproject' in n.lower() for n in package.namelist())
                xml=package.read('word/document.xml');text=''.join(ET.fromstring(xml).itertext())
                assert 'GNM30 BROWSER PRESERVE' in text
            documents.append(xml)
        assert documents[0]==documents[1] and hashlib.sha256(documents[0]).hexdigest()==report['documentXmlSha256']
        checked.append(dict(route=route,realDocxFilesChecked=2,actualUnsupportedInputMessages=2,xmlPreserved=True,cleanupConfirmed=True))
    return dict(status='passed',source=APP,tree=TREE,routes=checked,scope='Actual browser route and independent saved-byte evidence only; no native/desktop conversion inference')

if __name__=='__main__':
    root=Path(sys.argv[1] if len(sys.argv)>1 else 'docs/tests/formatendekking/2026-11-23-gnm-proof/browser')
    print(json.dumps(audit(root)))
