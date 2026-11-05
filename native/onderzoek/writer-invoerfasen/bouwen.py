from pathlib import Path
import os,subprocess,json,hashlib,shutil,time
r=Path(__file__).resolve().parent;env=os.environ.copy();env['PATH']=str(Path.home()/'.cargo/bin')+':'+env['PATH'];uit=[]
for naam in ['basis','gemeten']:
 env['CARGO_TARGET_DIR']=str(r/'.local/target' if naam=='basis' else r/'.local/gemeten/target')
 print('START',naam,flush=True);begin=time.monotonic()
 with (r/'.local'/('bouw-'+naam+'-hercontrole.log')).open('w')as log:p=subprocess.run(['cargo','build','--release','--locked','--manifest-path',str(r/'.local'/naam/'Cargo.toml')],env=env,stdout=log,stderr=subprocess.STDOUT)
 uit.append({'variant':naam,'code':p.returncode,'seconden':time.monotonic()-begin});(r/'.local/bouwuitkomsten.json').write_text(json.dumps(uit,indent=2)+'\n')
 if p.returncode:raise SystemExit(p.returncode)
 doel=r/'.local'/naam/'office-writer-invoerprofiel';shutil.copy2(Path(env['CARGO_TARGET_DIR'])/'release/office-writer-invoerprofiel',doel);uit[-1]['programma_sha256']=hashlib.file_digest(doel.open('rb'),'sha256').hexdigest();(r/'.local/bouwuitkomsten.json').write_text(json.dumps(uit,indent=2)+'\n');print('EINDE',naam,0,flush=True)

assert len({x["programma_sha256"] for x in uit})==2, "Beide varianten hebben dezelfde binary; meting afgekeurd"
