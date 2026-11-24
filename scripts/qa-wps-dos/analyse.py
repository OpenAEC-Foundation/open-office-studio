"""Replay native source qualification and historical ledger; no conversion."""
import hashlib
import json
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET
import zipfile

from native import inspect_source, controls

ROOT = Path(__file__).resolve().parents[2]
DOC = ROOT/'docs/tests/wps-dos-source-2026-11-24'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def blob(data):
    return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()


def git_bytes(commit,path):
    return subprocess.check_output(['git','show',commit+':'+path],cwd=ROOT)


def inspect_converted(path):
    ns = {'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    with zipfile.ZipFile(path) as z:
        doc = ET.fromstring(z.read('word/document.xml'))
        stories = {}
        for name in z.namelist():
            if name == 'word/document.xml' or (name.startswith('word/') and any(t in name for t in ('header','footer','footnotes','endnotes')) and name.endswith('.xml')):
                root = ET.fromstring(z.read(name))
                stories[name] = ''.join(root.itertext()) if not root.tag.startswith('{'+ns['w']+'}') else ''.join(t.text or '' for t in root.findall('.//w:t',ns))
        return dict(file=path.name,bytes=path.stat().st_size,sha256=sha(path.read_bytes()),
                    documentXmlSha256=sha(z.read('word/document.xml')),
                    observedBodyParagraphs=len(doc.findall('w:body/w:p',ns)),
                    observedBodyTables=len(doc.findall('w:body/w:tbl',ns)),
                    wordStoryText=stories,
                    boundary='Conversion-stage observation only; not a saved-result or P2/runtime/native acceptance claim')


def main():
    config = json.loads(Path(__file__).with_name('fixture.json').read_text(encoding='utf8'))
    point = config['application']['commit']
    assert subprocess.check_output(['git','rev-parse',point+'^{tree}'],cwd=ROOT,text=True).strip() == config['application']['tree']
    for path,pin in config['p2Bindings'].items():
        b = git_bytes(point,path)
        assert len(b) == pin['bytes'] and sha(b) == pin['sha256'] and blob(b) == pin['blob'],path
    catalog = json.loads(git_bytes(point,'docs/tests/formatendekking/bronnen.json'))
    assert config['source'] == next(x for x in catalog['sources'] if x['id']=='lo-wps-2')
    assert config['source']['expected']=='open' and config['source']['expectEmptyWarning'] is True
    raw = (DOC/'source.wps').read_bytes()
    pin = config['source']
    assert len(raw)==pin['bytes'] and sha(raw)==pin['sha256'] and blob(raw)==pin['gitSha']
    for pin in config['notices']:
        b = (DOC/'source-notices'/pin['path']).read_bytes()
        assert len(b)==pin['bytes'] and sha(b)==pin['sha256'] and blob(b)==pin['blob']
    for path,pin in config['retainedBindings'].items():
        b = (DOC/'retained'/path).read_bytes()
        assert len(b)==pin['bytes'] and sha(b)==pin['sha256'],path
    oracle = inspect_source(raw)  # independent bytes before reading historical output
    assert oracle['primaryText']['hex']=='0d0a' and oracle['primaryText']['nonCRLFBytes']==[]
    assert oracle['independentNonemptyPrimaryTextWitness'] is False
    assert len(oracle['outsidePrimaryText']['printableRuns']) > 0
    checks = controls(raw)
    assert all(c['passed'] for c in checks)
    report_bytes = (DOC/'retained/historical-windows-report.json').read_bytes()
    assert report_bytes == git_bytes(point,'docs/tests/formatendekking/resultaat-windows.json')
    report = json.loads(report_bytes)
    historical = next(x for x in report['results'] if x['id']=='lo-wps-2')
    assert historical['passed'] and historical['emptyConversionWarning']
    assert historical['savedBytes']==5296 and historical['savedSha256']=='27120ec04304347f750d350c64b3eb24b644da247c9832ef0cca48b0313886cc'
    snapshots = [inspect_converted(DOC/'retained'/name) for name in ('converted-23506ms.docx','converted-14125ms.docx')]
    assert all(s['bytes']==5407 and s['sha256']!=historical['savedSha256'] for s in snapshots)
    # No positive-content pass from empty OOXML; observations stay separate.
    assert all(not any(s['wordStoryText'].values()) for s in snapshots)
    timeout = json.loads((DOC/'retained/timeout-receipt.json').read_text(encoding='utf8'))
    matching_duration = json.loads((DOC/'retained/converted-23506ms-receipt.json').read_text(encoding='utf8'))
    later = json.loads((DOC/'retained/converted-14125ms-receipt.json').read_text(encoding='utf8'))
    assert timeout['timedOut'] and not matching_duration['timedOut'] and not later['timedOut']
    assert matching_duration['ms']==historical['conversionMs']
    formats = json.loads(git_bytes(point,'src/formaten.json'))
    assert 'wps' in formats['docx']['invoer'] and 'wps' not in formats['docx']['uitvoer']
    result = dict(status='SOURCE_GAP_NO_POSITIVE_PRIMARY_TEXT_WITNESS',fullFormatAcceptance=False,
                  application=config['application'],source=config['source'],nativeOracle=oracle,readerControls=checks,
                  primaryLayoutReferences=config['primaryLayoutReferences'],
                  historicalLedger=dict(reportDate=report['date'],converter=report['converter'],profileSha256=report['profileSha256'],
                       result=historical,timeoutReceipt=timeout,matchingDurationConversionReceipt=matching_duration,
                       laterConversionReceipt=later,convertedSnapshots=snapshots,
                       savedResultRawBytesVerified=False,
                       savedResultBoundary='No matching saved bytes in the inspected existing lo-wps-2 cache directories. The 5407-byte conversion-stage files are not the reported 5296-byte saved DOCX.',
                       currentP2RuntimeEquivalence=False),
                  p2Policy=dict(target='docx',wpsOutput=False,modernDefault='docx',
                       browser='External converter requires desktop. Source inspection only, no new browser test.'),
                  boundaries=['Implementation-guided native header/zone reader is not a normative independent Microsoft producer specification.',
                       'Exact 2.00A producer patch not proved from the catalogue name.',
                       'Primary text is CR/LF only; outside printable bytes are not accepted as body or proved historical deleted content.',
                       'No positive body/footnote/bookmark/font/layout/charset witness; whole-document emptiness and exact logical paragraph count not certified.',
                       'Works6/lo-wps-1 evidence is not borrowed for this native DOS route.',
                       'Historical technical open/save/reopen and empty warning are retained without relabelling as P2 package/native/fresh-process acceptance.'],
                  runtimeDecision='Do not repeat empty import; no new CI/runtime/build/artifact allocation requested or used.',
                  originalUnchanged=sha((DOC/'source.wps').read_bytes())==config['source']['sha256'])
    (DOC/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
    print(json.dumps(dict(status=result['status'],primaryTextHex=oracle['primaryText']['hex'],
                         printableOutsidePrimary=len(oracle['outsidePrimaryText']['printableRuns']),
                         readerControls=len(checks),conversionSnapshots=len(snapshots),
                         positiveContentAcceptance=False,fullFormatAcceptance=False)))


if __name__=='__main__':
    main()
