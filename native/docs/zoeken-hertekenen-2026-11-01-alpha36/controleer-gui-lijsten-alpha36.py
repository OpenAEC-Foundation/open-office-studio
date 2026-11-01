"""Controleer de via het releasevenster gemaakte lijsten met onafhankelijke lezers."""
from pathlib import Path
from zipfile import ZipFile
from docx import Document
import hashlib,json,re,sys,xml.etree.ElementTree as ET
r=Path.cwd();w=r/'.local/controle-2026-10-31';variant=sys.argv[1];assert variant in ['ci','lokaal'];map=w/f'gui-alpha36-writer-lijsten-{variant}'
rapport=json.loads((map/'rapport.json').read_text());assert rapport['geslaagd']
oorspronkelijk=r/'native/crates/office-core/tests/fixtures/writer-structuur.docx'
with ZipFile(oorspronkelijk) as z:oud=z.read('word/numbering.xml')
wml='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
resultaten=[]
for naam,tekst,soort,volgende in [('opsomming-direct.docx','Links 🏠 9café rechts','bullet',None),('nummering-direct.docx','Links 🏠 9café rechts','decimal',None),('nummering-enter-negen.docx','Links 🏠 café rechts','decimal','9'),('nummering-beeindigd.docx','Links 🏠 café rechts','decimal','')]:
 p=map/naam;d=Document(p);assert len(d.sections)==2 and len(d.tables)==1
 assert d.sections[0].header.paragraphs[0].text=='Vaste koptekst'
 assert d.sections[0].footer.paragraphs[0].text=='Vaste voettekst'
 assert d.tables[0].cell(0,0).text=='Cel één\nTweede celalinea'
 assert d.tables[0].cell(0,1).text=='Cel twee'
 gekozen=next(a for a in d.paragraphs if a.text==tekst)
 assert any(run.bold for run in gekozen.runs if 'Links' in run.text)
 assert all(run.italic for run in gekozen.runs if 'café rechts' in run.text)
 num=gekozen._p.find(wml+'pPr/'+wml+'numPr/'+wml+'numId').get(wml+'val');assert int(num)>0
 if volgende is not None:
  alineas=d.paragraphs;i=alineas.index(gekozen) if gekozen in alineas else next(i for i,a in enumerate(alineas) if a.text==tekst)
  tweede=alineas[i+1];assert tweede.text==volgende
  assert tweede._p.find(wml+'pPr/'+wml+'numPr/'+wml+'numId').get(wml+'val')==(num if volgende else '0')
  assert tweede._p.getnext().tag==wml+'tbl'
 with ZipFile(p) as z:
  xml=z.read('word/numbering.xml');root=ET.fromstring(xml)
  instance=next(n for n in root.findall(wml+'num') if n.get(wml+'numId')==num)
  abstract_id=instance.find(wml+'abstractNumId').get(wml+'val')
  abstract=next(a for a in root.findall(wml+'abstractNum') if a.get(wml+'abstractNumId')==abstract_id)
  assert abstract.find(wml+'lvl/'+wml+'numFmt').get(wml+'val')==soort
  over=xml
  for tag,attribuut,id in [('abstractNum','abstractNumId',abstract_id),('num','numId',num)]:
   patroon=rb'(?s)<w:'+tag.encode()+rb'\b[^>]*\bw:'+attribuut.encode()+rb'="'+id.encode()+rb'"[^>]*(?:/>|>.*?</w:'+tag.encode()+rb'>)'
   assert len(re.findall(patroon,over))==1;over=re.sub(patroon,b'',over)
  assert over==oud
 resultaten.append({'bestand':naam,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'nummering_en_oorspronkelijke_xml_behouden':True,'rijke_runs_kop_voet_tabel_secties':True})
beelden=[map/f'lijsten-rustig-{i}.png' for i in range(1,4)]
assert beelden[0].read_bytes()==beelden[1].read_bytes()==beelden[2].read_bytes()
uit={'geslaagd':True,'broncommit':rapport['broncommit'],'programma_sha256':rapport['programma_sha256'],'bestanden':resultaten,'drie_rustige_beelden_bytegelijk':True,'beeld_sha256':hashlib.sha256(beelden[0].read_bytes()).hexdigest()}
(map/'onafhankelijk.json').write_text(json.dumps(uit,ensure_ascii=False,indent=2)+'\n');print(json.dumps(uit,ensure_ascii=False,indent=2))
