"""Sluit de encoderproef uitsluitend in een afzonderlijke bevestigde kernkopie aan."""
from pathlib import Path
import hashlib
import importlib.util
import json
import shutil
ROOT=Path(__file__).resolve().parent
REFERENTIE=ROOT.parent/'writer-invoerfasen'
LOKAAL=ROOT/'.local'
REPO=ROOT.parents[2]
BASIS_ELF='1949bb9246b9d30ebc5999d9036f73a058bea02d4dc941236dc8e92ed8451da1'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def vervang(s,a,b):
    if s.count(a)!=1:raise RuntimeError('Bronanker gewijzigd: '+a[:90])
    return s.replace(a,b,1)
def encodercode(s,cache):
    s=vervang(s,'pub(crate) struct DeterministicEncoderV1(EncoderV1);',"pub(crate) struct DeterministicEncoderV1<'a>(EncoderV1, Option<&'a mut WaardeCache>);")
    for a,b in [('impl DeterministicEncoderV1 {',"impl DeterministicEncoderV1<'_> {"),('Self(EncoderV1::new())','Self(EncoderV1::new(),None)'),('impl Write for DeterministicEncoderV1 {',"impl Write for DeterministicEncoderV1<'_> {"),('impl Encoder for DeterministicEncoderV1 {',"impl Encoder for DeterministicEncoderV1<'_> {")]:s=vervang(s,a,b)
    knip=s.index('#[derive(Default)]\nstruct CountingEncoderV1');voor,achter=s[:knip],s[knip:]
    voor=vervang(voor,'        encode_any(any, self);','        if let Some(cache)=self.1.as_mut() {cache.schrijf(any,false,&mut self.0);} else {encode_any(any,self);}')
    voor=vervang(voor,'        self.write_string(&serde_json::to_string(&json_value(any)).unwrap());','        if let Some(cache)=self.1.as_mut() {cache.schrijf(any,true,&mut self.0);} else {self.write_string(&serde_json::to_string(&json_value(any)).unwrap());}')
    cache=cache.split('// De cache kan uitsluitend')[0]
    cache=vervang(cache,'struct WaardeCache {','pub(crate) struct WaardeCache {')
    cache=vervang(cache,'    fn nieuw(grens: usize) -> Self {','    pub(crate) fn nieuw(grens: usize) -> Self {')
    cache+='''
impl WaardeCache { pub(crate) fn bytes(&self)->usize {self.gebruikt} }
pub(crate) fn encode_state_cached_v1<T: ReadTxn>(txn:&T,cache:&mut WaardeCache)->Vec<u8> {
    // De normale route behoudt ook pending updates. De bevestigde invoerroute
    // heeft die hierboven al geweigerd; geen alternatieve samenvoeging.
    if txn.store().pending_update().is_some() || txn.store().pending_ds().is_some() {
        return encode_state_as_update_v1(txn,&StateVector::default());
    }
    let mut encoder=DeterministicEncoderV1(EncoderV1::new(),Some(cache));
    txn.encode_state_as_update(&StateVector::default(),&mut encoder);encoder.to_vec()
}
'''
    return voor+achter+'\n'+cache

def replicacode(s):
    s=vervang(s,'    proposed_update: Vec<u8>,','    proposed_update: Vec<u8>,\n    encoding_cache: crate::deterministic::WaardeCache,')
    s=vervang(s,'pub fn prepare_confirmed_clipboard_fragment(base:', '''impl PreparedClipboardReplica {
    /// Boekhoudgewicht van de objectgebonden encodercache, geen proces-RSS.
    pub fn encoding_cache_bytes(&self)->usize {self.encoding_cache.bytes()}
}
pub fn prepare_confirmed_clipboard_fragment(base:''')
    s=vervang(s,'    let doc = if let Some(c) = cached { c.doc } else {','    let (doc, mut encoding_cache) = if let Some(c) = cached { (c.doc,c.encoding_cache) } else {')
    s=vervang(s,'        doc\n    };','        (doc,crate::deterministic::WaardeCache::nieuw(32*1024*1024))\n    };')
    s=vervang(s,'    let snapshot = doc.encode_state_as_update_v1();','    let snapshot = doc.encode_state_cached_v1(&mut encoding_cache);')
    s=vervang(s,'let replica = PreparedClipboardReplica { doc, client_id,','let replica = PreparedClipboardReplica { doc, encoding_cache, client_id,')
    return s

def spiegelcode(s):
    s=vervang(s,'                0\n            })','                0\n            })\n            .saturating_add(self.voorstel.as_ref().map_or(0,|p|p.encoding_cache_bytes()))')
    return s

def bereid():
    pins=json.loads((ROOT/'bron.json').read_text())
    for n,h in pins.items():
        if sha(REPO/n)!=h:raise RuntimeError('Andere bron: '+n)
    spec=importlib.util.spec_from_file_location('invoerfasen',REFERENTIE/'voorbereiden.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);m.bereid()
    basis=REFERENTIE/'.local/basis/office-writer-invoerprofiel'
    if sha(basis)!=BASIS_ELF:raise RuntimeError('Andere referentie-ELF')
    if (LOKAAL/'bronnen.json').exists():
        for n,h in json.loads((LOKAAL/'bronnen.json').read_text())['bestanden'].items():
            if sha(LOKAAL/n)!=h:raise RuntimeError('Bestaande proef gewijzigd: '+n)
        print('Bestaande replicacachekopie exact gecontroleerd.');return
    if LOKAAL.exists():raise RuntimeError('Onvolledige proefmap behouden')
    (LOKAAL/'basis').mkdir(parents=True);shutil.copy2(basis,LOKAAL/'basis/office-writer-invoerprofiel')
    doel=LOKAAL/'gemeten';doel.mkdir();shutil.copytree(REFERENTIE/'.local/gemeten/vendor',doel/'vendor')
    p=doel/'vendor/docx-edit/src/deterministic.rs';p.write_text(encodercode(p.read_text(),(ROOT.parent/'writer-encodercache/cache.rs').read_text()))
    p=doel/'vendor/docx-edit/src/clipboard_batch.rs';p.write_text(replicacode(p.read_text()))
    p=doel/'vendor/docx-edit/src/lib.rs';s=p.read_text();a='    pub fn encode_state_vector_v1(&self) -> Vec<u8> {'
    p.write_text(vervang(s,a,'''    pub(crate) fn encode_state_cached_v1(&self, cache:&mut deterministic::WaardeCache)->Vec<u8> {
        deterministic::encode_state_cached_v1(&self.doc.transact(),cache)
    }

'''+a))
    p=doel/'vendor/office-writer-plakken/src/bronspiegel.rs';p.write_text(spiegelcode(p.read_text())+'\n'+(ROOT/'cachecontroles.rs').read_text())
    manifest=(REFERENTIE/'.local/gemeten/Cargo.toml').read_text();(doel/'Cargo.toml').write_text(vervang(manifest,'path = "../../src/main.rs"','path = '+json.dumps(str(REFERENTIE/'src/main.rs'))))
    shutil.copy2(REFERENTIE/'Cargo.lock',doel/'Cargo.lock')
    controle=(REFERENTIE/'controleer.mjs').read_text();(LOKAAL/'controleer.mjs').write_text(vervang(controle,'ROOT=dirname(fileURLToPath(import.meta.url))','ROOT='+json.dumps(str(ROOT))))
    bewijs={'schema':1,'basis_elf':BASIS_ELF,'pins':pins,'bestanden':{str(p.relative_to(LOKAAL)):sha(p)for p in LOKAAL.rglob('*')if p.is_file()}}
    (LOKAAL/'bronnen.json').write_text(json.dumps(bewijs,indent=2)+'\n');print('Afzonderlijke replicacachekopie voorbereid; appbronnen behouden.')
if __name__=='__main__':bereid()
