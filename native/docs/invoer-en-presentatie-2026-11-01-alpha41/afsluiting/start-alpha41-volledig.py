from pathlib import Path
import subprocess,json,hashlib
w=Path('.local/controle-2026-10-31');p=subprocess.run(['python3','-u',str(w/'controle-alpha41-definitief.py')]);d={'exitcode':p.returncode,'bronmanifest_sha256':hashlib.sha256((w/'native-alpha41-testbron.json').read_bytes()).hexdigest()};(w/'native-alpha41-terminalstatus.json').write_text(json.dumps(d,indent=2)+'\n');raise SystemExit(p.returncode)
