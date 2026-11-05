"""Controleer één bevroren bron met ruwe uitvoer en afzonderlijke stapstatussen."""
from pathlib import Path
import subprocess,os,json,hashlib,time,sys
r=Path.cwd();w=r/'.local/controle-2026-10-31';e=os.environ.copy();e['OFFICE_TEST_UITVOER']=str(w/'native-alpha38-definitief-uitvoer');e['OFFICE_TEST_SCHERMEN']=str(w/'native-alpha38-definitief-schermen');python='/home/aia01/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3'
m=json.loads((w/'native-alpha38-testbron.json').read_text());stappen=[]
def bron_gelijk():
 for n,h in m.items():assert hashlib.sha256((r/n).read_bytes()).hexdigest()==h,n
def status(klaar=False):
 (w/'native-alpha38-stapstatus.json').write_text(json.dumps({'omvang':'Afzonderlijk afgeronde onderliggende controles; de terminal-eindstatus staat hier niet gelijk aan.','bronmanifest_sha256':hashlib.sha256((w/'native-alpha38-testbron.json').read_bytes()).hexdigest(),'stappen':stappen,'inhoudelijk_afgerond':klaar,'bron_van_671_bestanden_bytegelijk':klaar},ensure_ascii=False,indent=2)+'\n')
def voer_uit(naam,cmd,env=None,stroom=False):
 bron_gelijk();start=time.monotonic();log=w/f'native-alpha38-definitief-{naam}.log'
 with log.open('wb') as f:
  p=subprocess.Popen(cmd,env=env or e,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
  for regel in p.stdout:
   f.write(regel);f.flush()
   if stroom:print(regel.decode('utf-8',errors='backslashreplace').rstrip(),flush=True)
  code=p.wait()
 stappen.append({'controle':naam,'opdracht':cmd,'exitcode':code,'seconden':round(time.monotonic()-start,3),'log':log.name,'sha256':hashlib.sha256(log.read_bytes()).hexdigest()});status();assert code==0,(naam,code)
 print(naam+' geslaagd',flush=True)
bron_gelijk();status()
voer_uit('fmt',['cargo','fmt','--manifest-path','native/Cargo.toml','-p','office-core','-p','open-office-studio-native','-p','office-mail','-p','office-conversie','--check'])
c=e.copy();c['CARGO_TARGET_DIR']=str(w/'native-alpha20-checkdoel')
voer_uit('clippy',['cargo','clippy','--manifest-path','native/Cargo.toml','--workspace','--locked','--all-targets','-j','1','--','-D','warnings'],c)
voer_uit('tests',['cargo','test','--manifest-path','native/Cargo.toml','--workspace','--locked','-j','1','--no-fail-fast','--','--test-threads=1'],stroom=True)
voer_uit('onafhankelijk',[python,'native/crates/office-core/tests/fixtures/controleer.py',e['OFFICE_TEST_UITVOER']])
voer_uit('python',[sys.executable,'-m','unittest','discover','-s','native/scripts','-p','test_*.py'])
voer_uit('bron',[sys.executable,'native/scripts/controleer-bron.py'])
c=e.copy();c['OFFICE_TEST_UIT']=str(w/'native-alpha38-conversie-uitvoer');c['OFFICE_TEST_UITVOER']=str(w/'native-alpha38-runtime-uitvoer')
voer_uit('runtime',['cargo','test','--manifest-path','native/Cargo.toml','--workspace','--locked','-j','1','--','--ignored','--test-threads=1'],c)
voer_uit('conversie-onafhankelijk',[python,'native/crates/office-conversie/tests/controleer.py',c['OFFICE_TEST_UIT']])
bron_gelijk();status(True);print('Volledige bron vóór en na de controles bytegelijk; alle stapstatussen vastgelegd.',flush=True)
