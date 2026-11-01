from pathlib import Path
import subprocess,os,sys,json,hashlib
r=Path.cwd();w=r/'.local/controle-2026-10-31';e=os.environ.copy();e['OFFICE_TEST_UITVOER']=str(w/'native-alpha35-definitief-uitvoer');e['OFFICE_TEST_SCHERMEN']=str(w/'native-alpha35-definitief-schermen')
python='/home/aia01/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3'
verwacht=json.loads((w/'native-alpha35-testbron.json').read_text())
def valideer():
 for n,h in verwacht.items():assert hashlib.sha256((r/n).read_bytes()).hexdigest()==h,n
valideer()
controles=[('fmt',['cargo','fmt','--manifest-path','native/Cargo.toml','-p','office-core','-p','open-office-studio-native','-p','office-mail','-p','office-conversie','--check']),('tests',['cargo','test','--manifest-path','native/Cargo.toml','--workspace','--locked','-j','1','--no-fail-fast','--','--test-threads=1']),('onafhankelijk',[python,'native/crates/office-core/tests/fixtures/controleer.py',e['OFFICE_TEST_UITVOER']]),('python',[sys.executable,'-m','unittest','discover','-s','native/scripts','-p','test_*.py']),('bron',[sys.executable,'native/scripts/controleer-bron.py']),('clippy',['cargo','clippy','--manifest-path','native/Cargo.toml','--workspace','--locked','--all-targets','-j','1','--','-D','warnings'])]
# Geef waarschuwingen vóór de lange testronde terug; alle controles blijven verplicht.
volgorde=['fmt','clippy','tests','onafhankelijk','python','bron']
controles.sort(key=lambda item:volgorde.index(item[0]))
for naam,cmd in controles:
 env=e.copy()
 if naam=='clippy':env['CARGO_TARGET_DIR']=str(w/'native-alpha20-checkdoel')
 with (w/f'native-alpha35-definitief-{naam}.log').open('w') as log:
  subprocess.run(cmd,env=env,stdout=log,stderr=subprocess.STDOUT,check=True)
 print(naam+' geslaagd',flush=True)

e['OFFICE_TEST_UIT']=str(w/'native-alpha35-conversie-uitvoer')
e['OFFICE_TEST_UITVOER']=str(w/'native-alpha35-runtime-uitvoer')
with (w/'native-alpha35-runtime.log').open('w') as log:
 subprocess.run(['cargo','test','--manifest-path','native/Cargo.toml','--workspace','--locked','-j','1','--','--ignored','--test-threads=1'],env=e,stdout=log,stderr=subprocess.STDOUT,check=True)
print('zes runtimeproeven geslaagd',flush=True)
with (w/'native-alpha35-conversie-onafhankelijk.log').open('w') as log:
 subprocess.run([python,'native/crates/office-conversie/tests/controleer.py',e['OFFICE_TEST_UIT']],env=e,stdout=log,stderr=subprocess.STDOUT,check=True)
print('conversies onafhankelijk teruggelezen',flush=True)
valideer()
print('Volledige bron vóór en na de controles bytegelijk.',flush=True)
