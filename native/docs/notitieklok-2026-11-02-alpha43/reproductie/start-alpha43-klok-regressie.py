from pathlib import Path
import subprocess,json,hashlib
w=Path('.local/controle-2026-10-31');m=json.loads((w/'native-alpha43-klok-regressie-voor-testbron.json').read_text())
with (w/'native-alpha43-klok-regressie-voor.log').open('wb') as f:
 p=subprocess.run(['cargo','test','--manifest-path','native/Cargo.toml','--workspace','--locked','-j1','nieuwe_notities_hebben_de_werkelijke_aanmaakdatum','--','--test-threads=1'],stdout=f,stderr=subprocess.STDOUT)
for n,h in m.items():assert hashlib.sha256(Path(n).read_bytes()).hexdigest()==h,n
v={'basiscommit':'214471bdaef902cdc6a787cca9f162fdb7920ab4','productieversie':'2026.44.9-alpha.42','exitcode':p.returncode,'bronbestanden':len(m),'bron_bytegelijk':True,'omvang':'Werkelijke aanmaakdatumregressie op bestaande productiecode; verwachte afkeuring vóór klokcorrectie, geen geslaagde functietest.'}
(w/'native-alpha43-klok-regressie-voor-status.json').write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
assert p.returncode==101 and 'nieuwe_notities_hebben_de_werkelijke_aanmaakdatum ... FAILED' in (w/'native-alpha43-klok-regressie-voor.log').read_text()
print(json.dumps(v,ensure_ascii=False))
