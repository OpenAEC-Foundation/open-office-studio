"""Ongewijzigde grote fontproef op de bevroren referentiebinary."""
from pathlib import Path
import json,os,subprocess
from voorbereiden import REPO,UIT,sha
exe=REPO/'.local/doorwerk-2026-11-04/incrementele-invoer/open-office-studio-45.49-meting';assert sha(exe)=='e7295980a17df1e85c9524ad6e384fcf63735162bb60964f4d7aebacf42e5785'
script=REPO/'scripts/test-writer-lang-native.py'
env=os.environ.copy();env['PATH']=str(REPO/'.local/controle-2026-10-31/gui-hulpmiddelen/uitgepakt/usr/bin')+':'+env['PATH']
cmd=[str(REPO/'.local/doorwerk-2026-11-02/gui-python/bin/python'),str(script),'--programma',str(exe),'--versie','2026.45.49','--uitvoer',str(UIT/'font-ref'),'--verwacht-rust-tekst','--verwacht-incrementele-bron','--verwacht-worker-layout','--verwacht-worker-lettertypen','--lettertypebewijs','--verwacht-native-base64','--framebasis']
with (UIT/'font-ref.log').open('w')as log:p=subprocess.run(cmd,cwd=REPO,env=env,stdout=log,stderr=subprocess.STDOUT)
(UIT/'font-ref.json').write_text(json.dumps({'code':p.returncode,'programma_sha256':sha(exe),'script_sha256':sha(script),'opdracht':cmd},indent=2)+'\n');print('Referentiefont',p.returncode,flush=True);raise SystemExit(p.returncode)
