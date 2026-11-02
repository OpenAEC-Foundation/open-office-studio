from pathlib import Path
import json,hashlib,subprocess,tempfile,tarfile
r=Path.cwd();w=r/'.local/controle-2026-10-31';basis=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip();assert basis=='214471bdaef902cdc6a787cca9f162fdb7920ab4'
namen=sorted(set(json.loads((w/'native-alpha42-hertest-testbron.json').read_text()))|{'native/crates/office-core/src/klok.rs','native/crates/office-core/tests/notitie_klok.rs'})
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def schrijf(p,d):p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
assert len(namen)==731
m={n:sha(r/n) for n in namen};schrijf(w/'native-alpha43-testbron.json',m)
oud=set(subprocess.check_output(['git','ls-tree','-r','--name-only',basis],text=True).splitlines());nieuw=sorted(set(namen)-oud);assert len(nieuw)==2
subprocess.run(['git','add','-N','--',*nieuw],check=True)
patch=w/'native-alpha43-geteste-bron.patch';patch.write_bytes(subprocess.check_output(['git','diff','--binary',basis,'--',*namen]));assert patch.stat().st_size>1000
schrijf(w/'native-alpha43-geteste-bron.json',{'basiscommit':basis,'bronbestanden':len(m),'nieuwe_bestanden':nieuw,'bronmanifest_sha256':sha(w/'native-alpha43-testbron.json'),'volledige_patch_sha256':sha(patch)})
uit=Path(tempfile.mkdtemp(prefix='office-alpha43-herstel-',dir='/tmp'));tar=w/'native-alpha43-herstelbron.tar'
with tar.open('wb') as f:subprocess.run(['git','archive',basis,'--',*(n for n in namen if n in oud)],stdout=f,check=True)
with tarfile.open(tar) as f:f.extractall(uit,filter='data')
subprocess.run(['git','apply','--check',str(patch)],cwd=uit,check=True);subprocess.run(['git','apply',str(patch)],cwd=uit,check=True)
for n,h in m.items():assert sha(uit/n)==h,n;assert sha(r/n)==h,n
schrijf(w/'native-alpha43-patchherstel.json',{'basiscommit':basis,'herstelmap':str(uit),'bronbestanden':len(m),'volledige_patch_herstel_gelijk':True,'werkbron_bytegelijk':True,'bronmanifest_sha256':sha(w/'native-alpha43-testbron.json')})
print({'bronbestanden':len(m),'nieuwe_bestanden':nieuw,'patch_bytes':patch.stat().st_size,'bronmanifest_sha256':sha(w/'native-alpha43-testbron.json')})
