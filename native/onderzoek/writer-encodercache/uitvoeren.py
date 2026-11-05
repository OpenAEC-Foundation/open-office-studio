"""Afzonderlijke bronvaste encoderproef; bestaande app en proeven blijven gelijk."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import sys

ROOT=Path(__file__).resolve().parent
REPO=ROOT.parents[2]
LOKAAL=ROOT/'.local'
BRON=REPO/'native/vendor/docx-edit/src/deterministic.rs'
BRON_SHA='50467df1c30b12f9e4099fbdff2605219fbede51e180c28cf20173284fc03b1a'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def vervang(s,oud,nieuw):
    if s.count(oud)!=1: raise RuntimeError('Bronanker ontbreekt of is dubbel: '+oud)
    return s.replace(oud,nieuw,1)
def genereer(s):
    s=vervang(s,'#[cfg(test)]\nmod tests {','// Algemene engineproeven volgen niet in dit afzonderlijke harnas.\n#[cfg(any())]\nmod tests {')
    # De algemene testmodule wordt voor beide varianten exact gelijk afgekapt.
    s=s.split('// Algemene engineproeven volgen niet')[0]
    ref=s
    s=vervang(s,'pub(crate) struct DeterministicEncoderV1(EncoderV1);',"pub(crate) struct DeterministicEncoderV1<'a>(EncoderV1,Option<&'a mut WaardeCache>);")
    s=vervang(s,'impl DeterministicEncoderV1 {',"impl DeterministicEncoderV1<'_> {")
    s=vervang(s,'Self(EncoderV1::new())','Self(EncoderV1::new(),None)')
    s=vervang(s,'impl Write for DeterministicEncoderV1 {',"impl Write for DeterministicEncoderV1<'_> {")
    s=vervang(s,'impl Encoder for DeterministicEncoderV1 {',"impl Encoder for DeterministicEncoderV1<'_> {")
    knip=s.index('#[derive(Default)]\nstruct CountingEncoderV1')
    voor,achter=s[:knip],s[knip:]
    voor=vervang(voor,'        encode_any(any, self);','        if let Some(cache)=self.1.as_mut() {cache.schrijf(any,false,&mut self.0);} else {encode_any(any,self);}')
    voor=vervang(voor,'        self.write_string(&serde_json::to_string(&json_value(any)).unwrap());','        if let Some(cache)=self.1.as_mut() {cache.schrijf(any,true,&mut self.0);} else {self.write_string(&serde_json::to_string(&json_value(any)).unwrap());}')
    return ref,voor+achter+'\n'+(ROOT/'cache.rs').read_text()

def proefopdracht(programma,test,lokaal,args):
    return [str(programma)]+([]if test else [str(lokaal)]+args)

def controleer_regressies(tekst):
    namen=["vormen_mutaties_en_sterke_eigendom", "nul_kleine_en_volle_grens_blijven_exact", "twee_eigenaren_mutaties_en_externe_updates_blijven_exact"]
    if "3 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out" not in tekst or any(n+" ... ok" not in tekst for n in namen):
        raise RuntimeError("De drie vereiste Rust-proeven zijn niet volledig uitgevoerd")

def main():
    assert sha(BRON)==BRON_SHA,'Productie-encoder wijkt af van de gecontroleerde referentie'
    ref,kandidaat=genereer(BRON.read_text())
    bron=REPO/'native/onderzoek/writer-deterministische-sortering/.local/encoderbron.bin'
    assert sha(bron)=='abf6c78274a0154f6d3777b4a3953e387a41e7816eda0eee68e6089ffc8a5d55','Andere eigen proefbron'
    bestanden={'referentie.rs':ref.encode(),'kandidaat.rs':kandidaat.encode(),'bron.bin':bron.read_bytes()}
    LOKAAL.mkdir(exist_ok=True)
    for naam,data in bestanden.items():
        p=LOKAAL/naam
        if p.exists(): assert p.read_bytes()==data,'Bestaand bewijs niet overschrijven: '+naam
        else:p.write_bytes(data)
    # Iedere uitvoering krijgt een nieuwe map: ook afkeuringen blijven bestaan.
    nr=1
    while (LOKAAL/str(nr)).exists():nr+=1
    uit=LOKAAL/str(nr);uit.mkdir()
    for p in [ROOT/'cache.rs',ROOT/'proef.rs',ROOT/'uitvoeren.py']:(uit/p.name).write_bytes(p.read_bytes())
    env=os.environ.copy();env['PATH']=str(Path.home()/'.cargo/bin')+':'+env['PATH']
    deps=REPO/'native/onderzoek/writer-deterministische-sortering/.local/target/release/deps'
    args=['rustc','-O','--edition=2024',str(ROOT/'proef.rs'),'-L','dependency='+str(deps)]
    for naam in ['yrs','serde_json','docx_edit']:
        libs=list(deps.glob('lib'+naam+'*.rlib'));assert len(libs)==1,'Geen unieke bibliotheek: '+naam
        args+=['--extern',naam+'='+str(libs[0])]
    bewijs={'schema':1,'productiebron_sha256':sha(BRON),'bestanden':{str(p.relative_to(REPO)):sha(p) for p in [ROOT/'cache.rs',ROOT/'proef.rs',ROOT/'uitvoeren.py',*map(lambda n:LOKAAL/n,bestanden)]},'bibliotheken':{str(p.relative_to(REPO)):sha(p)for naam in ['yrs','serde_json','docx_edit']for p in deps.glob('lib'+naam+'*.rlib')}}
    for test in [True,False]:
        naam='regressies'if test else'meting'
        programma=uit/naam
        with (uit/(naam+'-bouw.log')).open('w')as log:
            r=subprocess.run(args+(['--test']if test else[])+['-o',str(programma)],env=env,stdout=log,stderr=subprocess.STDOUT)
        bewijs[naam]={'bouwcode':r.returncode}
        if r.returncode==0:
            with (uit/(naam+'.jsonl')).open('w')as log:r=subprocess.run(proefopdracht(programma,test,LOKAAL,sys.argv[1:]),stdout=log,stderr=subprocess.STDOUT)
            bewijs[naam].update(exitcode=r.returncode,elf_sha256=sha(programma))
            if test and r.returncode==0:controleer_regressies((uit/(naam+'.jsonl')).read_text())
        if r.returncode:break
    (uit/'uitkomst.json').write_text(json.dumps(bewijs,indent=2)+'\n')
    print(uit);print(json.dumps({k:v for k,v in bewijs.items()if k in ['regressies','meting']}))
    raise SystemExit(r.returncode)
if __name__=='__main__':main()
