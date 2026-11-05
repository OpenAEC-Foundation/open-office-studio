#!/usr/bin/env python3
"""Maak twee bronvaste kernkopieën; uitsluitend de gemeten kopie krijgt klokken."""
from pathlib import Path
import hashlib, json, shutil, tomllib
ROOT = Path(__file__).resolve().parent
NATIVE = ROOT.parents[1]
REPO = NATIVE.parent
LOKAAL = ROOT / '.local'

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def vervang(s, oud, nieuw):
    if s.count(oud) != 1: raise RuntimeError('Meetanker gewijzigd: ' + oud[:90])
    return s.replace(oud, nieuw, 1)

def meetcode(s):
    a=s.index('pub fn prepare_confirmed_clipboard_fragment_cached(')
    b=s.index('\nfn ongeldig(',a)
    deel=s[a:b]
    begin='''    let mut _openaec_laatst = std::time::Instant::now();
    let mut _openaec_tijden = Vec::new();
    let mut _openaec_stap = |naam: &str| { let nu=std::time::Instant::now(); _openaec_tijden.push((naam.to_owned(),nu.duration_since(_openaec_laatst).as_nanos() as u64)); _openaec_laatst=nu; };
'''
    deel=vervang(deel,'    let expected =',begin+'    let expected =')
    for oud,naam in [('    let cached = cached.filter','dekoderen'),('    let reused = cached.is_some();','cache'),('    let vector = doc.encode_state_vector_v1();','importeren'),('    let snapshot = doc.encode_state_as_update_v1();','vector'),('    let batch = prepare_clipboard_in_doc','snapshot'),('    let replica = PreparedClipboardReplica','bewerking')]:
        deel=vervang(deel,oud,f'    _openaec_stap("{naam}");\n'+oud)
    deel=vervang(deel,'    Ok(ConfirmedClipboardBatchResult', '''    _openaec_stap("replica");
    eprintln!("{}",serde_json::json!({"soort":"bron","hergebruikt":reused,"fasen_ns":_openaec_tijden,"snapshot_bytes":snapshot.len(),"delta_bytes":batch.update.len()}));
    Ok(ConfirmedClipboardBatchResult''')
    s=s[:a]+deel+s[b:]
    a=s.index('fn prepare_clipboard_in_doc(');deel=s[a:]
    deel=vervang(deel,'    let base_vector=',begin+'    let base_vector=')
    for oud,naam in [('    {\n        let mut txn=','plaatsen'),('    let caret=doc.loc_at','mutatie'),('    let update=doc.encode_diff_v1','cursor')]:
        deel=vervang(deel,oud,f'    _openaec_stap("{naam}");\n'+oud)
    deel=vervang(deel,'    Ok(ClipboardBatchResult', '''    _openaec_stap("delta");
    eprintln!("{}",serde_json::json!({"soort":"invoeging","fasen_ns":_openaec_tijden}));
    Ok(ClipboardBatchResult''')
    return s[:a]+deel

def bereid():
    LOKAAL.mkdir(exist_ok=True)
    verwacht=json.loads((ROOT/'bron.json').read_text())
    for n in verwacht:
        if sha(REPO/n)!=verwacht[n]: raise RuntimeError('Andere appbron: '+n)
    if (LOKAAL/'bronnen.json').exists():
        bewijs=json.loads((LOKAAL/'bronnen.json').read_text())
        for n,h in bewijs['bronnen'].items():
            if sha(REPO/n)!=h: raise RuntimeError('Oorspronkelijke bron gewijzigd: '+n)
        for naam,v in bewijs['varianten'].items():
            doel=LOKAAL/naam
            if sha(doel/'Cargo.toml')!=v['manifest_sha256']: raise RuntimeError('Proefmanifest gewijzigd: '+naam)
            for n,h in v['bestanden'].items():
                if sha(doel/n)!=h: raise RuntimeError('Proefkopie gewijzigd: '+naam+'/'+n)
        print('Bestaande bron- en meetkopieën exact gecontroleerd; geen bestanden vervangen.')
        return
    werkruimte=tomllib.loads((NATIVE/'Cargo.toml').read_text())['workspace']
    bewijs={'bronnen':{},'varianten':{}}
    for naam in ['basis','gemeten']:
        doel=LOKAAL/naam
        if doel.exists(): raise RuntimeError('Bestaande proefkopie behouden; kies een afzonderlijke uitvoermap: '+str(doel))
        doel.mkdir()
        for bron,rel in [(NATIVE/'vendor/docx-edit','vendor/docx-edit'),(NATIVE/'crates/office-writer-plakken','vendor/office-writer-plakken')]:
            shutil.copytree(bron,doel/rel)
            for p in bron.rglob('*'):
                if p.is_file(): bewijs['bronnen'][str(p.relative_to(REPO))]=sha(p)
        manifest=doel/'vendor/office-writer-plakken/Cargo.toml';s=manifest.read_text()
        # Alleen de workspace-erfenis concretiseren; geen afhankelijkheden wijzigen.
        for k,v in werkruimte['package'].items():
            anker=k+'.workspace = true'
            if anker in s:s=s.replace(anker,k+' = '+json.dumps(v))
        for k,v in werkruimte['dependencies'].items():
            anker=k+'.workspace = true'
            if anker in s:
                if isinstance(v,str):toml=json.dumps(v)
                else:toml='{ '+', '.join(n+' = '+json.dumps(x)for n,x in v.items())+' }'
                s=s.replace(anker,k+' = '+toml)
        if '.workspace = true'in s: raise RuntimeError('Onbekende workspace-erfenis')
        manifest.write_text(s)
        if naam=='gemeten':
            p=doel/'vendor/docx-edit/src/clipboard_batch.rs';p.write_text(meetcode(p.read_text()))
        cargo='''[package]
name = "office-writer-invoerprofiel"
version = "0.1.0"
edition = "2024"
publish = false
[workspace]
[[bin]]
name = "office-writer-invoerprofiel"
path = "../../src/main.rs"
[dependencies]
office-writer-plakken = { path = "vendor/office-writer-plakken" }
serde_json = { version = "1", features = ["raw_value", "float_roundtrip"] }
[profile.release]
opt-level = 3
lto = "thin"
codegen-units = 8
[patch.crates-io]
betteroffice-docx-edit = { path = "vendor/docx-edit" }
'''+f'betteroffice-docx-parse = {{ path = {json.dumps(str(NATIVE/"vendor/docx-parse"))} }}\nyrs = {{ path = {json.dumps(str(NATIVE/"vendor/yrs"))} }}\n'
        (doel/'Cargo.toml').write_text(cargo)
        shutil.copy2(ROOT/'Cargo.lock',doel/'Cargo.lock')
        bewijs['varianten'][naam]={'bestanden':{str(p.relative_to(doel)):sha(p)for p in (doel/'vendor').rglob('*')if p.is_file()},'manifest_sha256':sha(doel/'Cargo.toml')}
    (LOKAAL/'bronnen.json').write_text(json.dumps(bewijs,indent=2)+'\n')
    print('Twee gecontroleerde kopieën voorbereid; appbronnen behouden.')
if __name__=='__main__':bereid()
