"""Bounded legacy SXW source projection; fields are never ordinary live data.

No Office, external DTD, database, scripting, network or product reader runs.
"""
import hashlib
import io
from pathlib import PurePosixPath
import stat
import zipfile
from xml.etree import ElementTree as E

O='{http://openoffice.org/2000/office}'
T='{http://openoffice.org/2000/text}'
S='{http://openoffice.org/2000/style}'
F='{http://www.w3.org/1999/XSL/Format}'
M='{http://openoffice.org/2001/manifest}'
META='{http://openoffice.org/2000/meta}'


def sha(b):return hashlib.sha256(b).hexdigest()


def xml(b):
    assert len(b)<100_000 and b'<!ENTITY' not in b.upper()
    known=[f'<!DOCTYPE office:{name} PUBLIC "-//OpenOffice.org//DTD OfficeDocument 1.0//EN" "office.dtd">'.encode()
           for name in ['document-content','document-styles','document-meta','document-settings']]
    known.append(b'<!DOCTYPE manifest:manifest PUBLIC "-//OpenOffice.org//DTD Manifest 1.0//EN" "Manifest.dtd">')
    for decl in known:
        assert b.count(decl)<=1
        b=b.replace(decl,b'')
    assert b'<!DOCTYPE' not in b.upper()
    return E.fromstring(b)  # Known external declarations removed; no entity resolver.


def native(data):
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        names=z.namelist()
        assert set(names)=={'mimetype','content.xml','styles.xml','meta.xml','settings.xml','META-INF/manifest.xml'}
        assert len(names)==len(set(names))==6
        assert sum(x.file_size for x in z.infolist())<100_000
        for x in z.infolist():
            p=PurePosixPath(x.filename)
            assert not p.is_absolute() and '..' not in p.parts and not stat.S_ISLNK(x.external_attr>>16)
        assert z.testzip() is None
        assert names[0]=='mimetype' and z.getinfo('mimetype').compress_type==0
        assert z.read('mimetype')==b'application/vnd.sun.xml.writer'
        members=[{'name':x.filename,'bytes':x.file_size,'compressedBytes':x.compress_size,'crc32':f'{x.CRC:08x}','sha256':sha(z.read(x))} for x in z.infolist()]
        content=xml(z.read('content.xml'));styles=xml(z.read('styles.xml'));meta=xml(z.read('meta.xml'));manifest=xml(z.read('META-INF/manifest.xml'))
    assert content.tag==O+'document-content' and content.get(O+'version')=='1.0' and content.get(O+'class')=='text'
    assert manifest.tag==M+'manifest'
    roots=[e for e in manifest if e.get(M+'full-path')=='/']
    assert len(roots)==1 and roots[0].get(M+'media-type')=='application/vnd.sun.xml.writer'
    body=content.find(O+'body');assert body is not None
    assert [e.tag for e in body]==[T+'sequence-decls']+[T+'p']*4
    paras=[];fields=[]
    for i,p in enumerate(body.findall(T+'p')):
        assert p.get(T+'style-name')=='Standard'
        tokens=[];cached=p.text or ''
        if p.text:tokens.append({'type':'literal','text':p.text})
        for child in p:
            assert len(child)==0
            if child.tag==T+'database-display':
                f={'type':'database-display','paragraph':i,'database':child.get(T+'database-name'),
                   'table':child.get(T+'table-name'),'tableType':child.get(T+'table-type'),
                   'column':child.get(T+'column-name'),'cachedDisplay':child.text or ''}
                fields.append(f);tokens.append(f);cached+=f['cachedDisplay']
            else:
                assert child.tag==T+'s' and child.text is None
                n=int(child.get(T+'c','1'));assert 1<=n<=16
                tokens.append({'type':'explicit-space','count':n});cached+=' '*n
            if child.tail:
                assert child.tail==' '
                tokens.append({'type':'literal','text':child.tail});cached+=child.tail
        paras.append({'index':i,'style':'Standard','tokens':tokens,'cachedDisplayText':cached})
    assert [p['cachedDisplayText'] for p in paras]==['','Test','<Identifier>  <Address>  <Author>','']
    assert [(f['database'],f['table'],f['tableType'],f['column']) for f in fields]==[('Bibliography','biblio','table',c) for c in ['Identifier','Address','Author']]
    standard=styles.find(O+'styles/'+S+"style[@"+S+"name='Standard']")
    assert standard is not None and standard.get(S+'family')=='paragraph' and standard.get(S+'parent-style-name') is None
    default=styles.find(O+'styles/'+S+"default-style[@"+S+"family='paragraph']/"+S+'properties')
    font=default.get(S+'font-name');size=default.get(F+'font-size')
    assert font=='Thorndale' and size=='12pt'
    header=styles.find(O+'master-styles/'+S+'master-page/'+S+'header/'+T+'p')
    assert header is not None
    return {'format':'legacy OpenOffice.org XML Writer1.0, not ODF','members':members,
            'mainBodyParagraphs':paras,'databaseFields':fields,
            'ordinaryLiteralParagraph':{'index':1,'text':'Test'},
            'styleSourceInventory':{'paragraphStyle':'Standard','parent':None,'inheritedDefaultFontName':font,'inheritedDefaultSize':size,'fontAvailabilityOrRenderingAccepted':False},
            'headerFieldInventory':[{'element':e.tag,'cachedValue':e.text,'attributes':e.attrib} for e in header],
            'generatorSelfReport':meta.find(O+'meta/'+META+'generator').text,
            'producerAuthenticated':False,
            'expectedCachedDisplayOnly':[p['cachedDisplayText'] for p in paras],
            'expectedMergeFieldColumns':[f['column'] for f in fields],
            'databaseConnectionOrLiveFieldSemanticsTested':False,'fullFormatAccepted':False}
