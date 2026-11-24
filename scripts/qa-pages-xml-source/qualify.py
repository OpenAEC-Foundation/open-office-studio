"""Source/container qualification only; no document semantics or Office calls."""
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import subprocess
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[2]
DOC = ROOT/'docs/tests/pages-xml-source-2026-11-24'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def blob(data):
    return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()


def git_bytes(point,path):
    return subprocess.check_output(['git','show',point+':'+path],cwd=ROOT)


def main():
    cfg = json.loads(Path(__file__).with_name('fixture.json').read_text(encoding='utf8'))
    point = cfg['application']['commit']
    assert subprocess.check_output(['git','rev-parse',point+'^{tree}'],cwd=ROOT,text=True).strip()==cfg['application']['tree']
    for path,pin in cfg['p2Bindings'].items():
        b = git_bytes(point,path)
        assert len(b)==pin['bytes'] and sha(b)==pin['sha256'] and blob(b)==pin['blob'],path
    catalog = json.loads(git_bytes(point,'docs/tests/formatendekking/bronnen.json'))
    assert cfg['source']==next(s for s in catalog['sources'] if s['id']=='lo-pages-1')
    raw = (DOC/'source.pages').read_bytes()
    pin = cfg['source']
    assert len(raw)==pin['bytes'] and sha(raw)==pin['sha256'] and blob(raw)==pin['gitSha']
    for pin in cfg['notices']:
        b = (DOC/'source-notices'/pin['path']).read_bytes()
        assert len(b)==pin['bytes'] and sha(b)==pin['sha256'] and blob(b)==pin['blob']
    for path,pin in cfg['retainedBindings'].items():
        b = (DOC/'retained'/path).read_bytes()
        assert len(b)==pin['bytes'] and sha(b)==pin['sha256'],path
    members = []
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        infos = z.infolist()
        assert len(infos)==4 and len({i.filename for i in infos})==4
        assert sum(i.file_size for i in infos)<8*1024*1024
        for info in infos:
            path = PurePosixPath(info.filename)
            assert not path.is_absolute() and '..' not in path.parts and '\\' not in info.filename
            assert not info.flag_bits&1, 'encrypted entry not accepted'
            b = z.read(info)  # zipfile validates this original member's CRC.
            members.append(dict(name=info.filename,bytes=len(b),crc32=f'{info.CRC:08x}',crcVerified=True,sha256=sha(b)))
        xml = z.read('index.xml')
        assert len(xml)<8*1024*1024 and b'<!DOCTYPE' not in xml.upper() and b'<!ENTITY' not in xml.upper()
        root = ET.fromstring(xml)  # no DTD/entity declarations; no network/extraction.
        assert root.tag=='{http://developer.apple.com/namespaces/sl}document'
    report_bytes = (DOC/'retained/historical-windows-report.json').read_bytes()
    assert report_bytes==git_bytes(point,'docs/tests/formatendekking/resultaat-windows.json')
    report = json.loads(report_bytes)
    old = next(r for r in report['results'] if r['id']=='lo-pages-1')
    converted = (DOC/'retained/historical-converted.docx').read_bytes()
    assert len(converted)==5412 and sha(converted)!=old['savedSha256']
    result = dict(status='PAGES_XML_CONTAINER_QUALIFIED_CONTENT_AND_RUNTIME_OPEN',fullFormatAcceptance=False,
                  application=cfg['application'],source=cfg['source'],container=dict(memberCount=4,members=members,
                       indexXmlBytes=len(xml),indexXmlSha256=sha(xml),rootQName=root.tag,
                       dtdOrEntityDeclarations=False,memberCRCVerified=True,extractedToDisk=False),
                  producerQualification='Catalogue label Pages4(XML) is not an independent producer/version attestation',
                  historicalLedger=dict(reportDate=report['date'],converter=report['converter'],profileSha256=report['profileSha256'],
                       reportedResult=old,convertedBytes=len(converted),convertedSha256=sha(converted),
                       savedRawIdentityVerified=False,currentP2RuntimeEquivalence=False,
                       boundary='The existing5412-byte conversion cache is not the reported5303-byte saved DOCX. Only this existing cache was inspected.'),
                  remaining=['Independent source text/structure/style/layout oracle intentionally not developed in this container-only scope.',
                       'Reported saved5303-byte DOCX has no matching retained raw binding in the inspected cache.',
                       'Exact P2 converter/helper/Wordengine edit/UndoRedo/DOCXsave/fresh-process and native/browser platform acceptance remain unexecuted.',
                       'No preview/rendering/Pages5-IWA/macro/encryption/general Pages acceptance inferred.'],
                  noRuntimeOrCIStarted=True,originalUnchanged=sha((DOC/'source.pages').read_bytes())==cfg['source']['sha256'])
    (DOC/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
    print(json.dumps(dict(status=result['status'],sourceBytes=len(raw),memberCRCsPassed=len(members),
                         indexXmlBytes=len(xml),rootQName=root.tag,savedRawIdentityVerified=False,fullFormatAcceptance=False)))


if __name__=='__main__':
    main()
