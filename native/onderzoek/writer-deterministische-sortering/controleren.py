"""Vergelijk de oorspronkelijke gemeten kern en sorteerkopie in vaste ABBA-volgorde."""
from pathlib import Path
import os
import json
import subprocess
import hashlib
import time
from voorbereiden import bereid, ROOT, REFERENTIE, LOKAAL

bereid()
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
ref = REFERENTIE/'.local/gemeten/office-writer-invoerprofiel'
assert sha(ref) == 'b0f1cbcc76e022dfcd24d362e4d2e5a78955f78de29553ac6edfdc082a9e9d07', 'Andere gemeten referentiebinary'
bouw = json.loads((LOKAAL/'bouwuitkomst.json').read_text())
assert bouw['code'] == 0 and sha(LOKAAL/'gemeten/office-writer-invoerprofiel') == bouw['programma_sha256']
assert bouw['programma_sha256'] not in [sha(ref), sha(LOKAAL/'basis/office-writer-invoerprofiel')]
bron = (LOKAAL/'controleer.mjs').read_text()
anker = "const programma=ROOT+'/.local/'+variant+'/office-writer-invoerprofiel'"
assert bron.count(anker) == 1, 'Ander binarypad in gegevensproef'
controle = LOKAAL/'controleer-referentie.mjs'
controle.write_text(bron.replace(anker, 'const programma=variant===\'gemeten\' ? '+json.dumps(str(ref))+" : ROOT+'/.local/basis/office-writer-invoerprofiel'", 1))
uit = LOKAAL/'vergelijking'; uit.mkdir(exist_ok=False)
r = {'schema':1, 'volgorde':['referentie-a','sortering-a','sortering-b','referentie-b'], 'geslaagd':False, 'ronden':[],
     'grens':'Afzonderlijke Linux-kernproef; geen GUI-/IPC-/FPS-meting, exacte GUI-batchgrenzen of productacceptatie.',
     'scripts':{p.name:sha(p) for p in [LOKAAL/'controleer.mjs', controle]},
     'programmas':{'referentie':sha(ref),'sortering':bouw['programma_sha256']}}
try:
    for naam in r['volgorde']:
        script = controle if naam.startswith('referentie') else LOKAAL/'controleer.mjs'
        env = os.environ.copy(); env['OFFICE_INVOER_UIT'] = str(uit/naam)
        begin = time.monotonic()
        with (uit/(naam+'.log')).open('w') as log:
            p = subprocess.run(['node', str(script)], env=env, stdout=log, stderr=subprocess.STDOUT, timeout=600)
        ronde = {'naam':naam, 'code':p.returncode, 'seconden':time.monotonic()-begin}
        r['ronden'].append(ronde)
        verslag = json.loads((uit/naam/'rapport.json').read_text())
        ronde.update(geslaagd=verslag['geslaagd'], fout=verslag.get('fout'), cachehergebruik=verslag.get('cachehergebruik'), fasen=verslag.get('fasen'))
        print(naam, p.returncode, verslag['geslaagd'], flush=True)
        if p.returncode or not verslag['geslaagd']: raise RuntimeError('Gegevens-/DOCX-proef afgekeurd: '+naam)
    r['geslaagd'] = True
except Exception as fout:
    r['fout'] = repr(fout)
finally:
    (uit/'rapport.json').write_text(json.dumps(r, ensure_ascii=False, indent=2)+'\n')
if not r['geslaagd']: raise SystemExit(1)
