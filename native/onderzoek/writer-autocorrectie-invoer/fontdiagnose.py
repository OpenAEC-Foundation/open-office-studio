"""Behoud de fontafkeuring; voeg alleen berichtvormen toe aan de diagnose."""
from pathlib import Path
import json,os,subprocess
from voorbereiden import REPO,UIT,sha
m=json.loads((UIT/'gebouwd.json').read_text());exe=Path(m['programma']);assert sha(exe)==m['programma_sha256']
js=(REPO/'scripts/gui/lettertype_bewijs.js').read_text();a='verzoeken.push({ worker:';assert js.count(a)==1
js=js.replace(a,"verzoeken.push({ sleutels:Object.keys(b??{}),snapshot_sleutels:Object.keys(b?.snapshot??{}),strings:Object.fromEntries(Object.entries(b??{}).filter(([k,v])=>typeof v==='string').map(([k,v])=>[k,{lengte:v.length,begin:k==='type'?v:v.slice(0,180)}])), worker:")
js=js.replace('bronversie: s.version(), worker_uitgevallen:', 'client_sleutels:Object.keys(client()),worker_houdt_bron:client().holdsWorkerState?.(),bronversie: s.version(), worker_uitgevallen:')
module=UIT/'fontdiagnose-module-tweede.py';assert not module.exists();module.write_text((REPO/'scripts/gui/lettertype_bewijs.py').read_text());module.with_suffix('.js').write_text(js)
s=(REPO/'scripts/test-writer-lang-native.py').read_text().replace('REPO = Path(__file__).resolve().parents[1]',f'REPO = Path({str(REPO)!r})')
s=s.replace('import sys\n', 'import sys\nsys.path.insert(0, '+repr(str(REPO/'scripts'))+')\n',1).replace('repo = Path(__file__).resolve().parents[1]', 'repo = Path('+repr(str(REPO))+')')
a='                from gui.lettertype_bewijs import controleer as controleer_lettertypen';assert s.count(a)==1
s=s.replace(a,"                import importlib.util\n                spec_font=importlib.util.spec_from_file_location('eigen_fontdiagnose',"+repr(str(module))+")\n                eigen_font=importlib.util.module_from_spec(spec_font);spec_font.loader.exec_module(eigen_font)\n                controleer_lettertypen=eigen_font.controleer")
helper=UIT/'fontdiagnose-tweede.py';assert not helper.exists();helper.write_text(s)
env=os.environ.copy();env['PATH']=str(REPO/'.local/controle-2026-10-31/gui-hulpmiddelen/uitgepakt/usr/bin')+':'+env['PATH']
cmd=[str(REPO/'.local/doorwerk-2026-11-02/gui-python/bin/python'),str(helper),'--programma',str(exe),'--versie','2026.45.52','--uitvoer',str(UIT/'fontdiagnose-tweede'),'--verwacht-rust-tekst','--verwacht-incrementele-bron','--verwacht-worker-layout','--verwacht-worker-lettertypen','--lettertypebewijs','--verwacht-native-base64','--framebasis']
with (UIT/'fontdiagnose-tweede.log').open('w')as log:p=subprocess.run(cmd,cwd=REPO,env=env,stdout=log,stderr=subprocess.STDOUT)
(UIT/'fontdiagnose-tweede.json').write_text(json.dumps({'code':p.returncode,'programma_sha256':sha(exe),'script_sha256':sha(helper),'module_sha256':sha(module),'js_sha256':sha(module.with_suffix('.js')),'opdracht':cmd},indent=2)+'\n');print('Fontdiagnose',p.returncode,flush=True);raise SystemExit(p.returncode)
