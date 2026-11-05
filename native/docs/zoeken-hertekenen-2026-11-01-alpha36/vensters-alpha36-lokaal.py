"""Herhaal onafhankelijke vensterroutes op de vastgezette lokale release."""
from pathlib import Path
import json,subprocess,sys
w=Path('.local/controle-2026-10-31');uit=[]
for naam,script in [('lijsten','venster-writer-lijsten-alpha36.py'),('stijlen','venster-writer-stijlen-alpha36-hulpgherstel.py'),('schaars','venster-schaars-alpha36.py'),('bestand','venster-bestand-alpha36.py')]:
 with (w/f'native-alpha36-{naam}-lokaal-vensteropdracht.log').open('x') as log:p=subprocess.run([sys.executable,str(w/script),'lokaal'],stdout=log,stderr=subprocess.STDOUT)
 uit.append({'route':naam,'afsluitcode':p.returncode});print(naam,p.returncode,flush=True)
(w/'native-alpha36-lokale-vensterstanden.json').write_text(json.dumps({'alle_routes_geslaagd':all(v['afsluitcode']==0 for v in uit),'routes':uit},ensure_ascii=False,indent=2)+'\n')
raise SystemExit(0 if all(v['afsluitcode']==0 for v in uit) else 1)
