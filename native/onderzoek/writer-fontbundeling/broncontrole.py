"""Controleer alle gearchiveerde bronnen en de uitsluitend bedoelde frontendpatch."""
import hashlib,json,subprocess
from voorbereiden import REPO,ROOT,UIT,COMMIT,sha,patch

def controleer():
    bron=UIT/'bron';m=json.loads((UIT/'bronnen.json').read_text());bedoeld=dict(m['bestanden']);bedoeld['vite.config.ts']=sha(REPO/'vite.config.ts')
    inventaris=subprocess.run(['git','ls-tree','-rz','--full-tree',COMMIT],cwd=REPO,check=True,capture_output=True).stdout
    aantal=0
    for regel in inventaris.split(b'\0'):
        if not regel:continue
        meta,n=regel.split(b'\t',1);mode,soort,blob=meta.decode().split();n=n.decode()
        if soort!='blob':continue
        p=bron/n;data=p.read_bytes()
        if n in bedoeld:assert hashlib.sha256(data).hexdigest()==bedoeld[n],n
        else:assert hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()==blob,n
        aantal+=1
    oud=REPO/'node_modules/@betteroffice/docx-react/dist/index.mjs';nieuw=bron/'node_modules/@betteroffice/docx-react/dist/index.mjs'
    assert sha(oud)==m['sdk_referentie_sha256']and sha(nieuw)==m['sdk_kandidaat_sha256']and sha(ROOT/'poort.js')==m['poort_sha256']
    assert nieuw.read_text()==patch(oud.read_text(),(ROOT/'poort.js').read_text())
    return {'gecontroleerde_bronnen':aantal,'bedoeld_gewijzigd':bedoeld,'sdk_sha256':sha(nieuw),'poort_sha256':m['poort_sha256']}
if __name__=='__main__':print(json.dumps(controleer(),indent=2))
