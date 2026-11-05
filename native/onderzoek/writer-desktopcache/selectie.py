"""Controleer echte invoer/selectie/bewaren/verwerpen op de afgewezen kandidaat."""
from pathlib import Path
import json,os,subprocess,time,hashlib
from voorbereiden import REPO,LOKAAL
m=json.loads((LOKAAL/'gebouwd.json').read_text());programma=Path(m['programma']);assert hashlib.sha256(programma.read_bytes()).hexdigest()==m['programma_sha256']
assert json.loads((LOKAAL/'bouwacceptatie.json').read_text())['geslaagd']
uit=LOKAAL/'selectie';assert not uit.exists()
env=os.environ.copy();env['PATH']=str(REPO/'.local/controle-2026-10-31/gui-hulpmiddelen/uitgepakt/usr/bin')+':'+str(Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin')+':'+env['PATH']
script=REPO/'scripts/test-writer-rust-tekst-native.py';cmd=[str(REPO/'.local/doorwerk-2026-11-02/gui-python/bin/python'),str(script),'--programma',str(programma),'--versie','2026.45.50','--uitvoer',str(uit)]
begin=time.monotonic()
with (LOKAAL/'selectie.log').open('w')as log:p=subprocess.run(cmd,cwd=REPO,env=env,stdout=log,stderr=subprocess.STDOUT)
(LOKAAL/'selectie-uitkomst.json').write_text(json.dumps({'code':p.returncode,'seconden':time.monotonic()-begin,'opdracht':cmd,'script_sha256':hashlib.sha256(script.read_bytes()).hexdigest()},indent=2)+'\n')
print(p.returncode,flush=True);raise SystemExit(p.returncode)
