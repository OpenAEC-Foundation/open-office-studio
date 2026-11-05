"""Test het vaste native corpus met één proces en zonder kerndumps."""
from pathlib import Path
import json,hashlib,subprocess,resource,sys
r=Path.cwd();w=r/'.local/controle-2026-10-31';vast=w/'native-alpha36-ci-linux-vast';m=json.loads((vast/'herkomst.json').read_text());exe=vast/'controleer-bestand'
with exe.open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==m['programmas'][exe.name]['sha256']
assert subprocess.check_output([str(exe),'--version'],text=True).strip()=='Open Office native bestandscontrole 2026.44.9-alpha.36 (release)'
raw=w/'native-alpha36-corpus-ci-ruw.json';assert not raw.exists();script=w/'bron-alpha36-ci-controle/native/scripts/corpus.py'
def grenzen():resource.setrlimit(resource.RLIMIT_CORE,(0,0))
with (w/'native-alpha36-corpus-ci.log').open('x') as log:
 p=subprocess.run([sys.executable,str(script),'--programma',str(exe),'--manifest',str(r/'.local/corpus/manifest.json'),'--bronmap',str(r),'--uitvoer',str(raw),'--processen','1','--seconden','30'],stdout=log,stderr=subprocess.STDOUT,preexec_fn=grenzen)
assert p.returncode in [0,1]
d=json.loads(raw.read_text());assert d['afgerond']==d['geselecteerd']==648 and d['manifest_totaal']==1566
(w/'native-alpha36-corpus-ci.json').write_text(json.dumps({'broncommit':m['broncommit'],'ci_ronde':m['ci_ronde'],'ruw_rapport_sha256':hashlib.sha256(raw.read_bytes()).hexdigest(),'runner_sha256':hashlib.sha256(script.read_bytes()).hexdigest(),'corpus_afgerond':True,'alle_geselecteerde_rondgangen_geslaagd':d['alle_geselecteerde_rondgangen_geslaagd'],'statussen':d['statussen'],'geselecteerd':d['geselecteerd'],'andere_formaten_buiten_deze_ronde':918,'kerndumps_uitgeschakeld':True,'adresruimte_bytes':d['adresruimte_bytes'],'omvang':d['omvang']},ensure_ascii=False,indent=2)+'\n');print(json.dumps({'afgerond':d['afgerond'],'statussen':d['statussen'],'alle_rondgangen_geslaagd':d['alle_geselecteerde_rondgangen_geslaagd']},ensure_ascii=False),flush=True)
