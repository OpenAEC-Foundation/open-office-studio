from pathlib import Path
import hashlib,json,os,datetime
w=Path.cwd()/'.local/controle-2026-10-31';namen=['native-na-alpha35-schaduw-debug-vast'];rapport={'tijd':datetime.datetime.now(datetime.timezone.utc).isoformat(),'omvang':'Alleen de niet-actieve schaduw-debugkopie; bronpatches, logs, metadata en alle releasekopieën blijven behouden.','bestanden':[]}
def sha(p):
 with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
for naam in namen:
 d=w/naam;p=d/'open-office-studio-native';m=json.loads((d/'herkomst.json').read_text());verwacht=m['programmas'][p.name]['sha256'];assert sha(p)==verwacht
 st=p.stat();assert st.st_nlink==1
 for q in Path('/proc').iterdir():
  if not q.name.isdecimal():continue
  try:x=(q/'exe').stat()
  except OSError:continue
  assert (x.st_dev,x.st_ino)!=(st.st_dev,st.st_ino),(naam,q.name)
 rapport['bestanden'].append({'pad':str(p),'sha256':verwacht,'grootte':st.st_size,'inode':st.st_ino})
f=w/'opruiming-schaduwprototype-na-ci36.json';assert not f.exists();f.write_text(json.dumps(rapport,ensure_ascii=False,indent=2)+'\n')
for b in rapport['bestanden']:
 p=Path(b['pad']);assert p.stat().st_ino==b['inode'];p.unlink()
print(sum(b['grootte'] for b in rapport['bestanden']))
