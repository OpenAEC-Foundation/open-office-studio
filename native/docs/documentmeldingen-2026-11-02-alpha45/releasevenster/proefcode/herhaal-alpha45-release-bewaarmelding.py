from pathlib import Path
import subprocess,sys,json,time
w=Path('.local/controle-2026-10-31');start=time.monotonic();acties=(w/'acties-alpha45-release-bewaarmelding.jsonl').read_bytes()
with (w/'native-alpha45-release-bewaarmelding-terminal.log').open('wb') as f:
 p=subprocess.run([sys.executable,str(w/'venster-alpha45-release-bewaarmelding.py'),'45'],input=acties,stdout=f,stderr=subprocess.STDOUT)
(w/'native-alpha45-release-bewaarmelding-terminalstatus.json').write_text(json.dumps({'exitcode':p.returncode,'seconden':round(time.monotonic()-start,3)},indent=2)+'\n');raise SystemExit(p.returncode)
