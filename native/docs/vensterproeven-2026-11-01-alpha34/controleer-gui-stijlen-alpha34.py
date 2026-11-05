"""Lees bewaarde stijlvensterdocumenten onafhankelijk van de Rust-engine."""
from pathlib import Path
from zipfile import ZipFile
from docx import Document
import json,hashlib,sys
r=Path.cwd();w=r/'.local/controle-2026-10-31';variant=sys.argv[1];assert variant in ['ci','lokaal'];map=w/f'gui-alpha34-writer-stijlen-hulpgherstel-{variant}'
v=json.loads((map/'rapport.json').read_text());assert v['geslaagd'] and len(v['stappen'])==20
with ZipFile(r/'native/crates/office-core/tests/fixtures/writer-stijlen.docx') as z:stijlen=z.read('word/styles.xml')
resultaten=[]
for naam,tekst in [('Bewaarde-alineastijl.docx','Links 🏠 9café rechts'),('Stijl-enter-negen.docx','9')]:
 p=map/naam;d=Document(p)
 assert len(d.sections)==2 and len(d.tables)==1
 assert d.sections[0].header.paragraphs[0].text=='Vaste koptekst'
 assert d.sections[0].footer.paragraphs[0].text=='Vaste voettekst'
 assert d.tables[0].cell(0,0).text=='Cel één\nTweede celalinea' and d.tables[0].cell(0,1).text=='Cel twee'
 a=next(a for a in d.paragraphs if a.text==tekst);assert a.style.style_id=='EigenKop'
 assert a.style.font.name=='Inter' and a.style.font.size.pt==20
 rijk=next(a for a in d.paragraphs if a.text.startswith('Links 🏠 '))
 assert any(run.bold for run in rijk.runs if 'Links' in run.text)
 assert all(run.italic for run in rijk.runs if 'café rechts' in run.text)
 with ZipFile(p) as z:assert z.read('word/styles.xml')==stijlen
 resultaten.append({'bestand':naam,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'stijl_Inter20_directe_runs_secties_tabel_kop_voet_bronstyles':True})
beelden=[map/f'stijl-rustig-{i}.png' for i in range(1,4)];assert beelden[0].read_bytes()==beelden[1].read_bytes()==beelden[2].read_bytes()
uit={'geslaagd':True,'broncommit':v['broncommit'],'programma_sha256':v['programma_sha256'],'bestanden':resultaten,'drie_rustige_beelden_bytegelijk':True,'beeld_sha256':hashlib.sha256(beelden[0].read_bytes()).hexdigest()}
(map/'onafhankelijk.json').write_text(json.dumps(uit,ensure_ascii=False,indent=2)+'\n');print(json.dumps(uit,ensure_ascii=False,indent=2))
