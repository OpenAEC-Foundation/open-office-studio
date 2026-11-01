from pathlib import Path
import json,subprocess,sys
n=int(sys.argv[1]);run=sys.argv[2];sha=sys.argv[3];aantal=int(sys.argv[4]);r=Path.cwd();w=r/'.local/controle-2026-10-31';docs=r/'native/docs';bron=w/f'native-alpha{n}-ci-verslagen';v=json.loads((bron/'native-platformvergelijking/rapport.json').read_text());assert v['geslaagd'] and v['bouwronde']==run;merge=v['geteste_checkout']
status=json.loads(subprocess.check_output(['gh','run','view',run,'--json','conclusion,status,jobs'],text=True));assert status['conclusion']=='success' and status['status']=='completed' and len(status['jobs'])==5 and all(j['conclusion']=='success' for j in status['jobs'])
subprocess.run(['git','fetch','origin',merge],check=True,capture_output=True)
subprocess.run(['git','diff','--quiet',sha,merge,'--','native','public/templates','docs/voorbeelden','.gitattributes','.github/workflows/native-rust.yml','LICENSE'],check=True)
assert len(v['pakketten'])==3 and len(v['beelden'])==2*aantal
for p in v['pakketten']:assert p['alle_bronbytes_gelijk'] and p['bronregressie_met_verpakte_controleur_geslaagd']
for b in v['beelden']:assert b['geslaagd'] and b['afwijkende_pixels']==0
v.update(versie=f'2026.44.9-alpha.{n}',broncommit_native=sha,native_bron_bytegelijk_aan_commit=True,ci_taken=[{k:j[k] for k in ['name','conclusion','url']} for j in status['jobs']])
(docs/f'platformen-2026-11-01-alpha{n}.json').write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
metingen=[]
for p in v['pakketten']:
 platform=p['platform'];d=json.loads((bron/f'native-paginametingen-{platform}/paginameting.json').read_text());assert d['geslaagd'] and len(d['metingen']['sessie']['paginas'])==7 and not d['verschillen'];assert d['programma_sha256']==next(a['sha256'] for a in p['programmas'] if 'controleer-bestand' in a['bestand']);metingen.append({'platform':platform,**d})
(docs/f'paginametingen-2026-11-01-alpha{n}.json').write_text(json.dumps({'versie':f'2026.44.9-alpha.{n}','bouwronde':run,'omvang':'Zeven bezoeken per platform; dezelfde releasecontroleur vergelijkt exacte verse en behouden layout-, geometrie- en veldhashes. Geen fysieke GUI of legacypariteit.','alle_21_bezoeken_geslaagd':True,'metingen':metingen},ensure_ascii=False,indent=2)+'\n')
print({'bronbestanden':[p['bronbestanden'] for p in v['pakketten']],'beeldparen':len(v['beelden']),'bezoeken':21})
