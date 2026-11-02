from pathlib import Path
import subprocess,os,json,hashlib,time,sys
r=Path.cwd();w=r/'.local/controle-2026-10-31';m=json.loads((w/'native-alpha46-hertest-testbron.json').read_text());st=json.loads((w/'native-alpha46-hertest-stapstatus.json').read_text());assert len(st['stappen'])==7 and not st['inhoudelijk_afgerond'];begin=time.monotonic();e=os.environ.copy();e['OFFICE_TEST_UIT']=str(w/'native-alpha46-hertest-conversie-uitvoer');e['OFFICE_TEST_UITVOER']=str(w/'native-alpha46-hertest-runtime-uitvoer');e['OFFICE_XVFB']=str(w/'gui-hulpmiddelen/uitgepakt/usr/bin/Xvfb');python='/home/aia01/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3'
def controleer():
 for n,h in m.items():assert hashlib.sha256((r/n).read_bytes()).hexdigest()==h,n
 for s in st['stappen']:assert hashlib.sha256((w/s['log']).read_bytes()).hexdigest()==s['sha256']
def bewaar():
 (w/'native-alpha46-hertest-stapstatus.json').write_text(json.dumps(st,ensure_ascii=False,indent=2)+'\n')
controleer()
for naam,cmd in [('runtime',['cargo','test','--manifest-path','native/Cargo.toml','--workspace','--locked','-j1','--','--ignored','--test-threads=1']),('conversie-onafhankelijk',[python,'native/crates/office-conversie/tests/controleer.py',e['OFFICE_TEST_UIT']])]:
 controleer();log=w/f'native-alpha46-hertest-{naam}.log';start=time.monotonic()
 with log.open('wb') as f:p=subprocess.run(cmd,env=e,stdout=f,stderr=subprocess.STDOUT)
 st['stappen'].append({'controle':naam,'opdracht':cmd,'exitcode':p.returncode,'seconden':round(time.monotonic()-start,3),'log':log.name,'sha256':hashlib.sha256(log.read_bytes()).hexdigest()});bewaar();assert p.returncode==0,(naam,p.returncode)
controleer();st['inhoudelijk_afgerond']=True;st['bron_van_736_bestanden_bytegelijk']=True;st['uitvoering']='De eerste zeven controles slaagden; oorspronkelijke terminalstatus 143 tijdens runtime. De twee resterende controles zijn afzonderlijk op dezelfde bron herhaald.';bewaar();(w/'native-alpha46-hertest-hervatting-terminalstatus.json').write_text(json.dumps({'exitcode':0,'seconden':round(time.monotonic()-begin,3),'eerste_terminal_exitcode':143,'alle_negen_onderliggende_fasen_geslaagd':True},indent=2)+'\n');print('Twee hervatte controles groen; alle negen onderliggende fasen en 736 bronbestanden gecontroleerd.',flush=True)
