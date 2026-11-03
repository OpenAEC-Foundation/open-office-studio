#!/usr/bin/env python3
"""Controleer oorspronkelijke letterbytes en de gesloten lijst met stijlbronnen."""
from pathlib import Path
import hashlib
import json
import re

repo = Path(__file__).resolve().parents[2]
crate = repo/'native/crates/office-webview'
assets = crate/'assets'
letters = json.loads((assets/'bron.json').read_text(encoding='utf-8'))
verwacht = set(letters['bestanden'])
aanwezig = {p.relative_to(assets).as_posix() for p in assets.rglob('*') if p.is_file()}
assert aanwezig == verwacht | {'bron.json', 'Inter-OFL.txt', 'SpaceGrotesk-OFL.txt'}, 'Onverwachte of ontbrekende letterbron'
for naam, bewijs in letters['bestanden'].items():
    pad = assets/naam
    assert assets.resolve() in pad.resolve().parents and not pad.is_symlink()
    assert hashlib.sha256(pad.read_bytes()).hexdigest() == bewijs['sha256'], f'Letterbron gewijzigd: {naam}'
for naam in letters['letterstijlen']:
    for bestand in re.findall(r'url\(\./([^\)]+)\)', (assets/naam).read_text(encoding='utf-8')):
        assert bestand in verwacht, f'Niet meegeleverd letterbestand: {bestand}'
bronnen = json.loads((crate/'stijlbronnen.json').read_text(encoding='utf-8'))
alle_bronnen = bronnen['stijl'] + bronnen['benodigd'] + bronnen.get('testbenodigd', [])
assert len(set(alle_bronnen)) == len(alle_bronnen), 'Dubbele stijlbron'
for naam in alle_bronnen:
    pad = repo/naam
    assert repo in pad.resolve().parents and pad.is_file() and not pad.is_symlink()
    if pad.suffix == '.css':
        for afhankelijk in re.findall(r'@import "([^"]+)";', pad.read_text(encoding='utf-8')):
            relatief = (pad.parent/afhankelijk).resolve().relative_to(repo).as_posix()
            assert relatief in alle_bronnen, f'Niet meegeleverde stijlimport: {relatief}'
print(f"Rust-WebView: {len(verwacht)} oorspronkelijke letterbestanden en {len(alle_bronnen)} stijl-/merkbronnen gecontroleerd.")
