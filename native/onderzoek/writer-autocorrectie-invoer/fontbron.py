"""Vergelijk fontbehoeften op de werkelijk verzonden actuele layoutbron, ook bij cachegebruik."""
from pathlib import Path
import json,os,subprocess
from voorbereiden import REPO,UIT,sha
m=json.loads((UIT/'gebouwd.json').read_text());exe=Path(m['programma']);assert sha(exe)==m['programma_sha256']
js=(REPO/'scripts/gui/lettertype_bewijs.js').read_text()
a="    if (b?.type === 'fontRequirements') laatste = { input: b.layoutInput, versie: s.version() };"
b="""    if (b?.type === 'fontRequirements') laatste = { input: b.layoutInput, versie: s.version(), herkomst:'fontRequirements' };
    if (b?.type === 'sync' && typeof b.snapshot?.layoutInput === 'string') laatste = {
      input:b.snapshot.layoutInput,versie:s.version(),herkomst:'sync.snapshot.layoutInput',
      frameEpoch:b.expectedFrameEpoch,snapshotRevision:b.snapshot.layoutRevision,
    };"""
assert js.count(a)==1;js=js.replace(a,b)
a='uit.gevallen.push({ naam: v.naam,';assert js.count(a)==1;js=js.replace(a,'uit.gevallen.push({ layoutbron: {herkomst:laatste.herkomst,frameEpoch:laatste.frameEpoch,snapshotRevision:laatste.snapshotRevision}, naam: v.naam,')
module=UIT/'fontbron-module.py';assert not module.exists();module.write_text((REPO/'scripts/gui/lettertype_bewijs.py').read_text());module.with_suffix('.js').write_text(js)
s=(REPO/'scripts/test-writer-lang-native.py').read_text().replace('import sys\n','import sys\nsys.path.insert(0, '+repr(str(REPO/'scripts'))+')\n',1).replace('repo = Path(__file__).resolve().parents[1]','repo = Path('+repr(str(REPO))+')')
a='                from gui.lettertype_bewijs import controleer as controleer_lettertypen';assert s.count(a)==1
s=s.replace(a,"                import importlib.util\n                spec_font=importlib.util.spec_from_file_location('eigen_fontbron',"+repr(str(module))+")\n                eigen_font=importlib.util.module_from_spec(spec_font);spec_font.loader.exec_module(eigen_font)\n                controleer_lettertypen=eigen_font.controleer")
helper=UIT/'fontbron.py';assert not helper.exists();helper.write_text(s)
env=os.environ.copy();env['PATH']=str(REPO/'.local/controle-2026-10-31/gui-hulpmiddelen/uitgepakt/usr/bin')+':'+env['PATH']
cmd=[str(REPO/'.local/doorwerk-2026-11-02/gui-python/bin/python'),str(helper),'--programma',str(exe),'--versie','2026.45.52','--uitvoer',str(UIT/'fontbron'),'--verwacht-rust-tekst','--verwacht-incrementele-bron','--verwacht-worker-layout','--verwacht-worker-lettertypen','--lettertypebewijs','--verwacht-native-base64','--framebasis']
with (UIT/'fontbron.log').open('w')as log:p=subprocess.run(cmd,cwd=REPO,env=env,stdout=log,stderr=subprocess.STDOUT)
(UIT/'fontbron.json').write_text(json.dumps({'code':p.returncode,'programma_sha256':sha(exe),'script_sha256':sha(helper),'module_sha256':sha(module),'js_sha256':sha(module.with_suffix('.js')),'opdracht':cmd,'grens':'Afzonderlijke onderzoeksroute; oorspronkelijke negatieve fontproef blijft ongewijzigd behouden.'},indent=2)+'\n');print('Fontbron',p.returncode,flush=True);raise SystemExit(p.returncode)
