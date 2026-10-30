#!/usr/bin/env python3
"""Pak het echte previewpakket uit en controleer bron, licenties en programmaversie."""
from pathlib import Path
import hashlib
import platform
import re
import subprocess
import sys
import tempfile
import tomllib
import zipfile
root = Path(__file__).resolve().parents[1]
versie = tomllib.loads((root/'Cargo.toml').read_text(encoding='utf-8'))['workspace']['package']['version']
# Een buildcache kan pakketten van oudere versies bevatten. Alleen de actuele
# uitvoer hoort bij deze controle; historische pakketten blijven onaangeroerd.
naam = f'Open-Office-Studio-native-{versie}-{platform.system()}-{platform.machine()}.zip'
pakketten = [Path(p) for p in sys.argv[1:]] or [root/'target/distributie'/naam]
for pakket in pakketten:
    assert pakket.is_file(), f'Actueel pakket ontbreekt: {pakket}'
    print(f'Controleer {pakket.name}', flush=True)
    verwacht = pakket.with_suffix('.sha256').read_text(encoding='utf-8').split()[0]
    assert hashlib.sha256(pakket.read_bytes()).hexdigest() == verwacht, 'Pakkethash wijkt af'
    with tempfile.TemporaryDirectory(prefix='office-native-controle-') as tijdelijk:
        map = Path(tijdelijk)
        with zipfile.ZipFile(pakket) as z:
            assert z.testzip() is None, 'Beschadigd zip-bestand'
            assert all(not Path(n).is_absolute() and '..' not in Path(n).parts for n in z.namelist())
            z.extractall(map)
        inhoud = list(map.iterdir())
        assert len(inhoud) == 1 and inhoud[0].is_dir()
        map = inhoud[0]
        bron = map/'bron/native'
        versie = tomllib.loads((bron/'Cargo.toml').read_text(encoding='utf-8'))['workspace']['package']['version']
        assert (bron/'Cargo.lock').is_file()
        assert (map/'licenties/OpenAEC-UI-LICENSE.md').is_file()
        notices = list((map/'licenties/rust').rglob('*'))
        assert sum(p.is_file() for p in notices) > 20, 'Rust-notices ontbreken'
        subprocess.run([sys.executable, str(bron/'scripts/controleer-bron.py')], check=True)
        for ext in ['docx', 'xlsx', 'pptx']:
            assert (map/f'bron/public/templates/nieuw.{ext}').is_file()
        # Ook tests moeten uit de meegeleverde bron kunnen worden gebouwd.
        # Controleer eigen letterlijke compileerinclusies, inclusief de echte
        # voorbeelddocumenten buiten de native werkruimte.
        aantal = 0
        for rs in (bron/'crates').rglob('*.rs'):
            for _, pad in re.findall(r'include_(bytes|str)!\s*\(\s*"([^"\n]+)"',rs.read_text(encoding='utf-8')):
                assert (rs.parent/pad).is_file(), f'Compileerbron ontbreekt: {rs.relative_to(bron)} → {pad}'
                aantal += 1
        assert aantal > 70, 'Compileerinclusies zijn niet volledig gecontroleerd'
        exe = map/('open-office-studio-native' + ('.exe' if platform.system() == 'Windows' else ''))
        exe.chmod(exe.stat().st_mode | 0o100)
        resultaat = subprocess.check_output([str(exe), '--version'], text=True, encoding='utf-8').strip()
        assert resultaat == f'Open Office Studio {versie} (native)', resultaat
        if (bron/'crates/office-core/src/bin/controleer-bestand.rs').is_file():
            helper = map/('controleer-bestand' + ('.exe' if platform.system() == 'Windows' else ''))
            assert helper.is_file(), 'Het bronpakket noemt een ontbrekend controleprogramma'
            helper.chmod(helper.stat().st_mode | 0o100)
            hulpversie = subprocess.check_output([str(helper), '--version'], text=True, encoding='utf-8').strip()
            assert hulpversie == f'Open Office native bestandscontrole {versie} (release)', hulpversie
        print(f'{pakket.name}: CRC, SHA-256, bron, notices en uitgepakte programmaversie gecontroleerd.')
