"""Maak uitsluitend een eigen minimale opmaakvariant voor een volgende kerncontrole."""
from pathlib import Path
import json,zipfile,hashlib,subprocess
r=Path.cwd();w=r/'.local/controle-2026-10-31';bron=r/'native/crates/office-core/tests/fixtures/writer-structuur.docx';doel=w/'writer-kleinkapitalen-eigen.docx';assert not doel.exists()
with zipfile.ZipFile(bron) as z,zipfile.ZipFile(doel,'w',compression=zipfile.ZIP_DEFLATED) as uit:
 for n in z.namelist():
  b=z.read(n)
  if n=='word/document.xml':
   assert b.count(b'<w:rPr>')>0;b=b.replace(b'<w:rPr>',b'<w:rPr><w:smallCaps/>',1)
  uit.writestr(n,b)
p=w/'native-alpha34-vast-lokaal/controleer-bestand';m=json.loads((p.parent/'herkomst.json').read_text());assert hashlib.sha256(p.read_bytes()).hexdigest()==m['programmas'][p.name]['sha256']
a=subprocess.run(['prlimit','--as=3221225472','--core=0','--',str(p),str(doel)],capture_output=True,text=True,timeout=30)
(w/'native-na-alpha36-kleinkapitalen-voor.log').write_text(a.stdout+a.stderr)
(w/'native-na-alpha36-kleinkapitalen-voor.json').write_text(json.dumps({'programma_sha256':m['programmas'][p.name]['sha256'],'broncommit':m['broncommit'],'fixture_sha256':hashlib.sha256(doel.read_bytes()).hexdigest(),'eigen_basissjabloon_sha256':hashlib.sha256(bron.read_bytes()).hexdigest(),'afsluitcode':a.returncode,'omvang':'Eigen synthetische kleine-kapitalenvariant op de oudere vastgelegde release; geen alpha36- of volledige corpusgoedkeuring.'},ensure_ascii=False,indent=2)+'\n');print(a.stdout[:2000],a.stderr[:500])
