"""Vergelijk de werkelijke encoderbronnen rechtstreeks, zonder de hele engine-testbinary."""
from pathlib import Path
import os
import json
import subprocess
from voorbereiden import bereid, ROOT, REFERENTIE, LOKAAL, sha

bereid()
bronpaden = {'referentie':REFERENTIE/'.local/gemeten/vendor/docx-edit/src/deterministic.rs',
             'kandidaat':LOKAAL/'gemeten/vendor/docx-edit/src/deterministic.rs'}
for naam, p in bronpaden.items():
    s = p.read_text(); anker = '#[cfg(test)]\nmod tests {'
    assert s.count(anker) == 1, 'Andere algemene encoder-testmodule'
    # Geen encoderregel wijzigen; voeg alleen een ingang voor de private functie toe.
    s = s.split(anker)[0]+'\npub fn encodeer_proef(v: &yrs::Any) -> Vec<u8> { let mut uit=Vec::new(); encode_any(v, &mut uit); uit }\n'
    (LOKAAL/(naam+'-encoder.rs')).write_text(s)
deps = LOKAAL/'target/release/deps'
args = ['rustc', '--test', '-O', '--edition=2024', str(ROOT/'encodercontrole.rs'), '-L', 'dependency='+str(deps)]
for naam in ['yrs', 'serde_json']:
    libs = list(deps.glob('lib'+naam+'-*.rlib'))
    assert len(libs) == 1, 'Geen unieke gecontroleerde bibliotheek: '+naam
    args.extend(['--extern', naam+'='+str(libs[0])])
programma = LOKAAL/'encodercontrole'; args.extend(['-o', str(programma)])
env = os.environ.copy(); env['PATH'] = str(Path.home()/'.cargo/bin')+':'+env['PATH']
with (LOKAAL/'encodercontrole-bouw.log').open('w') as log:
    bouw = subprocess.run(args, env=env, stdout=log, stderr=subprocess.STDOUT)
r = {'bouwcode':bouw.returncode, 'bronhashes':{n:sha(p) for n,p in bronpaden.items()}, 'harnas_sha256':sha(ROOT/'encodercontrole.rs')}
if bouw.returncode == 0:
    with (LOKAAL/'encodercontrole.log').open('w') as log:
        p = subprocess.run([str(programma)], stdout=log, stderr=subprocess.STDOUT)
    r.update(exitcode=p.returncode, programma_sha256=sha(programma))
(LOKAAL/'encodercontrole.json').write_text(json.dumps(r, indent=2)+'\n')
print(json.dumps(r), flush=True)
raise SystemExit(bouw.returncode or r['exitcode'])
