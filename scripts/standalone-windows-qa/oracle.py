"""Independent stdlib saved-byte checks, not assertions against editor APIs."""
import hashlib
import json
from pathlib import Path
import sqlite3
import sys
import xml.etree.ElementTree as ET
import zipfile

def inspect(kind, path):
    data = path.read_bytes(); result = dict(kind=kind, bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
    if kind in ('writer','spreadsheet','presentation'):
        with zipfile.ZipFile(path) as z:
            names=z.namelist(); assert len(names)==len(set(names)) and len(names)<10000
            assert not any('vbaProject' in n or n.startswith('embeddings/') for n in names)
            for name in names:
                if name.endswith('.rels'):
                    assert not any(r.attrib.get('TargetMode')=='External' for r in ET.fromstring(z.read(name)))
            if kind=='writer':
                text=''.join(ET.fromstring(z.read('word/document.xml')).itertext())
                assert 'STANDALONE23 WRITER EDIT' in text
            elif kind=='spreadsheet':
                ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
                shared=[]
                if 'xl/sharedStrings.xml' in names:
                    shared=[''.join(e.itertext()) for e in ET.fromstring(z.read('xl/sharedStrings.xml'))]
                cells={c.attrib['r']:c for c in ET.fromstring(z.read('xl/worksheets/sheet1.xml')).findall('.//s:c',ns)}
                a=cells['A1']; value=a.find('s:v',ns)
                a_text=shared[int(value.text)] if a.attrib.get('t')=='s' else ''.join(a.itertext())
                assert a_text=='STANDALONE23 CELL'
                assert cells['B1'].find('s:v',ns).text=='41'
                formula=cells['C1'].find('s:f',ns); assert formula is not None and formula.text.lstrip('=')=='B1+1'
                result['formula']='B1+1'
            else:
                slides=[n for n in names if __import__('re').fullmatch(r'ppt/slides/slide\d+\.xml',n)]
                assert len(slides)>=2
                text='\n'.join(''.join(ET.fromstring(z.read(n)).itertext()) for n in slides)
                assert 'STANDALONE23 PRESENTATION EDIT' in text
                result['slideCount']=len(slides)
    elif kind=='notition':
        value=json.loads(data)
        for marker in ('STANDALONE23 NOTEBOOK','STANDALONE23 NOTE','STANDALONE23 NOTE BODY'): assert marker in json.dumps(value)
        result['validJsonBackup']=True
    elif kind=='database':
        connection=sqlite3.connect(path.resolve().as_uri()+'?mode=ro',uri=True)
        try: assert connection.execute('select label, amount from standalone_qa').fetchall()==[('STANDALONE23 DATABASE',42)]
        finally: connection.close()
    else: raise AssertionError('No independent file oracle for this kind')
    result['status']='passed'; return result

if __name__=='__main__':
    kind,file,report=sys.argv[1:]
    result=inspect(kind,Path(file)); Path(report).write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8'); print(json.dumps(result))
