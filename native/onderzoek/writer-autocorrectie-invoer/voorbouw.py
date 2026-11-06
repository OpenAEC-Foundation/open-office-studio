"""Direct bouwen, zonder package-herkoppeling of wijziging van de SDK."""
from pathlib import Path
import subprocess,json
from voorbereiden import UIT,sha
from broncontrole import controleer
bron=UIT/'bron';node=Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node'
controleer()
for cmd in [[str(node),'scripts/kopieer-assets.mjs'],[str(node),'node_modules/typescript/bin/tsc','--noEmit'],[str(node),'node_modules/vite/bin/vite.js','build']]:subprocess.run(cmd,cwd=bron,check=True)
controleer()
bundels=[p for p in (bron/'dist/assets').glob('*.js')if b'wachtOpInvoerrust'in p.read_bytes()]
assert bundels,'De bedoelde autocorrectie ontbreekt in de bundel'
(UIT/'voorbouw.json').write_text(json.dumps({'bundels':{p.name:sha(p)for p in bundels}},indent=2)+'\n')
