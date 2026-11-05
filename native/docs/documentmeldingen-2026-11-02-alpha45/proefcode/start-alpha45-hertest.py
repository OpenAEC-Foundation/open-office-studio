from pathlib import Path
import subprocess,json,sys,time
w=Path('.local/controle-2026-10-31');start=time.monotonic()
with (w/'native-alpha45-hertest-terminal.log').open('wb') as f:
 p=subprocess.run([sys.executable,str(w/'controle-alpha45-hertest.py')],stdout=f,stderr=subprocess.STDOUT)
(w/'native-alpha45-hertest-terminalstatus.json').write_text(json.dumps({'exitcode':p.returncode,'seconden':round(time.monotonic()-start,3)},indent=2)+'\n')
raise SystemExit(p.returncode)
