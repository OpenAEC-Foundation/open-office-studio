"""Maak een afzonderlijke desktopkandidaat zonder de bruikbare checkout te wijzigen."""
from pathlib import Path
import hashlib,importlib.util,json,os,subprocess,shutil
ROOT=Path(__file__).resolve().parent
REPO=ROOT.parents[2]
LOKAAL=REPO/'.local/doorwerk-2026-11-05/desktopcache'
COMMIT='c9118b611ce440d229710cda9a5a5ee71c652001'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def bereid():
    for n,h in json.loads((ROOT/'bron.json').read_text()).items():
        if sha(REPO/n)!=h:raise RuntimeError('Andere proefbron: '+n)
    if (LOKAAL/'bronnen.json').exists():
        m=json.loads((LOKAAL/'bronnen.json').read_text())
        for n,h in m['gewijzigd'].items():
            if sha(LOKAAL/'bron'/n)!=h:raise RuntimeError('Bestaande kandidaat gewijzigd: '+n)
        print('Bestaande desktopkandidaat gecontroleerd.');return
    if LOKAAL.exists():raise RuntimeError('Onvolledige kandidaat behouden; niet overschrijven')
    bron=LOKAAL/'bron';bron.mkdir(parents=True)
    p=subprocess.Popen(['git','archive','--format=tar',COMMIT],cwd=REPO,stdout=subprocess.PIPE)
    try:subprocess.run(['tar','-xf','-','-C',str(bron)],stdin=p.stdout,check=True)
    finally:p.stdout.close()
    if p.wait():raise RuntimeError('Bronarchief mislukt')
    spec=importlib.util.spec_from_file_location('replicacache',REPO/'native/onderzoek/writer-replicacache/voorbereiden.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
    gewijzigd={}
    def schrijf(n,s):
        p=bron/n;p.write_text(s);gewijzigd[n]=sha(p)
    n='native/vendor/docx-edit/src/deterministic.rs';schrijf(n,m.encodercode((bron/n).read_text(),(bron/'native/onderzoek/writer-encodercache/cache.rs').read_text()))
    n='native/vendor/docx-edit/src/clipboard_batch.rs';schrijf(n,m.replicacode((bron/n).read_text()))
    n='native/crates/office-writer-plakken/src/bronspiegel.rs';schrijf(n,m.spiegelcode((bron/n).read_text()))
    n='native/vendor/docx-edit/src/lib.rs';s=(bron/n).read_text();anker='    pub fn encode_state_vector_v1(&self) -> Vec<u8> {'
    schrijf(n,m.vervang(s,anker,'''    pub(crate) fn encode_state_cached_v1(&self, cache:&mut deterministic::WaardeCache)->Vec<u8> {
        deterministic::encode_state_cached_v1(&self.doc.transact(),cache)
    }

'''+anker))
    env=os.environ.copy();env['PATH']=str(Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin')+':'+env['PATH']
    subprocess.run(['node','scripts/weekversie.mjs','2026-11-05','50'],cwd=bron,env=env,check=True)
    for n in ['native/Cargo.toml','native/Cargo.lock','src-tauri/Cargo.lock']:
        p=bron/n;s=p.read_text();assert '2026.45.0-alpha.57'in s;schrijf(n,s.replace('2026.45.0-alpha.57','2026.45.0-alpha.58'))
    for n in ['package.json','versie.json','src-tauri/tauri.conf.json','src-tauri/Cargo.toml','src-tauri/Cargo.lock','apps/database-studio/src-tauri/tauri.conf.json','apps/database-studio/src-tauri/Cargo.toml','apps/database-studio/src-tauri/Cargo.lock']:gewijzigd[n]=sha(bron/n)
    (bron/'node_modules').symlink_to(REPO/'node_modules',target_is_directory=True)
    # Afzonderlijke kopie van de warme Cargo-cache; oorspronkelijke binaries blijven behouden.
    target=LOKAAL/'target';target.mkdir()
    subprocess.run(['cp','-a','--reflink=auto',str(REPO/'src-tauri/target/release'),str(target/'release')],check=True)
    # Bundels zijn geen bouwafhankelijkheid. Ze blijven bij de oorspronkelijke referentie.
    # Niet verwijderen: de eigen cachekopie wordt volledig behouden.
    bewijs={'schema':1,'basis_commit':COMMIT,'versie':'2026.45.50','nativeversie':'2026.45.0-alpha.58','gewijzigd':gewijzigd,'referentie_sha256':sha(REPO/'.local/doorwerk-2026-11-04/incrementele-invoer/open-office-studio-45.49-meting'),'target':'Afzonderlijke kopie, geen gedeelde beschrijfbare Cargo-target.'}
    (LOKAAL/'bronnen.json').write_text(json.dumps(bewijs,indent=2)+'\n');print('Desktopkandidaat voorbereid; bruikbare checkout ongewijzigd.')
if __name__=='__main__':bereid()
