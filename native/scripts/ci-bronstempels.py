#!/usr/bin/env python3
"""Behoud bronstempels in CI uitsluitend bij exact gelijke bestandsinhoud.

Een nieuwe checkout krijgt nieuwe tijdstempels. Zonder inhoudscontrole laat dat
Cargo ook ongewijzigde werkruimtepakketten opnieuw bouwen. Gewijzigde bytes
krijgen juist een verse stempel, zodat een oude cache geen wijziging verbergt.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time


def bestanden(repo):
    uitvoer = subprocess.check_output(['git', '-C', str(repo), 'ls-files', '-z', '--', 'native', 'public/templates', 'docs/voorbeelden'])
    for naam in uitvoer.decode('utf-8').split('\0'):
        if naam:
            pad = repo / naam
            if pad.is_file() and not pad.is_symlink():
                yield naam, pad


def digest(pad):
    with pad.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('opdracht', choices=['opslaan', 'herstellen'])
    p.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[2])
    args = p.parse_args()
    repo = args.repo.resolve(strict=True)
    cache = repo / 'native/target/bronstempels.json'
    if args.opdracht == 'opslaan':
        data = {'versie': 1, 'bestanden': {naam: {'sha256': digest(pad), 'mtime_ns': pad.stat().st_mtime_ns} for naam, pad in bestanden(repo)}}
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(data, sort_keys=True) + '\n', encoding='utf-8')
        print(f"Bronstempels vastgelegd: {len(data['bestanden'])} bestanden.")
        return
    if not cache.exists():
        print('Geen bronstempels in deze cache; de verse checkout blijft ongewijzigd.')
        return
    data = json.loads(cache.read_text(encoding='utf-8'))
    if data.get('versie') != 1 or not isinstance(data.get('bestanden'), dict):
        raise ValueError('Onbekende bronstempelcache')
    gelijk = gewijzigd = 0
    nu = time.time_ns()
    # Loop uitsluitend over de huidige Git-bestanden, nooit over paden uit de cache.
    for naam, pad in bestanden(repo):
        oud = data['bestanden'].get(naam)
        if oud and oud.get('sha256') == digest(pad):
            stempel = oud.get('mtime_ns')
            if not isinstance(stempel, int) or stempel < 0 or stempel > nu:
                raise ValueError(f'Ongeldige bronstempel voor {naam}')
            status = pad.stat()
            os.utime(pad, ns=(status.st_atime_ns, stempel))
            gelijk += 1
        else:
            os.utime(pad, ns=(nu, nu))
            gewijzigd += 1
    print(f'Bronstempels: {gelijk} exact gelijke bestanden hersteld; {gewijzigd} nieuwe/gewijzigde bestanden actueel gehouden.')


if __name__ == '__main__':
    main()
