"""Source-first legacy Sun XML and independently observed OOXML preservation."""
import argparse
from collections import Counter
from decimal import Decimal
import hashlib
import io
import json
from pathlib import Path
import posixpath
import re
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from PIL import Image

BASE=Path(__file__).resolve().parent
CONFIG=json.loads((BASE/'fixture.json').read_bytes())
T='{http://openoffice.org/2000/table}';D='{http://openoffice.org/2000/drawing}';O='{http://openoffice.org/2000/office}'
X='{http://openoffice.org/2000/text}';F='{http://openoffice.org/2000/form}';SVG='{http://www.w3.org/2000/svg}'
XLINK='{http://www.w3.org/1999/xlink}';S='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
A='{http://schemas.openxmlformats.org/drawingml/2006/main}';DR='{http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing}'
R='{http://schemas.openxmlformats.org/officeDocument/2006/relationships}';VX='{urn:schemas-microsoft-com:office:excel}'
short=lambda name:name.rsplit('}',1)[-1]
sha=lambda data:hashlib.sha256(data).hexdigest()
def address(row,col):
    chars=''
    while col>=0:col,n=divmod(col,26);chars=chr(65+n)+chars;col-=1
    return chars+str(row+1)
def pixel(data):
    with Image.open(io.BytesIO(data)) as image:
        assert getattr(image,'n_frames',1)==1
        rgba=image.convert('RGBA')
        return dict(width=rgba.width,height=rgba.height,rgbaSha256=sha(rgba.tobytes()))
def cm(value):
    assert value.endswith('cm'),value
    return int(Decimal(value[:-2])*360000)
def fetch(url,path,expected):
    path=Path(path)
    if not path.exists():
        with urllib.request.urlopen(url,timeout=45) as response:data=response.read(2_000_000)
        path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
    assert sha(path.read_bytes())==expected,path
def read_source(path):
    data=Path(path).read_bytes();cfg=CONFIG['source']
    assert len(data)==cfg['bytes'] and sha(data)==cfg['sha256']
    assert hashlib.sha1(f'blob {len(data)}\0'.encode()+data).hexdigest()==cfg['gitBlob']
    with zipfile.ZipFile(path) as z:
        names=z.namelist();assert len(names)==len(set(names))==7
        assert z.read('mimetype')==b'application/vnd.sun.xml.calc'
        assert not any('basic/' in n.lower() or 'scripts/' in n.lower() for n in names)
        doc=ET.fromstring(z.read('content.xml'));assert doc.tag==O+'document-content' and doc.get(O+'version')=='1.0'
        assert not any('event-listener' in short(e.tag) for e in doc.iter())
        controls={}
        for e in doc.iter(F+'control'):
            subtype=next((c for c in e if c.tag in (F+'button',F+'radio',F+'checkbox',F+'text')),None);assert subtype is not None
            controls[e.get(F+'id')]=dict(name=e.get(F+'name'),kind=short(subtype.tag),label=subtype.get(F+'label',''),service=e.get(F+'service-name'))
        def drawing(e,cell):
            kind=short(e.tag);attrs={short(k):v for k,v in e.attrib.items()}
            item=dict(kind=kind,anchorCell=cell,attributes=attrs)
            if kind=='g':item['children']=[drawing(c,cell) for c in e if c.tag.startswith(D)]
            elif kind=='control':item['control']=controls[e.get(F+'id')]
            elif kind=='line':
                item['sizeEmu']=[abs(cm(e.get(SVG+'x2'))-cm(e.get(SVG+'x1'))),abs(cm(e.get(SVG+'y2'))-cm(e.get(SVG+'y1')))];item['preset']='line'
            else:
                item['sizeEmu']=[cm(e.get(SVG+'width')),cm(e.get(SVG+'height'))]
                if kind=='image':
                    href=e.get(XLINK+'href').lstrip('#');assert href in names
                    image=z.read(href);item['image']=dict(part=href,sha256=sha(image),**pixel(image))
                else:item['preset']='chord' if kind=='ellipse' and e.get(D+'kind')=='cut' else kind
            return item
        sheets=[]
        for table in doc.iter(T+'table'):
            cells={};notes=[];drawings=[];row_index=0
            for row in table.iter(T+'table-row'):
                repeat_rows=int(row.get(T+'number-rows-repeated','1'));col_index=0
                for cell in row:
                    if cell.tag not in (T+'table-cell',T+'covered-table-cell'):continue
                    repeat_cols=int(cell.get(T+'number-columns-repeated','1'))
                    direct='\n'.join(''.join(p.itertext()) for p in cell.findall(X+'p'))
                    value=cell.get(T+'value');formula=cell.get(T+'formula')
                    if direct or value is not None or formula is not None:
                        assert repeat_rows*repeat_cols<10000
                        for dr in range(repeat_rows):
                            for dc in range(repeat_cols):cells[address(row_index+dr,col_index+dc)]=dict(kind='number' if value is not None else 'text',value=value if value is not None else direct,formula=formula)
                    note=cell.find(O+'annotation')
                    if note is not None:notes.append(dict(cell=address(row_index,col_index),text='\n'.join(''.join(p.itertext()) for p in note.findall(X+'p')),attributes={short(k):v for k,v in note.attrib.items()}))
                    drawings.extend(drawing(d,address(row_index,col_index)) for d in cell if d.tag.startswith(D))
                    col_index+=repeat_cols
                row_index+=repeat_rows
            sheets.append(dict(name=table.get(T+'name'),cells=cells,annotations=notes,drawings=drawings))
        assert [s['name'] for s in sheets]==['Sheet1','Sheet2','Sheet3']
        assert sheets[0]['cells']=={'C13':dict(kind='text',value='Note attached',formula=None)}
        assert not sheets[1]['cells'] and not sheets[2]['cells']
        assert len(sheets[0]['drawings'])==9 and len(controls)==4
        assert sheets[0]['annotations'][0]['text']=='Just a note'
        return dict(source=cfg,sheets=sheets,sourceCells=1,sourceFormulas=0,parts={n:sha(z.read(n)) for n in names},contract=CONFIG['preservationContractBeforeImport'])
def target(part,ref):
    value=ref.lstrip('/') if ref.startswith('/') else posixpath.normpath(posixpath.join(posixpath.dirname(part),ref))
    assert '..' not in value.split('/');return value
def relationships(z,part):
    rel=posixpath.join(posixpath.dirname(part),'_rels',posixpath.basename(part)+'.rels')
    if rel not in z.namelist():return {}
    result={}
    for e in ET.fromstring(z.read(rel)):
        assert e.get('TargetMode')!='External'
        result[e.get('Id')]=dict(part=target(part,e.get('Target')),type=e.get('Type'))
    return result
def read_xlsx(path):
    with zipfile.ZipFile(path) as z:
        book=ET.fromstring(z.read('xl/workbook.xml'));rels=relationships(z,'xl/workbook.xml')
        strings=[]
        if 'xl/sharedStrings.xml' in z.namelist():strings=[''.join(si.itertext()) for si in ET.fromstring(z.read('xl/sharedStrings.xml'))]
        sheets=[]
        for sheet in book.find(S+'sheets'):
            part=rels[sheet.get(R+'id')]['part'];doc=ET.fromstring(z.read(part));links=relationships(z,part)
            cells={};notes=[];drawings=[];controls=[]
            for cell in doc.iter(S+'c'):
                raw=cell.findtext(S+'v');kind=cell.get('t','n');formula=cell.findtext(S+'f')
                if kind=='s':raw=strings[int(raw)]
                elif kind=='inlineStr':raw=''.join(cell.find(S+'is').itertext())
                if raw is not None or formula is not None:cells[cell.get('r')]=dict(kind=kind,value=raw,formula=formula)
            for rel in links.values():
                if rel['type'].endswith('/comments'):
                    for note in ET.fromstring(z.read(rel['part'])).iter(S+'comment'):notes.append(dict(cell=note.get('ref'),text=''.join(note.find(S+'text').itertext())))
                elif rel['type'].endswith('/vmlDrawing'):
                    for shape in ET.fromstring(z.read(rel['part'])):
                        client=shape.find(VX+'ClientData')
                        if client is not None and client.get('ObjectType')!='Note':controls.append(dict(kind=client.get('ObjectType','').lower(),text=''.join(shape.itertext()),source='VML',attributes=shape.attrib))
            def object_node(node,drawing_part,drawing_links,anchor,group=False):
                tag=short(node.tag);pr=node.find('.//'+A+'prstGeom');geom=pr.get('prst') if pr is not None else 'custom' if node.find('.//'+A+'custGeom') is not None else None
                item=dict(kind=tag,preset=geom,anchor=anchor)
                xfrm=node.find(DR+'spPr/'+A+'xfrm')
                if tag=='grpSp':
                    item['children']=[object_node(c,drawing_part,drawing_links,anchor,True) for c in node if c.tag in (DR+'sp',DR+'cxnSp',DR+'pic',DR+'grpSp')]
                    xfrm=node.find(DR+'grpSpPr/'+A+'xfrm')
                if xfrm is not None:
                    ext=xfrm.find(A+'ext');off=xfrm.find(A+'off')
                    if ext is not None:item['sizeEmu']=[int(ext.get('cx')),int(ext.get('cy'))]
                    if off is not None:item['offsetEmu']=[int(off.get('x')),int(off.get('y'))]
                    item['transform']=xfrm.attrib
                if tag=='pic':
                    blip=node.find('.//'+A+'blip');assert blip is not None
                    imgpart=drawing_links[blip.get(R+'embed')]['part'];image=z.read(imgpart)
                    item['image']=dict(part=imgpart,sha256=sha(image),**pixel(image))
                return item
            for drawing in doc.findall(S+'drawing'):
                drawing_part=links[drawing.get(R+'id')]['part'];drawing_links=relationships(z,drawing_part)
                for anchor in ET.fromstring(z.read(drawing_part)):
                    start=anchor.find(DR+'from');end=anchor.find(DR+'to')
                    info=dict(type=short(anchor.tag))
                    if start is not None:info['cell']=address(int(start.findtext(DR+'row')),int(start.findtext(DR+'col')));info['from']={short(c.tag):c.text for c in start}
                    if end is not None:info['to']={short(c.tag):c.text for c in end}
                    for node in anchor:
                        if node.tag in (DR+'sp',DR+'cxnSp',DR+'pic',DR+'grpSp'):drawings.append(object_node(node,drawing_part,drawing_links,info))
            sheets.append(dict(name=sheet.get('name'),cells=cells,annotations=notes,drawings=drawings,controls=controls,
                               worksheetControlCount=len(doc.findall(S+'controls/'+S+'control'))))
        return dict(sheets=sheets,parts={n:sha(z.read(n)) for n in z.namelist()})
def cell_check(source,actual,edited):
    assert [s['name'] for s in actual['sheets']]==[s['name'] for s in source['sheets']]
    for original,output in zip(source['sheets'],actual['sheets']):
        expected=dict(original['cells'])
        if edited and original['name']=='Sheet1':
            cfg=CONFIG['edit'];expected[cfg['textCell']]=dict(kind='text',value=cfg['text'],formula=None)
            expected[cfg['formulaCell']]=dict(kind='number',value=str(cfg['result']),formula=cfg['formula'].lstrip('='))
        assert set(output['cells'])==set(expected),(original['name'],'populated cells',set(output['cells'])^set(expected))
        for a,want in expected.items():
            got=output['cells'][a];assert got['formula']==want['formula'],(a,'formula',got)
            if want['kind']=='text':assert got['kind'] in ('s','inlineStr','str') and got['value']==want['value'],(a,got)
            else:assert got['kind']=='n' and Decimal(got['value'])==Decimal(want['value']),(a,got)
    return dict(passed=True,sourceCells=1,sourceFormulas=0,addedCells=2 if edited else 0,addedFormulas=1 if edited else 0)
def preservation(source,actual):
    diffs=[];before=source['sheets'][0];after=actual['sheets'][0]
    def require(ok,category,expected,observed):
        if not ok:diffs.append(dict(category=category,expected=expected,observed=observed))
    expected_notes=[dict(cell=n['cell'],text=n['text']) for n in before['annotations']]
    require(after['annotations']==expected_notes,'annotations',expected_notes,after['annotations'])
    def flatten(objects,key):
        for item in objects:
            yield item
            yield from flatten(item.get(key,[]),key)
    original=list(flatten(before['drawings'],'children'));output=list(flatten(after['drawings'],'children'))
    vectors=[s for s in original if 'preset' in s];observed=[s for s in output if s['kind'] in ('sp','cxnSp')]
    a=Counter(s['preset'] for s in vectors);b=Counter(s['preset'] for s in observed)
    require(a==b,'vector-preset-counts',dict(a),dict(b))
    original_groups=[s for s in original if s['kind']=='g'];groups=[s for s in output if s['kind']=='grpSp']
    require([len(s['children']) for s in original_groups]==[len(s['children']) for s in groups],'group-child-counts',[len(s['children']) for s in original_groups],[len(s['children']) for s in groups])
    remaining=list(observed)
    for wanted in vectors:
        candidates=[s for s in remaining if s['preset']==wanted['preset'] and 'sizeEmu' in s and max(abs(a-b) for a,b in zip(s['sizeEmu'],wanted['sizeEmu']))<=360]
        require(bool(candidates),'vector-size-within-0.001cm',dict(preset=wanted['preset'],sizeEmu=wanted['sizeEmu']),[dict(preset=s['preset'],sizeEmu=s.get('sizeEmu')) for s in remaining])
        if candidates:remaining.remove(candidates[0])
    for wanted in [s for s in before['drawings'] if s['kind'] in ('rect','ellipse','image')]:
        kind='pic' if wanted['kind']=='image' else 'sp'
        candidates=[s for s in after['drawings'] if s['kind']==kind and (kind=='pic' or s['preset']==wanted['preset'])]
        require(any(s['anchor'].get('cell')==wanted['anchorCell'] for s in candidates),'top-level-start-cell',dict(kind=wanted['kind'],cell=wanted['anchorCell']),[s['anchor'] for s in candidates])
    images=[s['image'] for s in original if 'image' in s];pics=[s['image'] for s in output if 'image' in s]
    expected_pixels=[{k:i[k] for k in ('width','height','rgbaSha256')} for i in images];actual_pixels=[{k:i[k] for k in ('width','height','rgbaSha256')} for i in pics]
    require(expected_pixels==actual_pixels,'embedded-bitmap-decoded-pixels',expected_pixels,actual_pixels)
    kinds={'button':'button','radio':'radio','checkbox':'checkbox','text':'edit'}
    expected_controls=[s['control'] for s in original if 'control' in s]
    wanted=Counter(kinds[c['kind']] for c in expected_controls);got=Counter(c['kind'] for c in after['controls'])
    require(wanted==got,'form-control-kind-counts',dict(wanted),dict(got))
    for c in expected_controls:
        if c['label']:require(any(c['label'] in o['text'] for o in after['controls']),'form-control-label',c['label'],[o['text'] for o in after['controls']])
    return dict(passed=not diffs,differences=diffs,scope=CONFIG['preservationContractBeforeImport'],observedDrawings=after['drawings'],observedControls=after['controls'])
def audit(source_path,xlsx,edited):
    source=read_source(source_path);actual=read_xlsx(xlsx)
    return dict(file=str(xlsx),sha256=sha(Path(xlsx).read_bytes()),sourceSha256=CONFIG['source']['sha256'],
                cells=cell_check(source,actual,edited),preservation=preservation(source,actual),observed=actual)
def main():
    p=argparse.ArgumentParser();p.add_argument('mode',choices=['source','audit']);p.add_argument('--source',required=True);p.add_argument('--out',required=True);p.add_argument('--xlsx');p.add_argument('--edited',action='store_true');args=p.parse_args();out=Path(args.out);out.mkdir(parents=True,exist_ok=True)
    if args.mode=='source':
        fetch(CONFIG['source']['url'],args.source,CONFIG['source']['sha256'])
        for name,digest in CONFIG['licenses'].items():fetch(f"https://raw.githubusercontent.com/LibreOffice/core/{CONFIG['source']['revision']}/{name}",out/('upstream-'+name),digest)
        report=read_source(args.source);target_path=out/'source-oracle.json'
    else:report=audit(args.source,args.xlsx,args.edited);target_path=out/(Path(args.xlsx).stem+'-oracle.json')
    target_path.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(dict(mode=args.mode,report=str(target_path),cellsPassed=report.get('cells',{}).get('passed'),preservationPassed=report.get('preservation',{}).get('passed'),differences=len(report.get('preservation',{}).get('differences',[])))))
if __name__=='__main__':main()
