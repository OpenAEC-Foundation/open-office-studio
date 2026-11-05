"""Bouw uitsluitend de samenvoegkopie in een afzonderlijke Cargo-targetmap."""
from pathlib import Path
import os
import subprocess
import json
import hashlib
import shutil
import time
from voorbereiden import bereid, ROOT, LOKAAL, BASIS_ELF

bereid()
env = os.environ.copy()
env['PATH'] = str(Path.home()/'.cargo/bin')+':'+env['PATH']
env['CARGO_TARGET_DIR'] = str(LOKAAL/'target')
begin = time.monotonic()
with (LOKAAL/'bouw.log').open('w') as log:
    p = subprocess.run(['cargo', 'build', '--release', '--locked', '--manifest-path', str(LOKAAL/'gemeten/Cargo.toml')], env=env, stdout=log, stderr=subprocess.STDOUT)
r = {'code':p.returncode, 'seconden':time.monotonic()-begin}
if p.returncode == 0:
    doel = LOKAAL/'gemeten/office-writer-invoerprofiel'
    shutil.copy2(LOKAAL/'target/release/office-writer-invoerprofiel', doel)
    r['programma_sha256'] = hashlib.sha256(doel.read_bytes()).hexdigest()
    assert r['programma_sha256'] != BASIS_ELF, 'Samenvoeging gaf dezelfde binary als de basis'
(LOKAAL/'bouwuitkomst.json').write_text(json.dumps(r, indent=2)+'\n')
print(json.dumps(r), flush=True)
raise SystemExit(p.returncode)
