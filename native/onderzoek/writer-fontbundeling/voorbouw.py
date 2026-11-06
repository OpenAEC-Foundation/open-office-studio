"""Bouw de exacte eigen frontend zonder package-manager die dependencies herkoppelt."""
from pathlib import Path
import subprocess,json,hashlib
from voorbereiden import REPO,UIT
from broncontrole import controleer
bron=UIT/'bron';node=Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node'
controleer()
for cmd in [[str(node),'scripts/kopieer-assets.mjs'],[str(node),'node_modules/typescript/bin/tsc','--noEmit'],[str(node),'node_modules/vite/bin/vite.js','build']]:
    subprocess.run(cmd,cwd=bron,check=True)
controleer()
bundels=[p for p in (bron/'dist/assets').glob('*.js')if b'openaecHostFont'in p.read_bytes()]
assert bundels,'De bedoelde host-poort ontbreekt in de gebouwde frontend'
(UIT/'voorbouw.json').write_text(json.dumps({'sdk_sha256':hashlib.sha256((bron/'node_modules/@betteroffice/docx-react/dist/index.mjs').read_bytes()).hexdigest(),'bundels':{p.name:hashlib.sha256(p.read_bytes()).hexdigest()for p in bundels}},indent=2)+'\n')
print('Exacte host-poort in frontend bevestigd:',*[p.name for p in bundels],flush=True)
