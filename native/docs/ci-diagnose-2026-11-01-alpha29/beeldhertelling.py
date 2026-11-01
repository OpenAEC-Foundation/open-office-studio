from pathlib import Path
import json,subprocess,sys,hashlib
r=Path.cwd();w=r/'.local/controle-2026-10-31';bron=w/'native-alpha29-ci-verslagen';uit=w/'native-alpha29-ci-beelden-hertelling';uit.mkdir();metingen=[]
ref=list((bron/'native-controle-Linux').glob('schermen-*'));assert len(ref)==1;ref=ref[0];namen={p.name for p in ref.glob('*.png')};assert len(namen)==51
for platform in ['Windows','macOS']:
 m=list((bron/f'native-controle-{platform}').glob('schermen-*'));assert len(m)==1;m=m[0];assert {p.name for p in m.glob('*.png')}==namen
 for n in sorted(namen):
  p=uit/platform/Path(n).stem
  a=subprocess.run([sys.executable,'native/scripts/vergelijk-schermen.py',str(ref/n),str(m/n),'--uitvoer',str(p),'--kanaalverschil','0','--max-afwijkende-pixels','0'],capture_output=True,text=True)
  v=json.loads((p/'rapport.json').read_text());assert a.returncode==0 and v['geslaagd'] and v['afwijkende_pixels']==0
  metingen.append({'platform':platform,'beeld':n,'linux_sha256':hashlib.sha256((ref/n).read_bytes()).hexdigest(),'platform_sha256':hashlib.sha256((m/n).read_bytes()).hexdigest(),**v})
assert len(metingen)==102
(r/'native/docs/ci-diagnose-2026-11-01-alpha29/beeldhertelling.json').write_text(json.dumps({'broncommit':'cf35322ccf19fc8981ee63592d4892f54349e5fd','bouwronde':'41265333745','geslaagd_binnen_omvang':True,'omvang':'Lokale volledige nultolerantievergelijking van dezelfde 51 CI-beelden per platform. Deze hertelling verandert de afgekeurde workflow niet en controleert geen pakketbron of legacypariteit.','beeldparen':102,'metingen':metingen},ensure_ascii=False,indent=2)+'\n')
print('102 volledige native CI-beeldparen pixelgelijk; oorspronkelijke CI-afkeuring behouden.',flush=True)
