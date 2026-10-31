#!/usr/bin/env python3
"""Vergelijk verse Writer-berekeningen en sessiepaginawissels in aparte processen."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--programma', type=Path, required=True)
    p.add_argument('--bron', type=Path, required=True)
    p.add_argument('--paginas', default='0,1,2,3,4,0')
    p.add_argument('--seconden', type=int, default=180)
    p.add_argument('--uitvoer', type=Path, required=True)
    args = p.parse_args()
    if not 1 <= args.seconden <= 600:
        p.error('Gebruik een tijdslimiet van één tot 600 seconden per proces')
    programma = args.programma.resolve(strict=True)
    bron = args.bron.resolve(strict=True)
    with programma.open('rb') as f:
        programmahash = hashlib.file_digest(f, 'sha256').hexdigest()
    with bron.open('rb') as f:
        bronhash = hashlib.file_digest(f, 'sha256').hexdigest()
    versie = subprocess.check_output([str(programma), '--version'], text=True, timeout=15).strip()
    if not versie.startswith('Open Office native bestandscontrole '):
        p.error('Gebruik de native bestandscontrole')
    limiet = shutil.which('prlimit') if sys.platform.startswith('linux') else None
    rapport = {'programma': versie, 'programma_sha256': programmahash, 'bron_sha256': bronhash,
               'paginas': args.paginas, 'seconden_per_proces': args.seconden,
               'adresruimte_bytes': 3 * 1024**3 if limiet else None,
               'omvang': 'Afzonderlijke processen, dezelfde bron en paginavolgorde; exacte PNG-, klikgeometrie- en zichtbare veldhashes. Geen fysieke GUI, volledige inhoudscontrole of vaste snelheidsgrens.',
               'geslaagd': False, 'metingen': {}}
    try:
        for modus in ['vers', 'sessie']:
            with programma.open('rb') as f:
                assert hashlib.file_digest(f, 'sha256').hexdigest() == programmahash, 'Programma is veranderd'
            opdracht = [str(programma), '--meet-paginas', modus, str(bron), args.paginas]
            if limiet:
                opdracht = [limiet, '--as=3221225472', '--core=0', '--'] + opdracht
            r = subprocess.run(opdracht, capture_output=True, text=True, encoding='utf-8', timeout=args.seconden, check=True)
            meting = json.loads(r.stdout.strip().splitlines()[-1])
            rapport['metingen'][modus] = meting
            assert meting['status'] == 'geslaagd', meting
            assert meting['bron_sha256'] == bronhash, 'Bronhash wijkt af'
            assert meting['modus'] == modus, 'Verkeerde meetmodus'
            assert versie == f"Open Office native bestandscontrole {meting['native_versie']} ({meting['bouwprofiel']})", 'Programmaversie wijkt af'
            assert [m['pagina'] for m in meting['paginas']] == [int(n) for n in args.paginas.split(',')], 'Paginavolgorde wijkt af'
        referentie = rapport['metingen']['vers']['paginas']
        behouden = rapport['metingen']['sessie']['paginas']
        sleutels = ['pagina', 'png_sha256', 'geometrie_sha256', 'velden_sha256', 'onderdelen', 'melding']
        assert len(referentie) == len(behouden), 'Aantal paginabeelden wijkt af'
        rapport['verschillen'] = [
            {'stap': n, 'veld': sleutel}
            for n, (a, b) in enumerate(zip(referentie, behouden))
            for sleutel in sleutels if a[sleutel] != b[sleutel]]
        rapport['geslaagd'] = not rapport['verschillen']
    except (OSError, ValueError, KeyError, IndexError, AssertionError, subprocess.SubprocessError) as e:
        rapport['fout'] = str(e)
    args.uitvoer.parent.mkdir(parents=True, exist_ok=True)
    args.uitvoer.write_text(json.dumps(rapport, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in rapport.items() if k != 'metingen'}, ensure_ascii=False))
    raise SystemExit(0 if rapport['geslaagd'] else 1)


if __name__ == '__main__':
    main()
