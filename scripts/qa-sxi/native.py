"""Independent source-only legacy SXI inventory; no presentation engine.

Only source-defined title order, two small text shapes, page size and one raw
image relationship are eligible for historical snapshot comparison.
"""
import collections
from decimal import Decimal
import hashlib
import io
import json
from pathlib import PurePosixPath
import re
import stat
import struct
import zipfile
from xml.etree import ElementTree as E

O='{http://openoffice.org/2000/office}'
D='{http://openoffice.org/2000/drawing}'
T='{http://openoffice.org/2000/text}'
S='{http://openoffice.org/2000/style}'
P='{http://openoffice.org/2000/presentation}'
V='{http://www.w3.org/2000/svg}'
F='{http://www.w3.org/1999/XSL/Format}'
X='{http://www.w3.org/1999/xlink}'
M='{http://openoffice.org/2001/manifest}'

def sha(b):return hashlib.sha256(b).hexdigest()
def vector_sha(v):return sha(json.dumps(v,ensure_ascii=False,separators=(',',':')).encode('utf8'))

def xml(b):
    assert len(b)<1_000_000 and b'<!ENTITY' not in b.upper()
    for name in ['document-content','document-styles','document-meta','document-settings']:
        b=b.replace(f'<!DOCTYPE office:{name} PUBLIC "-//OpenOffice.org//DTD OfficeDocument 1.0//EN" "office.dtd">'.encode(),b'')
    b=b.replace(b'<!DOCTYPE manifest:manifest PUBLIC "-//OpenOffice.org//DTD Manifest 1.0//EN" "Manifest.dtd">',b'')
    assert b'<!DOCTYPE' not in b.upper()
    return E.fromstring(b)

def text(e):
    # Only this fixture's selected plain inline structures are decoded. No
    # arbitrary itertext() acceptance of page fields, notes or hidden metadata.
    pieces=[e.text or '']
    for c in e:
        if c.tag in (T+'span',T+'a'):pieces.append(text(c))
        elif c.tag==T+'s':pieces.append(' '*int(c.get(T+'c','1')))
        elif c.tag==T+'tab-stop':pieces.append('\t')
        elif c.tag==T+'line-break':pieces.append('\n')
        else:raise AssertionError('Unqualified selected inline element: '+c.tag)
        pieces.append(c.tail or '')
    return ''.join(pieces)

def paragraphs(shape):return [text(p) for p in shape.iter() if p.tag in (T+'p',T+'h')]

def cm_emu(s):
    assert re.fullmatch(r'[0-9]+(?:\.[0-9]+)?cm',s)
    n=Decimal(s[:-2])*360000;assert n==int(n);return int(n)

def native(data):
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        names=z.namelist();assert len(names)==len(set(names))==11
        assert sum(x.file_size for x in z.infolist())<1_000_000
        for x in z.infolist():
            p=PurePosixPath(x.filename);assert not p.is_absolute() and '..' not in p.parts and not stat.S_ISLNK(x.external_attr>>16)
        assert z.testzip() is None
        assert names[0]=='mimetype' and z.getinfo('mimetype').compress_type==0
        assert z.read('mimetype')==b'application/vnd.sun.xml.impress'
        members=[{'name':x.filename,'bytes':x.file_size,'crc32':f'{x.CRC:08x}','sha256':sha(z.read(x))} for x in z.infolist()]
        content=xml(z.read('content.xml'));styles=xml(z.read('styles.xml'));manifest=xml(z.read('META-INF/manifest.xml'))
        assert content.tag==O+'document-content' and content.get(O+'class')=='presentation' and content.get(O+'version')=='1.0'
        assert any(x.get(M+'full-path')=='/' and x.get(M+'media-type')=='application/vnd.sun.xml.impress' for x in manifest)
        body=content.find(O+'body');pages=body.findall(D+'page')
        settings=[p for p in body if p.tag!=D+'page']
        assert len(pages)==26 and len(settings)==1 and settings[0].tag==P+'settings'
        titles=[];inventory=[];images=[];kinds=collections.Counter()
        for i,page in enumerate(pages):
            shapes=[x for x in page if x.tag.startswith(D)];assert shapes and shapes[0].get(P+'class')=='title'
            title=paragraphs(shapes[0]);titles.append(vector_sha(title));objects=[]
            for j,s in enumerate(shapes):
                kind=s.tag.split('}')[-1];kinds[kind]+=1
                objects.append({'index':j,'kind':kind,'name':s.get(D+'name'),'id':s.get(D+'id'),
                                'presentationClass':s.get(P+'class'),'drawStyle':s.get(D+'style-name'),'presentationStyle':s.get(P+'style-name'),
                                'rawGeometry':{k:s.get(V+k) for k in ['x','y','width','height']},
                                'logicalXmlSerializationSha256':sha(E.tostring(s))})
                if s.tag==D+'image':
                    href=s.get(X+'href');assert href.startswith('#Pictures/')
                    path=href[1:];b=z.read(path)
                    images.append({'slide':i,'object':j,'href':href,'packagePath':path,'sha256':sha(b),'bytes':len(b)})
            notes=page.find(P+'notes')
            inventory.append({'index':i,'name':page.get(D+'name'),'nativeId':page.get(D+'id'),'master':page.get(D+'master-page-name'),
                              'titleParagraphSha256':titles[-1],'objects':objects,'notesPresent':notes is not None,
                              'notesLogicalXmlSha256':sha(E.tostring(notes)) if notes is not None else None})
        assert kinds=={'text-box':28,'rect':64,'image':1} and len(images)==1 and images[0]['slide']==16
        masters={p.get(S+'name'):p for p in styles.find(O+'master-styles') if p.tag==S+'master-page'}
        masterNames={p.get(D+'master-page-name') for p in pages};assert len(masterNames)==1
        master=masters[next(iter(masterNames))];pm=master.get(S+'page-master-name')
        props=next(p for p in styles.find(O+'automatic-styles') if p.tag==S+'page-master' and p.get(S+'name')==pm).find(S+'properties')
        width,height=props.get(F+'page-width'),props.get(F+'page-height')
        dimensions={'sourceMaster':master.get(S+'name'),'pageMaster':pm,'width':width,'height':height,'cx':cm_emu(width),'cy':cm_emu(height)}
        media=[]
        for name in names:
            if not name.startswith('Pictures/'):continue
            b=z.read(name)
            if b.startswith(b'\x89PNG\r\n\x1a\n'):kind='png';dims=struct.unpack('>II',b[16:24])
            else:assert b[:6] in (b'GIF87a',b'GIF89a');kind='gif';dims=struct.unpack('<HH',b[6:10])
            media.append({'path':name,'kind':kind,'pixelWidth':dims[0],'pixelHeight':dims[1],'bytes':len(b),'sha256':sha(b)})
        assert len(media)==5
        selected=[]
        for i,j in [(0,1),(1,1)]:
            shapes=[s for s in pages[i] if s.tag.startswith(D)]
            selected.append({'slide':i,'shapeOrdinal':j,'paragraphs':paragraphs(shapes[j]),'role':shapes[j].get(P+'class')})
        assert selected[0]['paragraphs']==['Miscellaneous Topics In','Macro Programming'] and len(selected[1]['paragraphs'])==8
    return {'format':'legacy OpenOffice.org XML Impress1.0','members':members,'slides':inventory,'presentationSettingsInventory':settings[0].attrib,
            'mainDrawingObjectCounts':dict(kinds),'mainDrawingObjectCount':sum(kinds.values()),'packageMedia':media,
            'expected':{'slideCount':26,'orderedTitleParagraphSha256':titles,'selectedTextShapes':selected,'pageSize':dimensions,'mainImages':images},
            'fullFormatAccepted':False,'limits':'Source inventory is not rendering acceptance. Notes/masters/style/font/layout/animation and other media/embedded-object semantics are unaccepted.'}
