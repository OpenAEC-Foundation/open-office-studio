"""Independent saved ZIP/XML oracle; no Office engine or renderer import."""
import hashlib
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
import zipfile

BASE=Path(__file__).resolve().parent
SHA=lambda data:hashlib.sha256(data).hexdigest()
S='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
A='{http://schemas.openxmlformats.org/drawingml/2006/main}'
XDR='{http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing}'
R='{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'

def parts(path):
    with zipfile.ZipFile(path) as z:
        names=z.namelist();assert len(names)==len(set(names))
        return {n:z.read(n) for n in names}

def objects(p):return {n:SHA(b) for n,b in p.items() if n.startswith(('xl/drawings/','xl/ctrlProps/','xl/media/','xl/comments'))}

def cells(p):
    wb=ET.fromstring(p['xl/workbook.xml'])
    assert [s.get('name') for s in wb.find(S+'sheets')]==['Sheet1','Sheet2','Sheet3']
    # The source fixes these concrete parts; explicitly retain their binding.
    rel={r.get('Id'):r.get('Target') for r in ET.fromstring(p['xl/_rels/workbook.xml.rels'])}
    strings=[''.join(i.itertext()) for i in ET.fromstring(p['xl/sharedStrings.xml'])]
    output=[]
    for i,sheet in enumerate(wb.find(S+'sheets'),1):
        assert rel[sheet.get(R+'id')].lstrip('/') in (f'worksheets/sheet{i}.xml',f'xl/worksheets/sheet{i}.xml')
        result={}
        for c in ET.fromstring(p[f'xl/worksheets/sheet{i}.xml']).iter(S+'c'):
            value=c.findtext(S+'v');formula=c.findtext(S+'f');kind=c.get('t','n')
            if kind=='s':value=strings[int(value)]
            elif kind=='inlineStr':value=''.join(c.find(S+'is').itertext())
            if value is not None or formula is not None:result[c.get('r')]=dict(value=value,formula=formula,kind=kind)
        output.append(result)
    return output

def audit(root):
    source=BASE/'fixtures/calcshapes.sxc';converted=BASE/'fixtures/calcshapes-converted.xlsx'
    assert SHA(source.read_bytes())=='9a367d8e849001453b7d5684401f769abd63a621165ea3878da9d64b6fe2de2d'
    assert SHA(converted.read_bytes())=='7b3410fa3b5cb0897bf6a4caf61390e65199aa5e9f5c1f95f3025c49932c1196'
    with zipfile.ZipFile(source) as z:
        doc=ET.fromstring(z.read('content.xml'));ns={'t':'http://openoffice.org/2000/table','d':'http://openoffice.org/2000/drawing'}
        assert not any(e.get('{'+ns['t']+'}formula') for e in doc.iter())
        cut=[e for e in doc.iter('{'+ns['d']+'}ellipse') if e.get('{'+ns['d']+'}kind')=='cut'];assert len(cut)==1
    original=parts(converted);preserved=objects(original)
    geometry=ET.fromstring(original['xl/drawings/drawing1.xml'])
    shapes=[s for s in geometry.iter(XDR+'sp') if s.find(XDR+'spPr/'+A+'prstGeom') is not None and s.find(XDR+'spPr/'+A+'prstGeom').get('prst')=='chord']
    assert len(shapes)==1
    geom=shapes[0].find(XDR+'spPr/'+A+'prstGeom')
    assert {g.get('name'):g.get('fmla') for g in geom.find(A+'avLst')}==dict(adj1='val 7798761',adj2='val 347606')
    report=json.loads((root/'report.json').read_bytes());assert report['status']=='passed-scoped-browser-and-canvas'
    assert [r['route'] for r in report['routes']]==['/','/office/']
    actual=[]
    for i,route in enumerate(report['routes']):
        assert route['status']=='passed-browser-source-edit-undo-redo-save-fresh-reopen' and not route['errors']
        assert all(route['shortPreflight'].get(k) for k in ('focus','actualSaveDownload','closedContextAndFreshReopen'))
        for stage in ('preflight','edited','reopened'):
            path=root/f'route{i}-{stage}.xlsx';p=parts(path)
            assert objects(p)==preserved,(path,'object XML/media changed')
            data=cells(p);assert data[1:]==[{},{}]
            assert set(data[0])==({'C13'} if stage=='preflight' else {'C13','H1','I1'})
            assert data[0]['C13']['value']=='Note attached' and data[0]['C13']['formula'] is None
            if stage!='preflight':
                assert data[0]['H1']['value']=='QA_CHORD_380' and data[0]['H1']['formula'] is None
                assert data[0]['I1']['formula']=='40+2' and float(data[0]['I1']['value'])==42
            assert SHA(path.read_bytes())==route['outputHashes'][stage]
            actual.append(dict(file=path.name,sha256=SHA(path.read_bytes()),objectsUnchanged=True,independentCellsPassed=True))
    assert len(report['canvas'])==4 and all(c['checked']>1500 and c['inside']>100 and not c['mismatches'] for c in report['canvas'])
    assert all(report['cleanup'].values()) and report['sourceUnchanged']
    return dict(status='passed-independent-saved-xml-audit',sourceCommit=report['sourceCommit'],sourceTree=report['sourceTree'],sourceUnchanged=True,
                actualSavedFiles=actual,originalChordAdjustmentsRetained=True,allObjectPartsUnchanged=True,
                scope='Corrected browser rendering only. Original converter width/control limitations remain; no fixed native or standalone/signing acceptance.')

if __name__=='__main__':print(json.dumps(audit(Path(sys.argv[1]))))
