#!/usr/bin/env python3
"""Bewaar de aantoonbaar bij een afgekeurde Writer-proef horende Linux-binary."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile


PROEFSCRIPTS = (
    'test-writer-lang-native.py',
    'test-writer-rijk-plakken-native.py',
    'test-writer-rust-plakken-volgorde-native.py',
    'test-writer-rust-tekst-native.py',
    'test-writer-lijsten-native.py',
    'test-writer-klembord-native.py',
    'test-writer-kleur-native.py',
    'test-writer-rendererfout-native.py',
)


def checksum(pad):
    som = hashlib.sha256()
    with pad.open('rb') as bestand:
        for blok in iter(lambda: bestand.read(1024 * 1024), b''):
            som.update(blok)
    return som.hexdigest()


def opdracht(args):
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=15)
        return {'exitcode': r.returncode, 'uitvoer': (r.stdout + r.stderr).strip()}
    except (OSError, subprocess.TimeoutExpired) as fout:
        return {'niet_beschikbaar': str(fout)}


def bewaar(programma, rapporten, uitvoer, appimage_map=None, systeem=True):
    rapport = None
    for kandidaat in rapporten:
        if not kandidaat.is_file():
            continue
        gegevens = json.loads(kandidaat.read_text())
        if gegevens.get('geslaagd') is False:
            rapport = kandidaat
            break
    if rapport is None:
        return None
    verwacht = gegevens.get('programma_sha256')
    if not isinstance(verwacht, str) or not re.fullmatch(r'[0-9a-f]{64}', verwacht):
        raise ValueError('Het afgekeurde rapport mist een geldige programma-checksum')
    werkelijk = checksum(programma)
    if werkelijk != verwacht:
        raise ValueError(f'De binary hoort niet bij de afgekeurde proef: verwacht {verwacht}, gevonden {werkelijk}')
    # Pas na de koppeling aan de proef bestanden maken; nooit oud onderzoek overschrijven.
    uitvoer.mkdir(parents=True, exist_ok=False)
    inhoud = uitvoer / 'inhoud'
    inhoud.mkdir()
    shutil.copy2(programma, inhoud / 'open-office-studio')
    shutil.copy2(rapport, inhoud / 'rapport.json')
    context = {
        'status': 'afgekeurde_proef_met_exacte_binary',
        'programma_sha256': werkelijk,
        'programma_uit_rapport': str(programma),
        'rapport_sha256': checksum(rapport),
        'versie': gegevens.get('versie'),
        'checkout': {naam: os.environ.get(naam) for naam in ['GITHUB_SHA', 'GITHUB_RUN_ID', 'GITHUB_JOB']},
        'testomgeving': {naam: os.environ.get(naam) for naam in ['GDK_BACKEND', 'WEBKIT_DISABLE_DMABUF_RENDERER', 'WEBKIT_DISABLE_COMPOSITING_MODE']},
        'scripts': {},
        'proefscript': {'beschikbaar': False, 'gerapporteerde_sha256': gegevens.get('script_sha256')},
        'proefbestanden': {},
        'appimage': None,
        'grens': 'Dit pakket bewaart een afkeuring. Het is geen vrijgave of bewijs van herstel.',
    }
    # Alleen de eigen gegenereerde proefbron en vaste foutuitvoer meenemen;
    # geen willekeurige bestanden uit de rapportmap verzamelen.
    for naam in ['Prestatieproef.docx', 'herstelkopie.docx', 'hersteld.docx',
                 'herstel-afwijkend.docx', 'herstel-afwijkend.json',
                 'Ontwerpnotitie.docx', 'tussenbewaring.docx', 'geplakt.docx',
                 'Lijstenproef.docx', 'Klembordproef.docx', 'Markeerkleurproef.docx', 'Rendererproef.docx',
                 'programma.log', 'afgekeurd.png', 'framebasis.json', 'framebasis.inspectiefout.json']:
        bron = rapport.parent / naam
        if bron.is_file():
            doel = inhoud / 'proef' / naam
            doel.parent.mkdir(exist_ok=True)
            shutil.copy2(bron, doel)
            context['proefbestanden'][naam] = {'sha256': checksum(doel), 'grens': 'Bestandstoestand na de afgekeurde proef; niet noodzakelijk de oorspronkelijke bron vóór bewerken.'}
    repo = Path(__file__).resolve().parents[1]
    # Identificeer de proef aan haar bytes, niet aan de positie van het rapport
    # of een door het rapport aangeleverde bestandsnaam. Na een latere wijziging
    # is het oorspronkelijke script niet alsnog uit deze checkout te bewijzen.
    for naam in PROEFSCRIPTS:
        bron = repo / 'scripts' / naam
        if checksum(bron) == gegevens.get('script_sha256'):
            context['proefscript'].update(beschikbaar=True, naam=naam)
            break
    if not context['proefscript']['beschikbaar']:
        context['proefscript']['reden'] = 'Geen vast proefscript in deze checkout heeft de gerapporteerde checksum'
    namen = ['gui/webkit_inspector.py', 'gui/requirements.txt', 'gui/framebasis.js']
    if context['proefscript']['beschikbaar']:
        namen.insert(0, context['proefscript']['naam'])
        if context['proefscript']['naam'] in ['test-writer-rijk-plakken-native.py', 'test-writer-rust-plakken-volgorde-native.py', 'test-writer-rust-tekst-native.py', 'test-writer-lijsten-native.py', 'test-writer-rendererfout-native.py']:
            namen.append('test-writer-lang-native.py')
    for naam in namen:
        bron = repo / 'scripts' / naam
        som = checksum(bron)
        doel = inhoud / 'scripts' / naam
        doel.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(bron, doel)
        context['scripts'][naam] = {'beschikbaar': True, 'sha256': som,
                                  'herkomst': 'Checksumgelijk aan gerapporteerde proef' if naam == context['proefscript'].get('naam') else 'Hulpmiddel uit huidige checkout; oorspronkelijke bytes niet afzonderlijk in het rapport vastgelegd'}
    if appimage_map is not None:
        pakketten = sorted(appimage_map.glob('*.AppImage'))
        if len(pakketten) == 1:
            pakket = pakketten[0]
            shutil.copy2(pakket, inhoud / pakket.name)
            context['appimage'] = {'naam': pakket.name, 'sha256': checksum(pakket), 'grens': 'Begeleidende verpakking uit dezelfde bouwmap; de afzonderlijk gecontroleerde raw binary is het bewijs voor de afgekeurde proef.'}
        else:
            context['appimage'] = {'niet_bewaard': 'Geen unieke begeleidende AppImage', 'gevonden': [p.name for p in pakketten]}
    if systeem:
        context['systeem'] = {
            'os_release': Path('/etc/os-release').read_text() if Path('/etc/os-release').is_file() else None,
            'pakketten': opdracht(['dpkg-query', '-W', '-f=${Package} ${Version}\n', 'libwebkit2gtk-4.1-0', 'libjavascriptcoregtk-4.1-0', 'libgtk-3-0', 'libc6']),
            'bibliotheken': opdracht(['ldd', str(programma.resolve())]),
        }
    (inhoud / 'context.json').write_text(json.dumps(context, ensure_ascii=False, indent=2) + '\n')
    bestanden = sorted(p for p in inhoud.rglob('*') if p.is_file())
    (inhoud / 'SHA256SUMS').write_text(''.join(f'{checksum(p)}  {p.relative_to(inhoud).as_posix()}\n' for p in bestanden))
    archief = uitvoer / 'writer-foutcontext.tar.gz'
    with tarfile.open(archief, 'w:gz') as tar:
        tar.add(inhoud, arcname='writer-foutcontext')
    (uitvoer / 'SHA256SUMS').write_text(f'{checksum(archief)}  {archief.name}\n')
    return context


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--programma', type=Path, required=True)
    parser.add_argument('--rapport', type=Path, action='append', required=True)
    parser.add_argument('--uitvoer', type=Path, required=True)
    parser.add_argument('--appimage-map', type=Path)
    args = parser.parse_args()
    context = bewaar(args.programma, args.rapport, args.uitvoer, args.appimage_map)
    print('Afgekeurde Writer-binary en context bewaard.' if context else 'Geen afgekeurde Writer-proef om te bewaren.')


if __name__ == '__main__':
    main()
