"""Voer de bestaande echte callbackproeven plus nieuwe bron-/foutpoorten uit."""
from pathlib import Path
import os,subprocess,json,hashlib
from voorbereiden import REPO,ROOT,UIT,vervang
bron=REPO/'src/tekst/layout-hostsynchronisatie.test.ts';s=bron.read_text()
s=vervang(s,'    andereVersie() { versie = "latere-bron"; },','    refBron: context.Re, naarVersie(v: string) { versie=v; },\n    andereVersie() { versie = "latere-bron"; },')
s=vervang(s,'let versie = "bron-na-invoer";','let versie: string | Error = "bron-na-invoer";')
s=vervang(s,'t: () => versie,','t: () => { if(versie instanceof Error)throw versie; return versie; },')
s=s.replace('naarVersie(v: string)', 'naarVersie(v: string | Error)')
s+='\n'+(ROOT/'extra-hostproeven.ts').read_text();test=UIT/'host.test.ts';assert not test.exists();test.write_text(s)
config=UIT/'vitest.config.mjs';config.write_text('export default '+json.dumps({'test':{'include':[str(test)],'exclude':[]}})+';\n')
env=os.environ.copy();env['PATH']=str(Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin')+':'+env['PATH'];env['OFFICE_LAYOUT_SDK']=str(UIT/'bron/node_modules/@betteroffice/docx-react/dist/index.mjs')
with (UIT/'hostproeven.log').open('w')as log:p=subprocess.run([str(REPO/'node_modules/.bin/vitest'),'run','--config',str(config)],cwd=REPO,env=env,stdout=log,stderr=subprocess.STDOUT)
(UIT/'hostproeven.json').write_text(json.dumps({'code':p.returncode,'sdk_sha256':hashlib.sha256(Path(env['OFFICE_LAYOUT_SDK']).read_bytes()).hexdigest(),'oorspronkelijke_test_sha256':hashlib.sha256(bron.read_bytes()).hexdigest(),'test_sha256':hashlib.sha256(test.read_bytes()).hexdigest()},indent=2)+'\n');raise SystemExit(p.returncode)
