"""Voer de canonieke gouden proef uit op de echte encoderfuncties, zonder productmutatie."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import subprocess
import tempfile

REPO = Path(__file__).resolve().parents[2]
NAMEN = ('yrs', 'serde_json', 'sha2')


def bibliotheken(bestand, lokaal=False):
    if lokaal:
        gegevens = json.loads(bestand.read_text(encoding='utf-8'))
        libs = {naam: Path(gegevens['pinnen'][naam]) for naam in NAMEN}
        for pad in libs.values():
            if hashlib.sha256(pad.read_bytes()).hexdigest() != gegevens['sha256'][str(pad)]:
                raise RuntimeError('Lokale encoderbibliotheek wijkt af van de vastgelegde hash')
        return libs
    gevonden = {naam: set() for naam in NAMEN}
    versies = {'yrs': '0.27.4', 'sha2': '0.10.9'}
    for regel in bestand.read_text(encoding='utf-8').splitlines():
        bericht = json.loads(regel)
        naam = bericht.get('target', {}).get('name')
        if bericht.get('reason') != 'compiler-artifact' or naam not in gevonden:
            continue
        versie = versies.get(naam)
        package = bericht['package_id']
        if versie and not (package.endswith('@' + versie) or package.endswith('#' + versie)):
            continue
        gevonden[naam].update(Path(p) for p in bericht['filenames'] if p.endswith('.rlib'))
    if any(len(paden) != 1 for paden in gevonden.values()):
        raise RuntimeError('Ontbrekende of dubbelzinnige encoderbibliotheek: ' + str(gevonden))
    return {naam: next(iter(paden)) for naam, paden in gevonden.items()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    keuze = parser.add_mutually_exclusive_group(required=True)
    keuze.add_argument('--artifacten', type=Path)
    keuze.add_argument('--bibliotheken', type=Path, help='Alleen lokale herhaling met vastgelegde bibliotheekhashes.')
    parser.add_argument('--uitvoer', type=Path, required=True)
    args = parser.parse_args()
    libs = bibliotheken(args.bibliotheken or args.artifacten, bool(args.bibliotheken))
    bron = REPO / 'native/vendor/docx-edit/src/deterministic.rs'
    proef = bron.parent / 'deterministic/sorteringproeven.rs'
    tekst = bron.read_text(encoding='utf-8')
    anker = '#[cfg(test)]\nmod tests {'
    if tekst.count(anker) != 1 or tekst.count('mod sorteringproeven;') != 1:
        raise RuntimeError('De encoder-/testgrens is gewijzigd; proef niet uitgevoerd')
    # Alle productiecode vóór de bestaande algemene upstreamtestmodule blijft exact gelijk.
    prefix = tekst.split(anker)[0]
    prefix = prefix.replace('mod sorteringproeven;', '#[path=' + json.dumps(str(proef), ensure_ascii=False) + ']\nmod sorteringproeven;')
    args.uitvoer.mkdir(parents=True, exist_ok=False)
    with tempfile.TemporaryDirectory(prefix='encoder-bytebehoud-') as tmp:
        root = Path(tmp)
        kopie = root / 'controle.rs'
        kopie.write_text(prefix, encoding='utf-8')
        exe = root / ('controle.exe' if os.name == 'nt' else 'controle')
        cmd = ['rustc', '--test', '--edition=2024', '-C', 'opt-level=3', '-L', 'dependency=' + str(libs['yrs'].parent), str(kopie), '-o', str(exe)]
        for naam, pad in libs.items():
            cmd += ['--extern', naam + '=' + str(pad)]
        with (args.uitvoer / 'bouw.log').open('w') as log:
            subprocess.run(cmd, stdout=log, stderr=subprocess.STDOUT, check=True, timeout=180)
        result = subprocess.run([str(exe), '--nocapture', '--test-threads=1'], text=True, encoding='utf-8', stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=60)
        (args.uitvoer / 'proef.log').write_text(result.stdout, encoding='utf-8')
        result.check_returncode()
        if '1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out' not in result.stdout or 'sleutelvolgorde_behoudt_de_vastgelegde_any_en_json_bytes ... ok' not in result.stdout:
            raise RuntimeError('De vereiste gouden proef is niet volledig uitgevoerd')
    gegevens = {'geslaagd': True, 'gevallen': 704, 'bron_sha256': hashlib.sha256(bron.read_bytes()).hexdigest(), 'proef_sha256': hashlib.sha256(proef.read_bytes()).hexdigest(), 'bibliotheken': {naam: {'pad': str(pad), 'sha256': hashlib.sha256(pad.read_bytes()).hexdigest()} for naam, pad in libs.items()}, 'grens': 'Alle echte encoderfuncties plus de gouden test; algemene upstreamtestmodule niet gecompileerd. Geen volledige Rust-/app-/platformacceptatie.'}
    (args.uitvoer / 'resultaat.json').write_text(json.dumps(gegevens, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Canonieke bytebehoudproef: 704 gevallen geslaagd, niets gefilterd.')


if __name__ == '__main__':
    main()
