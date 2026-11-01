"""Bouw uitsluitend de vastgelegde prototypebron voor een vroege vensterafkeuring."""
from pathlib import Path
import json,hashlib,subprocess,shutil
r=Path.cwd();w=r/'.local/controle-2026-10-31';bron=json.loads((w/'native-na-alpha35-aanwijs2-proefbron.json').read_text())
def valideer():
 for n,h in bron['bronbestanden'].items():assert hashlib.sha256((r/n).read_bytes()).hexdigest()==h,n
 assert hashlib.sha256((w/'native-na-alpha35-aanwijs2-proefbron.patch').read_bytes()).hexdigest()==bron['patch_sha256']
valideer()
with (w/'native-na-alpha35-aanwijs2-debug-bouw.log').open('x') as log:subprocess.run(['cargo','build','--manifest-path','native/Cargo.toml','--workspace','--locked','-j1'],stdout=log,stderr=subprocess.STDOUT,check=True)
valideer();v=w/'native-na-alpha35-aanwijs2-debug-vast';v.mkdir();p=r/'native/target/debug/open-office-studio-native';versie=subprocess.check_output([str(p),'--version'],text=True).strip();assert versie=='Open Office Studio 2026.44.9-alpha.35 (native)';q=v/p.name;shutil.copy2(p,q);q.chmod(0o555)
with q.open('rb') as f:h=hashlib.file_digest(f,'sha256').hexdigest()
(v/'herkomst.json').write_text(json.dumps({'basiscommit':bron['basiscommit'],'bronpatch_sha256':bron['patch_sha256'],'bouwprofiel':'Ontwikkelprototype met vastgelegde patch, geen release- of volledige brongoedkeuring','bronbestanden':bron['bronbestanden'],'programmas':{p.name:{'versie':versie,'sha256':h}}},ensure_ascii=False,indent=2)+'\n');print('Prototypeprogramma en alle 669 bronbytes vastgelegd.',flush=True)
