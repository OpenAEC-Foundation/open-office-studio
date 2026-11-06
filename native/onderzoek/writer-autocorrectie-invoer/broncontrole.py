"""Vergelijk elk oorspronkelijk Git-bestand en de expliciete kandidaatwijzigingen."""
import hashlib,json,subprocess
from voorbereiden import REPO,UIT,sha
def controleer():
    m=json.loads((UIT/'bronnen.json').read_text());bron=UIT/'bron';afwijkingen=m['bestanden'];aantal=0
    regels=subprocess.check_output(['git','ls-tree','-rz',m['commit']],cwd=REPO).split(b'\0')
    for r in regels:
        if not r:continue
        meta,naam=r.split(b'\t');n=naam.decode();mode,typ,h=meta.decode().split();p=bron/n
        if n in afwijkingen:assert sha(p)==afwijkingen[n],n
        elif mode=='120000':assert p.is_symlink(),n
        else:assert hashlib.sha1(b'blob '+str(p.stat().st_size).encode()+b'\0'+p.read_bytes()).hexdigest()==h,n
        aantal+=1
    for n,h in afwijkingen.items():assert sha(bron/n)==h,n
    assert sha(bron/'node_modules/@betteroffice/docx-react/dist/index.mjs')==m['sdk_sha256']=='85a8d0fd2c1f45b1a1fc5b9b7e9fa0065ffee4dd6ad423939798f421fe9bffbb'
    (UIT/'broncontrole.json').write_text(json.dumps({'archiefbestanden':aantal,'expliciete_kandidaatbestanden':len(afwijkingen),'sdk_ongewijzigd':True},indent=2)+'\n')
if __name__=='__main__':controleer()
