#!/usr/bin/env python3
"""Controleer native pakketbron en nul-tolerantiebeelden over drie CI-platforms."""
from pathlib import Path, PurePosixPath
import argparse
import hashlib
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import tomllib
import zipfile

PLATFORMEN = {'Linux': 'ELF64 x86_64', 'Windows': 'PE64 AMD64', 'macOS': 'Mach-O64 ARM64'}

def bestandhash(pad):
    with pad.open('rb') as bestand:
        return hashlib.file_digest(bestand, 'sha256').hexdigest()

def architectuur(bytes, platform):
    if platform == 'Linux':
        return bytes[:4] == b'\x7fELF' and bytes[4:5] == b'\x02' and int.from_bytes(bytes[18:20], 'little') == 62
    if platform == 'Windows':
        if bytes[:2] != b'MZ' or len(bytes) < 64:
            return False
        pe = int.from_bytes(bytes[60:64], 'little')
        return bytes[pe:pe+4] == b'PE\0\0' and int.from_bytes(bytes[pe+4:pe+6], 'little') == 0x8664
    return bytes[:4] == b'\xcf\xfa\xed\xfe' and int.from_bytes(bytes[4:8], 'little') == 0x100000c

def uniek(paden, omschrijving):
    paden = list(paden)
    assert len(paden) == 1, f'{omschrijving}: verwacht één bestand/map, gevonden {len(paden)}'
    return paden[0]

def controleer(args, rapport):
    versie = tomllib.loads((args.bron/'native/Cargo.toml').read_text(encoding='utf-8'))['workspace']['package']['version']
    rapport['versie'] = versie
    spec = importlib.util.spec_from_file_location('pakketcontrole', Path(__file__).with_name('controleer-pakket.py'))
    pakketcontrole = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(pakketcontrole)
    beelden = {}
    for platform, soort in PLATFORMEN.items():
        map = args.artefacten/f'native-rust-{platform}'
        pakket = uniek(map.glob('*.zip'), platform+' pakket')
        assert bestandhash(pakket) == pakket.with_suffix('.sha256').read_text(encoding='utf-8').split()[0], f'{platform}: pakkethash wijkt af'
        regressie = json.loads((args.artefacten/f'native-bronregressies-{platform}'/'bronregressie.json').read_text(encoding='utf-8'))
        assert regressie['geslaagd'] and regressie['bouwronde'] == args.bouwronde, f'{platform}: bronregressie of bouwronde wijkt af'
        assert regressie['geteste_checkout'] == args.commit, f'{platform}: checkout verschilt'
        assert regressie['meting']['status'] == 'geslaagd' and regressie['meting']['native_versie'] == versie
        assert regressie['gelezen_bron_sha256'] == '32b036e66eb701f37e8b64a3c491bf1d6234be3cee1e6e36d2e8435f4516cc94'
        with tempfile.TemporaryDirectory(prefix='office-platformpakket-') as tijdelijk:
            uitgepakt = Path(tijdelijk)
            with zipfile.ZipFile(pakket) as z:
                assert z.testzip() is None, f'{platform}: ZIP-CRC wijkt af'
                for naam in z.namelist():
                    pad = PurePosixPath(naam)
                    assert not pad.is_absolute() and '..' not in pad.parts and '\\' not in naam and ':' not in pad.parts[0], 'Onveilig archiefpad'
                z.extractall(uitgepakt)
            inhoud = uniek(uitgepakt.iterdir(), platform+' pakketwortel')
            aantal = pakketcontrole.controleer_bronbytes(inhoud/'bron', args.bron)
            programmas = []
            for naam in ['open-office-studio-native', 'controleer-bestand']:
                pad = inhoud/(naam+('.exe' if platform == 'Windows' else ''))
                assert architectuur(pad.read_bytes(), platform), f'{platform}: onjuiste programma-architectuur'
                programmas.append({'bestand': pad.name, 'architectuur': soort, 'sha256': bestandhash(pad)})
            assert regressie['programma'] == f'Open Office native bestandscontrole {versie} (release)'
            assert regressie['programma_sha256'] == programmas[1]['sha256'], f'{platform}: bronregressie hoort bij een andere binary'
        schermmap = uniek((args.artefacten/f'native-controle-{platform}').glob('schermen-*'), platform+' schermmap')
        namen = {p.name for p in schermmap.glob('*.png')}
        assert len(namen) == args.verwachte_schermen, f'{platform}: verwacht {args.verwachte_schermen} schermen, gevonden {len(namen)}'
        beelden[platform] = (schermmap, namen)
        rapport['pakketten'].append({'platform': platform, 'pakket': pakket.name, 'sha256': bestandhash(pakket), 'zip_crc_geldig': True, 'bronbestanden': aantal, 'alle_bronbytes_gelijk': True, 'programmas': programmas, 'bronregressie_met_verpakte_controleur_geslaagd': True})
        print(f'{platform}: {aantal} bronbestanden bytegelijk; beide programmaheaders en bronregressie gecontroleerd.', flush=True)
    referentie, namen = beelden['Linux']
    for platform, (schermmap, platformnamen) in beelden.items():
        assert platformnamen == namen, f'{platform}: schermnamen verschillen'
        if platform == 'Linux':
            continue
        for naam in sorted(namen):
            uit = args.uitvoer.parent/'beelden'/platform/Path(naam).stem
            result = subprocess.run([sys.executable, str(Path(__file__).with_name('vergelijk-schermen.py')), str(referentie/naam), str(schermmap/naam), '--uitvoer', str(uit), '--kanaalverschil', '0', '--max-afwijkende-pixels', '0'], capture_output=True, text=True)
            pad = uit/'rapport.json'
            meting = json.loads(pad.read_text(encoding='utf-8')) if pad.is_file() else {'geslaagd': False, 'reden': result.stderr[-2000:]}
            meting['referentie'] = str((referentie/naam).relative_to(args.artefacten))
            meting['native'] = str((schermmap/naam).relative_to(args.artefacten))
            rapport['beelden'].append({'platform': platform, 'beeld': naam, **meting})
            assert result.returncode == 0 and meting['geslaagd'] and meting['afwijkende_pixels'] == 0 and meting['kanaalverschil_toegestaan'] == 0 and meting['max_afwijkende_pixels'] == 0, f'{platform}/{naam}: beeldvergelijking mislukt'
        print(f'{platform}: {len(namen)} volledige native PNG-beelden pixelgelijk aan Linux.', flush=True)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--bron', type=Path, default=Path(__file__).resolve().parents[2])
    p.add_argument('--artefacten', type=Path, required=True)
    p.add_argument('--uitvoer', type=Path, required=True)
    p.add_argument('--verwachte-schermen', type=int, required=True)
    p.add_argument('--bouwronde', default=os.environ.get('GITHUB_RUN_ID'), required=not os.environ.get('GITHUB_RUN_ID'))
    p.add_argument('--commit', default=os.environ.get('GITHUB_SHA'), required=not os.environ.get('GITHUB_SHA'))
    args = p.parse_args()
    if args.verwachte_schermen < 1:
        p.error('Er moet minstens één werkelijk scherm worden verwacht')
    args.bron = args.bron.resolve()
    args.artefacten = args.artefacten.resolve()
    args.uitvoer = args.uitvoer.resolve()
    args.uitvoer.parent.mkdir(parents=True, exist_ok=True)
    rapport = {'geslaagd': False, 'bouwronde': args.bouwronde, 'geteste_checkout': args.commit, 'omvang': 'Alle verpakte bronbytes, binaire architectuur en vastgepinde bronregressie; volledige native PNG-beelden met nul tolerantie tussen CI-platforms. Geen vergelijking met de bestaande suite, fysieke GUI, schone installatie of binaire reproduceerbaarheid. Programmaversies worden vooraf in de eigen native matrixjobs uitgevoerd.', 'pakketten': [], 'beelden': []}
    try:
        controleer(args, rapport)
        rapport['geslaagd'] = True
    except Exception as fout:
        rapport['fout'] = str(fout)
        print(str(fout), file=sys.stderr)
    args.uitvoer.write_text(json.dumps(rapport, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    raise SystemExit(0 if rapport['geslaagd'] else 1)

if __name__ == '__main__':
    main()
