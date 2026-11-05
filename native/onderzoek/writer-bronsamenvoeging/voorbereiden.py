"""Vergelijk binaire bronsamenvoeging zonder productcode of eerdere proeven te wijzigen."""
from pathlib import Path
import hashlib
import importlib.util
import json
import shutil

ROOT = Path(__file__).resolve().parent
REFERENTIE = ROOT.parent/'writer-invoerfasen'
LOKAAL = ROOT/'.local'
BASIS_ELF = '1949bb9246b9d30ebc5999d9036f73a058bea02d4dc941236dc8e92ed8451da1'

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()

def samenvoegcode(s):
    oud = '    let snapshot = doc.encode_state_as_update_v1();'
    nieuw = '''    let snapshot = if let Some(base) = base {
        yrs::merge_updates_v1([base, update]).map_err(|e|ongeldig(e.to_string()))?
    } else { update.to_vec() };'''
    if s.count(oud) != 1: raise RuntimeError('Bronanker voor samenvoeging gewijzigd')
    return s.replace(oud, nieuw, 1)

def bereid():
    verwacht = json.loads((ROOT/'bron.json').read_text())
    for naam, h in verwacht.items():
        if sha(REFERENTIE/naam) != h: raise RuntimeError('Andere referentiebron: '+naam)
    spec = importlib.util.spec_from_file_location('invoerfasenvoorbereiding', REFERENTIE/'voorbereiden.py')
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    module.bereid()  # Verifieert ook alle oorspronkelijke productie- en meetkopieën.
    basis = REFERENTIE/'.local/basis/office-writer-invoerprofiel'
    if sha(basis) != BASIS_ELF: raise RuntimeError('Andere bewaarde referentie-ELF')
    if (LOKAAL/'bronnen.json').exists():
        bewijs = json.loads((LOKAAL/'bronnen.json').read_text())
        for naam, h in bewijs['bestanden'].items():
            if sha(LOKAAL/naam) != h: raise RuntimeError('Bestaande samenvoegproef gewijzigd: '+naam)
        print('Bestaande samenvoegproef exact gecontroleerd; niets vervangen.')
        return
    if LOKAAL.exists(): raise RuntimeError('Onvolledige proefmap behouden; niet overschrijven')
    (LOKAAL/'basis').mkdir(parents=True)
    shutil.copy2(basis, LOKAAL/'basis/office-writer-invoerprofiel')
    gemeten = LOKAAL/'gemeten'; gemeten.mkdir()
    # Alleen gecontroleerde bibliotheken kopiëren; geen targets of eerdere binaries.
    shutil.copytree(REFERENTIE/'.local/gemeten/vendor', gemeten/'vendor')
    p = gemeten/'vendor/docx-edit/src/clipboard_batch.rs'
    p.write_text(samenvoegcode(p.read_text()))
    manifest = (REFERENTIE/'.local/gemeten/Cargo.toml').read_text()
    anker = 'path = "../../src/main.rs"'
    if manifest.count(anker) != 1: raise RuntimeError('Ander proefmanifest')
    (gemeten/'Cargo.toml').write_text(manifest.replace(anker, 'path = '+json.dumps(str(REFERENTIE/'src/main.rs')), 1))
    shutil.copy2(REFERENTIE/'Cargo.lock', gemeten/'Cargo.lock')
    controle = (REFERENTIE/'controleer.mjs').read_text()
    anker = 'ROOT=dirname(fileURLToPath(import.meta.url))'
    if controle.count(anker) != 1: raise RuntimeError('Andere gegevensproef')
    # Alleen het pad naar de twee proefbinaries wijzigen, alle beweringen behouden.
    (LOKAAL/'controleer.mjs').write_text(controle.replace(anker, 'ROOT='+json.dumps(str(ROOT)), 1))
    bewijs = {'schema':1, 'basis_elf':BASIS_ELF, 'referentiebronnen':verwacht,
              'verschil':'Alleen snapshotserialisatie vervangen door merge_updates_v1 van de bevestigde bronbytes en update. Alle import-/vector-/cache-/grenscontroles behouden; de negentien bestaande meetregels blijven staan.',
              'bestanden':{str(p.relative_to(LOKAAL)):sha(p) for p in LOKAAL.rglob('*') if p.is_file()}}
    (LOKAAL/'bronnen.json').write_text(json.dumps(bewijs, ensure_ascii=False, indent=2)+'\n')
    print('Samenvoegkopie voorbereid; oorspronkelijke app en proefbronnen behouden.')

if __name__ == '__main__': bereid()
