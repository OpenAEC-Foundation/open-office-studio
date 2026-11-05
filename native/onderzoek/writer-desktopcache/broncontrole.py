"""Vergelijk de desktopbron met de eerder volledig getoetste kernkopie."""
from pathlib import Path
import json,hashlib,subprocess,os
from voorbereiden import bereid,LOKAAL,REPO
bereid();bron=LOKAAL/'bron';ref=REPO/'native/onderzoek/writer-replicacache/.local/gemeten/vendor'
for n in ['src/deterministic.rs','src/lib.rs']:
    assert (bron/'native/vendor/docx-edit'/n).read_bytes()==(ref/'docx-edit'/n).read_bytes(),n
s=(ref/'docx-edit/src/clipboard_batch.rs').read_text();regels=s.splitlines(True)
weg=[l for l in regels if '_openaec_'in l];assert len(weg)==19,len(weg)
assert ''.join(l for l in regels if '_openaec_'not in l)==(bron/'native/vendor/docx-edit/src/clipboard_batch.rs').read_text()
s=(ref/'office-writer-plakken/src/bronspiegel.rs').read_text();anker='#[cfg(test)]\nmod encodercachecontroles {';assert s.count(anker)==1
assert s.split(anker)[0].rstrip()==(bron/'native/crates/office-writer-plakken/src/bronspiegel.rs').read_text().rstrip()
m=json.loads((LOKAAL/'bronnen.json').read_text())
for n,h in m['gewijzigd'].items():assert hashlib.sha256((bron/n).read_bytes()).hexdigest()==h,n
# Alle overige applicatiebronnen moeten nog exact uit de vastgelegde revisie komen.
from voorbereiden import COMMIT
paden=['src','packages','scripts','native/vendor','native/crates/office-writer-plakken','src-tauri/src','vite.config.ts','native/Cargo.toml','native/Cargo.lock']
records=subprocess.check_output(['git','ls-tree','-rz',COMMIT,'--',*paden],cwd=REPO).split(b'\0')
aantal=0
for record in records:
    if not record:continue
    kop,naam=record.split(b'\t',1);modus,soort,blob=kop.split();naam=naam.decode()
    assert soort==b'blob',naam
    p=bron/naam
    if naam in m['gewijzigd']:assert hashlib.sha256(p.read_bytes()).hexdigest()==m['gewijzigd'][naam]
    else:
        data=os.readlink(p).encode()if modus==b'120000'else p.read_bytes()
        assert hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()==blob.decode(),naam
    aantal+=1
print(aantal,'applicatiebronnen op exacte revisie/bedoelde cachepatch gecontroleerd.')
print('De vier werkelijke desktopkernbronnen zijn gelijk aan de getoetste kandidaat, uitsluitend zonder negentien meetregels en de extra proefmodule.')
