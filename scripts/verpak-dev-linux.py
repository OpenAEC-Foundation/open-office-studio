#!/usr/bin/env python3
"""Verpak de gecontroleerde dev-AppImage met bronrevisie en startinstructies."""
import hashlib
import json
from pathlib import Path
import runpy
import subprocess
import tarfile
import tempfile


def main():
    versie = json.loads(Path('package.json').read_text())['version']
    bron = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
    configuratie = json.loads(Path('src-tauri/tauri.dev.conf.json').read_text())
    assert configuratie['identifier'] == 'org.openaec.office-studio.dev'
    assert configuratie['bundle']['createUpdaterArtifacts'] is False
    pakketten = list(Path('src-tauri/target/release/bundle/appimage').glob('*.AppImage'))
    assert len(pakketten) == 1, f'Verwacht één AppImage, gevonden: {pakketten}'
    pakket = pakketten[0].resolve()
    controle = runpy.run_path('scripts/controleer-installers.py')
    with tempfile.TemporaryDirectory(prefix='office-dev-pakketcontrole-') as tijdelijk:
        controles = controle['appimage'](pakket, Path(tijdelijk) / 'uitgepakt')
    with pakket.open('rb') as bestand:
        checksum = hashlib.file_digest(bestand, 'sha256').hexdigest()
    mapnaam = f'Open-Office-Studio-Dev-{versie}-linux-x86_64-{bron[:7]}'
    uitvoer = Path('dist-dev')
    uitvoer.mkdir(exist_ok=True)
    rapport = {
        'versie': versie, 'bronrevisie': bron, 'platform': 'Linux x86_64',
        'profiel': configuratie['identifier'], 'appimage': pakket.name,
        'sha256': checksum, 'pakketcontroles': controles,
        'controles': ['TypeScript via productiebouw', 'Vitest', 'Rust-desktoptests'],
        'gui_acceptatie': 'Niet volledig gecontroleerd; ontwikkelbuild met bekende Writer-problemen.',
    }
    with tempfile.TemporaryDirectory(prefix='office-dev-download-') as tijdelijk:
        inhoud = Path(tijdelijk) / mapnaam
        inhoud.mkdir()
        (inhoud / 'bouw.json').write_text(json.dumps(rapport, ensure_ascii=False, indent=2) + '\n')
        (inhoud / 'SHA256SUMS').write_text(f'{checksum}  {pakket.name}\n')
        (inhoud / 'LEESMIJ.txt').write_text(
            f'Open Office Studio Dev {versie}\nBronrevisie: {bron}\n\n'
            'Linux x86_64; gebouwd op Ubuntu 22.04.\n'
            'Pak dit tar.gz-bestand uit en start start-dev.sh zonder sudo.\n'
            'Terminal: ./start-dev.sh\n'
            'Zonder FUSE: APPIMAGE_EXTRACT_AND_RUN=1 ./start-dev.sh\n'
            'Ontbrekende systeembibliotheken op Ubuntu/Debian:\n'
            '  sudo apt install libwebkit2gtk-4.1-0 libgtk-3-0 libayatana-appindicator3-1\n\n'
            'De dev-versie gebruikt een eigen profiel (org.openaec.office-studio.dev).\n'
            'Bestanden die je zelf opent en opslaat blijven echte bestanden: test met kopieën.\n'
            'Dit is geen officiële release en geen volledige GUI-goedkeuring.\n'
            'Bekende beperkingen: vertraging bij grote Writer-documenten en workerfouten.\n'
            'Er wordt geen release gepubliceerd en de automatische updater staat uit.\n'
        )
        start = inhoud / 'start-dev.sh'
        start.write_text('#!/bin/sh\nset -eu\ncd -- "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\n'
                         f'exec "./{pakket.name}" "$@"\n')
        start.chmod(0o755)
        archief = uitvoer / f'{mapnaam}.tar.gz'
        with tarfile.open(archief, 'w:gz') as tar:
            tar.add(inhoud, arcname=mapnaam)
            info = tar.gettarinfo(str(pakket), arcname=f'{mapnaam}/{pakket.name}')
            info.mode = 0o755
            with pakket.open('rb') as bestand:
                tar.addfile(info, bestand)
    with archief.open('rb') as bestand:
        digest = hashlib.file_digest(bestand, 'sha256').hexdigest()
    (uitvoer / 'SHA256SUMS').write_text(f'{digest}  {archief.name}\n')
    (uitvoer / 'bouw.json').write_text(json.dumps(rapport, ensure_ascii=False, indent=2) + '\n')
    print(f'Download gereed: {archief}')


if __name__ == '__main__':
    main()
