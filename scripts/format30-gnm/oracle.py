"""Pinned genuine Gnumeric content -> independent typed cells/formulas/XLSX oracle."""
import argparse
import ast
from decimal import Decimal
import gzip
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import xml.etree.ElementTree as ET
import zipfile

SOURCE_SHA='0ae783979ec180a4a6378d9b6c43ae5af05b47e5a5d18b26dea72e4fa1ed6be6'
SOURCE_BLOB='440c2feb88d5fd5d262c7338047ecdc5f2a6998a'
SOURCE_URL='https://raw.githubusercontent.com/LibreOffice/core/92c170f11d44857d8e365f2e29fb449dfb567ff5/sc/qa/unit/data/gnumeric/universal-content.gnumeric'
NS={'g':'http://www.gnumeric.org/v10.dtd','s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
MARKER='GNM30 EDIT'

def address(column,row):
    column+=1; result=''
    while column: column,digit=divmod(column-1,26); result=chr(65+digit)+result
    return result+str(row+1)

def expression(text):
    tree=ast.parse(text.lstrip('='),mode='eval')
    allowed=(ast.Expression,ast.BinOp,ast.Add,ast.Sub,ast.Mult,ast.Constant,ast.Name,ast.Load)
    for node in ast.walk(tree):
        assert isinstance(node,allowed),'Only the pinned simple numeric expressions belong in this oracle'
        if isinstance(node,ast.Constant): assert type(node.value) in (int,float)
        if isinstance(node,ast.Name): assert re.fullmatch('[A-Z]+[1-9][0-9]*',node.id)
    return tree

def calculate(text,lookup):
    def visit(node):
        if isinstance(node,ast.Expression): return visit(node.body)
        if isinstance(node,ast.Constant): return Decimal(str(node.value))
        if isinstance(node,ast.Name): return lookup(node.id)
        left,right=visit(node.left),visit(node.right)
        if isinstance(node.op,ast.Add): return left+right
        if isinstance(node.op,ast.Sub): return left-right
        return left*right
    return visit(expression(text))

def source_contents(data):
    assert len(data)==2062 and hashlib.sha256(data).hexdigest()==SOURCE_SHA
    assert hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()==SOURCE_BLOB
    xml=gzip.decompress(data) if data.startswith(b'\x1f\x8b') else data
    assert len(xml)<1000000
    root=ET.fromstring(xml); assert root.tag=='{'+NS['g']+'}Workbook'
    result=[]
    for sheet in root.findall('g:Sheets/g:Sheet',NS):
        cells={}
        for cell in sheet.findall('g:Cells/g:Cell',NS):
            where=address(int(cell.attrib['Col']),int(cell.attrib['Row']))
            assert where not in cells
            text=cell.text or ''; kind=cell.attrib.get('ValueType')
            if kind=='40': cells[where]=dict(kind='number',value=float(Decimal(text)))
            elif kind=='60': cells[where]=dict(kind='string',value=text)
            else: assert text.startswith('='); cells[where]=dict(kind='number',formula=text)
        def number(where,active=()):
            assert where not in active,'Circular reference in pinned oracle input'
            value=cells[where]; assert value['kind']=='number'
            if 'value' not in value: value['value']=float(calculate(value['formula'],lambda ref:number(ref,active+(where,))))
            return Decimal(str(value['value']))
        for where,value in cells.items():
            if value['kind']=='number': number(where)
        result.append(dict(name=sheet.findtext('g:Name',namespaces=NS),cells=cells))
    assert [s['name'] for s in result]==['Sheet1','Sheet2']
    assert len(result[0]['cells'])==8 and result[1]['cells']=={}
    assert result[0]['cells']['C4']['value']==11 and result[0]['cells']['B2']['value']=='String2'
    return result

def workbook_contents(data):
    assert len(data)<20*1024*1024
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries=archive.infolist(); names=[e.filename for e in entries]
        assert len(names)==len(set(names)) and len(names)<3000
        assert sum(e.file_size for e in entries)<50*1024*1024
        assert all(not PurePosixPath(n).is_absolute() and '..' not in PurePosixPath(n).parts and '\\' not in n for n in names)
        assert not any('vbaproject' in n.lower() or '/embeddings/' in n.lower() for n in names)
        types=ET.fromstring(archive.read('[Content_Types].xml'))
        assert any(e.attrib.get('PartName')=='/xl/workbook.xml' and e.attrib.get('ContentType')=='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml' for e in types)
        for name in names:
            if name.endswith('.rels'): assert not any(r.attrib.get('TargetMode')=='External' for r in ET.fromstring(archive.read(name)))
        strings=[]
        if 'xl/sharedStrings.xml' in names:
            strings=[''.join(s.itertext()) for s in ET.fromstring(archive.read('xl/sharedStrings.xml'))]
        links={r.attrib['Id']:r.attrib['Target'] for r in ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))}
        sheets=ET.fromstring(archive.read('xl/workbook.xml')).find('s:sheets',NS)
        assert sheets is not None and len(sheets)==2
        result=[]
        for sheet in sheets:
            rel=sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']
            target=links[rel]; path=target.lstrip('/') if target.startswith('/') else 'xl/'+target
            assert '..' not in path.split('/')
            cells={}
            for cell in ET.fromstring(archive.read(path)).findall('.//s:sheetData/s:row/s:c',NS):
                where=cell.attrib['r']; assert where not in cells
                kind=cell.attrib.get('t','n'); raw=cell.findtext('s:v',default='',namespaces=NS)
                if kind=='s': value=dict(kind='string',value=strings[int(raw)])
                elif kind=='inlineStr': value=dict(kind='string',value=''.join(cell.find('s:is',NS).itertext()))
                elif kind=='str': value=dict(kind='string',value=raw)
                elif raw: assert kind=='n'; value=dict(kind='number',value=float(Decimal(raw)))
                else: continue
                formula=cell.findtext('s:f',default=None,namespaces=NS)
                if formula is not None: value['formula']=formula
                cells[where]=value
            result.append(dict(name=sheet.attrib['name'],cells=cells))
        return result

def check(data,expected,marker=False):
    actual=workbook_contents(data)
    assert [s['name'] for s in actual]==[s['name'] for s in expected]
    for source,saved in zip(expected,actual):
        for where,wanted in source['cells'].items():
            found=saved['cells'].get(where)
            assert found and found['kind']==wanted['kind'],f'Missing/wrong type {source["name"]}!{where}'
            assert found['value']==wanted['value'],f'Value changed {source["name"]}!{where}'
            if 'formula' in wanted:
                assert 'formula' in found,f'Formula lost {where}'
                assert ast.dump(expression(found['formula']))==ast.dump(expression(wanted['formula'])),f'Formula changed {where}'
    if marker: assert actual[1]['cells'].get('A1')==dict(kind='string',value=MARKER),'Second-sheet edit marker lost'
    else: assert actual[1]['cells']=={},'Original empty second sheet changed'
    return actual

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,required=True); parser.add_argument('--xlsx',type=Path)
    parser.add_argument('--marker',action='store_true'); parser.add_argument('--report',type=Path,required=True)
    options=parser.parse_args(); original=options.source.read_bytes(); expected=source_contents(original)
    report=dict(status='passed',sourceUrl=SOURCE_URL,sourceSha256=SOURCE_SHA,sourceGitBlob=SOURCE_BLOB,sourceBytes=len(original),
                sheets=expected,expectedCells=8,expectedFormulas=4,scope='Pinned genuine Gnumeric cells, formulas and two sheets; no native/visual/all-variant claim')
    if options.xlsx:
        data=options.xlsx.read_bytes(); check(data,expected,options.marker)
        report.update(xlsxSha256=hashlib.sha256(data).hexdigest(),xlsxBytes=len(data),secondSheetEditChecked=options.marker)
    assert options.source.read_bytes()==original; report['originalUnchanged']=True
    options.report.parent.mkdir(parents=True,exist_ok=True)
    options.report.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')

if __name__=='__main__': main()
