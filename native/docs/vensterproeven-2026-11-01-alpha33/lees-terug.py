"""Lees uitsluitend de vier meegeleverde, werkelijk bewaarde vensterdocumenten."""
from pathlib import Path
from zipfile import ZipFile
from docx import Document
import json,hashlib
p=Path(__file__).resolve().parent
bron=p.parents[1]/'crates/office-core/tests/fixtures/writer-stijlen.docx'
with ZipFile(bron) as z:stijlen=z.read('word/styles.xml')
resultaten=[]
for variant in ['ci','lokaal']:
 map=p/f'hertest-{variant}';r=json.loads((map/'rapport.json').read_text())
 assert r['geslaagd'] and len(r['stappen'])==20
 for naam in ['Bewaarde-alineastijl.docx','Stijl-enter-negen.docx']:
  f=map/naam;d=Document(f)
  assert len(d.sections)==2 and len(d.tables)==1
  assert d.sections[0].header.paragraphs[0].text=='Vaste koptekst'
  assert d.sections[0].footer.paragraphs[0].text=='Vaste voettekst'
  assert d.tables[0].cell(0,0).text=='Cel één\nTweede celalinea' and d.tables[0].cell(0,1).text=='Cel twee'
  if naam.startswith('Bewaarde'):
   a=next(a for a in d.paragraphs if a.text=='Links 🏠 9café rechts')
   assert a.style.style_id=='EigenKop' and a.style.font.name=='Inter' and a.style.font.size.pt==20
   assert any(r.bold for r in a.runs if 'Links' in r.text)
   assert all(r.italic for r in a.runs if 'café rechts' in r.text)
  else:
   i=next(i for i,a in enumerate(d.paragraphs) if a.text=='Links 🏠 café rechts')
   assert [a.text for a in d.paragraphs[i+1:i+3]]==['','9']
   assert all(a.style.style_id=='EigenKop' and a.style.font.name=='Inter' and a.style.font.size.pt==20 for a in d.paragraphs[i+1:i+3])
  with ZipFile(f) as z:assert z.testzip() is None and z.read('word/styles.xml')==stijlen
  resultaten.append({'variant':variant,'bestand':naam,'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'geslaagd':True})
 beelden=list(map.glob('stijl-rustig-*.png'))
 assert len(beelden)==3 and len({f.read_bytes() for f in beelden})==1
print(json.dumps({'broncommit':'b047a17675f790fbb19b08a58bea7d7d300e294e','omvang':'Vier werkelijk bewaarde venster-DOCX onafhankelijk met python-docx/ZipFile gelezen; geen volledige document-, corpus- of pixelgoedkeuring.','alle_vier_geslaagd':True,'rondgangen':resultaten},ensure_ascii=False,indent=2))
