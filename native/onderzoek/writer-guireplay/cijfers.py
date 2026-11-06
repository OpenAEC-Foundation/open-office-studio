"""Maak en bouw uitsluitend een aparte tellerversie van de behouden replicacache."""
from pathlib import Path
import hashlib,json,os,shutil,subprocess,time
REPO=Path(__file__).resolve().parents[3];ROOT=Path(__file__).resolve().parent
UIT=REPO/'.local/doorwerk-2026-11-06/guireplay/cijfers'
OUD=REPO/'native/onderzoek/writer-replicacache/.local'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def vervang(s,a,b):
    if s.count(a)!=1:raise RuntimeError('Gewijzigd bronanker: '+a[:80])
    return s.replace(a,b,1)
def main():
    for n,h in json.loads((OUD/'bronnen.json').read_text())['bestanden'].items():
        if sha(OUD/n)!=h:raise RuntimeError('Bewaarde replicabron gewijzigd: '+n)
    UIT.mkdir(exist_ok=False)
    bron=UIT/'bron';shutil.copytree(OUD/'gemeten',bron)
    bestanden={str(p.relative_to(bron)):sha(p)for p in bron.rglob('*')if p.is_file()}
    p=bron/'vendor/docx-edit/src/deterministic.rs';s=p.read_text();p.write_text(vervang(s,'impl WaardeCache { pub(crate) fn bytes(&self)->usize {self.gebruikt} }','impl WaardeCache { pub(crate) fn bytes(&self)->usize {self.gebruikt} pub(crate) fn cijfers(&self)->(usize,usize,usize,usize) {(self.gebruikt,self.grens,self.treffers,self.missers)} }'))
    p=bron/'vendor/docx-edit/src/clipboard_batch.rs';s=p.read_text()
    s=vervang(s,'    let snapshot = doc.encode_state_cached_v1(&mut encoding_cache);','    let (_,_,voor_treffers,voor_missers)=encoding_cache.cijfers();\n    let snapshot = doc.encode_state_cached_v1(&mut encoding_cache);\n    let (gewicht,grens,treffers,missers)=encoding_cache.cijfers();')
    s=vervang(s,'"delta_bytes":batch.update.len()}','"delta_bytes":batch.update.len(),"encoder":{"gewicht":gewicht,"grens":grens,"treffers":treffers,"missers":missers,"nieuwe_treffers":treffers-voor_treffers,"nieuwe_missers":missers-voor_missers}}')
    p.write_text(s)
    wijzigingen={n:sha(bron/n)for n,h in bestanden.items()if sha(bron/n)!=h}
    assert set(wijzigingen)=={'vendor/docx-edit/src/deterministic.rs','vendor/docx-edit/src/clipboard_batch.rs'}
    (UIT/'bronnen.json').write_text(json.dumps({'oorspronkelijk':bestanden,'gewijzigd':wijzigingen},indent=2)+'\n')
    shutil.copytree(OUD/'target',UIT/'target',symlinks=True)
    env=os.environ.copy();env['PATH']=str(Path.home()/'.cargo/bin')+':'+env['PATH'];env['CARGO_TARGET_DIR']=str(UIT/'target')
    cmd=['cargo','build','--release','--locked','--manifest-path',str(bron/'Cargo.toml')];begin=time.monotonic()
    with (UIT/'bouwen.log').open('w')as log:p=subprocess.run(cmd,env=env,cwd=REPO,stdout=log,stderr=subprocess.STDOUT)
    r={'code':p.returncode,'seconden':time.monotonic()-begin,'opdracht':cmd,'patchbestanden':wijzigingen}
    if p.returncode==0:
        exe=UIT/'office-writer-invoerprofiel';shutil.copy2(UIT/'target/release/office-writer-invoerprofiel',exe);r.update(programma=str(exe),programma_sha256=sha(exe))
        assert r['programma_sha256']!='8ca9e1882b031707c22b64588ab43951375a9e547701e00fb54e68549ca9a0c3'
    (UIT/'bouwen.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r),flush=True);raise SystemExit(p.returncode)
if __name__=='__main__':main()
