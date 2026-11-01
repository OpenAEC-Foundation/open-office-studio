"""Controleer inhoud onafhankelijk en benoem de aanvullende XML-byteafwijking."""
from pathlib import Path
from docx import Document
from zipfile import ZipFile
import hashlib,json,xml.etree.ElementTree as ET,io
r=Path.cwd();w=r/'.local/controle-2026-10-31';p=w/'gui-alpha36-writer-lokaal/Bewaarde-invoegopmaak.docx';oud=r/'native/crates/office-core/tests/fixtures/writer-structuur.docx';d=Document(p)
negen=[a for a in d.paragraphs if a.text=='9'];assert len(negen)==1 and all(v.bold and v.italic for v in negen[0].runs if v.text);assert len(d.tables)==1 and len(d.sections)==2
assert 'Links 🏠 café rechts' in [a.text for a in d.paragraphs]
assert d.tables[0].cell(0,0).text=='Cel één\nTweede celalinea' and d.tables[0].cell(0,1).text=='Cel twee'
assert d.sections[0].header.paragraphs[0].text=='Vaste koptekst' and d.sections[0].footer.paragraphs[0].text=='Vaste voettekst'
wrappers=[];bewaard=[]
with ZipFile(oud) as a,ZipFile(p) as b:
 assert set(a.namelist())==set(b.namelist())
 for n in a.namelist():
  if n=='word/document.xml':continue
  aa=a.read(n);bb=b.read(n)
  if n not in ['word/header1.xml','word/footer1.xml']:
   assert aa==bb,n;bewaard.append(n);continue
  wortel='w:hdr' if 'header' in n else 'w:ftr'
  def binnen(tekst):
   begin=tekst.index(('<'+wortel).encode());begin=tekst.index(b'>',begin)+1;eind=tekst.rindex(('</'+wortel+'>').encode());return tekst[begin:eind]
  assert binnen(aa)==binnen(bb),n
  ra=ET.fromstring(aa);rb=ET.fromstring(bb);assert ra.tag==rb.tag
  sleutel='{http://schemas.openxmlformats.org/markup-compatibility/2006}Ignorable'
  av=dict(ra.attrib);bv=dict(rb.attrib);oud_negeren=set(av.pop(sleutel,'').split());nieuw_negeren=set(bv.pop(sleutel,'').split());assert av==bv and oud_negeren<=nieuw_negeren
  na=dict(v for _,v in ET.iterparse(io.BytesIO(aa),events=['start-ns']));nb=dict(v for _,v in ET.iterparse(io.BytesIO(bb),events=['start-ns']));assert all(nb[k]==v for k,v in na.items());assert nieuw_negeren<=set(nb)
  wrappers.append({'deel':n,'bytegelijk':aa==bb,'alle_binnen_xml_bytegelijk':True,'oorspronkelijke_naamruimtebetekenissen_behouden':True,'toegevoegde_naamruimteprefixen':sorted(set(nb)-set(na)),'toegevoegde_ignorable_prefixen':sorted(nieuw_negeren-oud_negeren)})
rapport={'inhoudscontrole_geslaagd':True,'alle_zipdelen_buiten_document_xml_bytegelijk':False,'omvang':'Onafhankelijke inhoudscontrole; de extra volledige ZIP-byte-eis blijft afgekeurd. Kop-/voettekstwrappers zijn herschreven, hun volledige binnen-XML blijft bytegelijk en de overige ZIP-delen blijven bytegelijk. Geen volledige fidelity- of suitegoedkeuring.','broncommit':'9deec078c7080549f3e6900685ba8357ad3d1547','onafhankelijke_lezers':['python-docx','zipfile','ElementTree'],'bestand':p.relative_to(r).as_posix(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'negen_vet_cursief':True,'rijke_alinea_tabel_twee_secties_kop_en_voet_behouden':True,'bytegelijke_andere_zipdelen':bewaard,'wrappers':wrappers}
(w/'native-alpha36-writer-lokaal-onafhankelijk.json').write_text(json.dumps(rapport,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'inhoudscontrole_geslaagd':True,'extra_zip_byte_eis_geslaagd':False,'wrapperdelen':[v['deel'] for v in wrappers]},ensure_ascii=False))
