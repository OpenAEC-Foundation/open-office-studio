from pathlib import Path
import json,hashlib,subprocess
r=Path.cwd();w=r/'.local/controle-2026-10-31';voor=json.loads((w/'native-alpha42-herstel-ongeoptimaliseerd-testbron.json').read_text())
for n,h in voor.items():assert hashlib.sha256((r/n).read_bytes()).hexdigest()==h,n
p=r/'native/Cargo.toml';s=p.read_text();(w/'native-alpha42-rasteropt-voor-Cargo.toml').write_bytes(p.read_bytes());s+='\n# Rasterwerk blijft ook tijdens ontwikkelen responsief. Alleen deze vier\n# tekenbibliotheken krijgen optimalisatie; alle debug- en overflowcontroles blijven aan.\n'
for naam in ['tiny-skia:0.11.4','tiny-skia:0.12.0','tiny-skia-path:0.11.4','tiny-skia-path:0.12.0']:
 s+=f'\n[profile.dev.package."{naam}"]\nopt-level = 3\ndebug-assertions = true\noverflow-checks = true\n'
p.write_text(s);m={n:hashlib.sha256((r/n).read_bytes()).hexdigest() for n in voor};assert [n for n in m if m[n]!=voor[n]]==['native/Cargo.toml'];(w/'native-alpha42-rasteropt-testbron.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n');(w/'native-alpha42-rasteropt-verschillen.json').write_text(json.dumps({'omvang':'Vergelijking met de vastgelegde herstelde ongeoptimaliseerde bron; uitsluitend native/Cargo.toml gewijzigd. Vier bestaande gepinde rasterbibliotheken krijgen opt-level 3; debug-assertions en overflow-checks blijven expliciet true. Geen librarybron, dependencyversie, interfacecode of meettolerantie gewijzigd.','gewijzigde_bestanden':['native/Cargo.toml'],'voor_sha256':voor['native/Cargo.toml'],'na_sha256':m['native/Cargo.toml']},ensure_ascii=False,indent=2)+'\n')
with (w/'native-alpha42-rasteropt-bouw.log').open('wb') as f:code=subprocess.run(['cargo','build','--manifest-path','native/Cargo.toml','--workspace','--locked','-j1'],stdout=f,stderr=subprocess.STDOUT).returncode
(w/'native-alpha42-rasteropt-bouwstatus.json').write_text(json.dumps({'exitcode':code,'bronmanifest_sha256':hashlib.sha256((w/'native-alpha42-rasteropt-testbron.json').read_bytes()).hexdigest()},indent=2)+'\n')
for n,h in m.items():assert hashlib.sha256((r/n).read_bytes()).hexdigest()==h,n
raise SystemExit(code)
