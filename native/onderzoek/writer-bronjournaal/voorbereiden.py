"""Bereid uitsluitend een nieuwe, afzonderlijke onderzoekskopie voor."""
from pathlib import Path
import argparse, hashlib, json, shutil

def bereid(uitvoer):
    lokaal = Path(__file__).resolve().parent
    repo = lokaal.parents[2]
    bron = repo / 'native/vendor/docx-edit'
    pinnen = json.loads((lokaal / 'bron-pinnen.json').read_text())['bronbestanden']
    werkelijk = {str(p.relative_to(bron)): hashlib.sha256(p.read_bytes()).hexdigest() for p in bron.rglob('*.rs')}
    if werkelijk != pinnen:
        raise RuntimeError('Vendorbron wijkt af van de geteste onderzoekspinnen')
    uitvoer = Path(uitvoer)
    if uitvoer.exists():
        raise FileExistsError('De onderzoekskopie bestaat al; niets overschreven')
    uitvoer.mkdir(parents=True)
    kopie = uitvoer / 'docx-edit'
    shutil.copytree(bron, kopie)
    p=kopie/'src/clipboard_batch.rs';p.write_text(p.read_text()+'''\n// Uitsluitend een afzonderlijke onderzoeksbibliotheek; de productroute blijft gelijk.\npub fn prepare_journal_fragment(doc: &EditingDoc, range: &LocRange, fragment: &Value, ctx: &EditCtx) -> OpResult<ClipboardBatchResult> {\n    let fragment: Fragment = serde_json::from_value(fragment.clone()).map_err(|e| ongeldig(e.to_string()))?;\n    if range.start.story != range.end.story { return Err(ongeldig("Bereik loopt over verschillende verhalen")); }\n    prepare_clipboard_in_doc(doc, range, fragment, ctx)\n}\n''');p=kopie/'src/clipboard_batch.rs';p.write_text(p.read_text()+'\npub fn import_journal_source(doc: &EditingDoc, bytes: &[u8]) -> OpResult<()> { doc.apply_verbatim_v1(bytes).map_err(OpError::from) }\n');p=kopie/'src/lib.rs';p.write_text(p.read_text()+'\npub use clipboard_batch::prepare_journal_fragment;\n\npub use clipboard_batch::import_journal_source;\n')

    for naam in ['journaal.rs', 'proef.rs', 'geschiedenis.rs', 'unicode.rs', 'grenzen.rs', 'middelen.rs', 'grote_bron.rs']:
        shutil.copyfile(lokaal / naam, uitvoer / naam)
    return kopie

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--uitvoer', type=Path, required=True)
    args = p.parse_args()
    print(bereid(args.uitvoer))
