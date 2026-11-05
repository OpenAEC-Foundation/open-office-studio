from pathlib import Path
import subprocess,json,hashlib,os,re,time
r=Path.cwd();w=r/'.local/controle-2026-10-31';m=json.loads((w/'native-alpha43-klok-voorproef-testbron.json').read_text());e=os.environ.copy();e['OFFICE_TEST_UITVOER']=str(w/'native-alpha43-klok-voorproef-uitvoer');e['OFFICE_TEST_SCHERMEN']=str(w/'native-alpha43-klok-voorproef-schermen');start=time.monotonic()
with (w/'native-alpha43-klok-voorproef.log').open('wb') as f:
 p=subprocess.run(['cargo','test','--manifest-path','native/Cargo.toml','--workspace','--locked','-j1','--no-fail-fast','notitie','--','--test-threads=1'],env=e,stdout=f,stderr=subprocess.STDOUT)
for n,h in m.items():assert hashlib.sha256((r/n).read_bytes()).hexdigest()==h,n
s=(w/'native-alpha43-klok-voorproef.log').read_text();v={'exitcode':p.returncode,'seconden':round(time.monotonic()-start,3),'bronbestanden':len(m),'bron_bytegelijk':True,'samenvattingen':re.findall(r'test result:.*',s)};(w/'native-alpha43-klok-voorproef-status.json').write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n');print(json.dumps(v,ensure_ascii=False));raise SystemExit(p.returncode)
