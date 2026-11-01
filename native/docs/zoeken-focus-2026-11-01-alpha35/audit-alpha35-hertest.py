"""Controleer bron, bewijskopieën en uitsluitend exacte ruwe witruimte-uitzonderingen."""
from pathlib import Path
import gzip, hashlib, json, re, subprocess

r = Path.cwd()
w = r / '.local/controle-2026-10-31'
p = r / 'native/docs/zoeken-focus-2026-11-01-alpha35'
def sha(b):
    return hashlib.sha256(b).hexdigest()
def index(pad):
    return subprocess.check_output(['git', 'show', ':' + pad.relative_to(r).as_posix()])
bron = json.loads((w / 'native-alpha35-testbron.json').read_text())
assert len(bron) == 668
for naam, h in bron.items():
    assert sha((r / naam).read_bytes()) == h == sha(index(r / naam)), naam
kopieen = json.loads((p / 'bewijskopieen.json').read_text())['bestanden']
for naam, v in kopieen.items():
    pad = p / naam
    assert sha(pad.read_bytes()) == v['sha256'] == sha((r / v['bron']).read_bytes()) == sha(index(pad)), naam
cache = w / 'opruiming-oude-incrementele-cache-tijdens-alpha35.json'
ingepakt = p / (cache.name + '.gz')
assert gzip.decompress(ingepakt.read_bytes()) == cache.read_bytes()
assert ingepakt.read_bytes() == index(ingepakt)
for naam in ['native-na-alpha34-zoekfocus-momentcontrole.json', 'native-alpha35-bronherstel.json']:
    assert json.loads((w / naam).read_text())['geslaagd']
    assert (p / naam).read_bytes() == (w / naam).read_bytes()
schermen = json.loads((r / 'native/docs/schermen-2026-11-01-alpha35.json').read_text())
assert len(schermen['beelden']) == 57
for beeld in schermen['beelden']:
    pad = r / 'native/docs/screenshots' / beeld['bestand']
    raw = w / 'native-alpha35-definitief-schermen' / beeld['bestand']
    assert pad.read_bytes() == raw.read_bytes() == index(pad)
    assert sha(pad.read_bytes()) == beeld['sha256']
for alias, naam in schermen['aliassen'].items():
    pad = r / 'native/docs/screenshots' / alias
    assert pad.read_bytes() == (w / 'native-alpha35-definitief-schermen' / naam).read_bytes() == index(pad)
subprocess.run(['git', 'diff', '--quiet', 'daa399f155fcd2c7ce86ae36fbdd2debea5b7428', '--',
                'native/docs/referentie-2026-W44.8', 'native/docs/referentie-desktop-2026-11-01'], check=True)

controle = subprocess.run(['git', 'diff', '--cached', '--check'], capture_output=True, text=True)
rawlog = w / 'native-alpha35-witruimte-hertest.log'
assert not rawlog.exists()
rawlog.write_text(controle.stdout + controle.stderr)
regels = (controle.stdout + controle.stderr).splitlines()
uitzonderingen = []
i = 0
while i < len(regels):
    m = re.fullmatch(r'(.+):(\d+): (trailing whitespace\.|new blank line at EOF\.)', regels[i])
    assert m, regels[i]
    naam, regel, reden = m.groups()
    pad = r / naam
    relatief = pad.relative_to(p).as_posix()
    assert relatief in kopieen and pad.suffix in ['.log', '.patch'], naam
    assert kopieen[relatief]['bron'].startswith('.local/controle-2026-10-31/'), naam
    if reden == 'trailing whitespace.':
        assert i + 1 < len(regels) and regels[i + 1].startswith('+')
    uitzonderingen.append({'bestand': naam, 'regel': int(regel), 'reden': reden,
        'sha256': sha(pad.read_bytes()), 'ongewijzigde_privebron': kopieen[relatief]['bron']})
    i += 2 if reden == 'trailing whitespace.' else 1
assert controle.returncode in (0, 2)
assert bool(uitzonderingen) == (controle.returncode != 0)
namen = sorted({v['bestand'] for v in uitzonderingen})
subprocess.run(['git', 'diff', '--cached', '--check', '--', '.',
    *[':(exclude,literal)' + naam for naam in namen]], check=True)
staged = subprocess.check_output(['git', 'diff', '--cached', '--name-only', '-z']).decode().split('\0')
assert not any(naam.startswith('.claude/') for naam in staged)
rapport = {'bronbestanden_en_gitindex_bytegelijk': 668, 'alle_bewijskopieen_bytegelijk': True,
    'alle_57_ruwe_beelden_en_aliassen_bytegelijk': True, 'oorspronkelijke_referenties_ongewijzigd': True,
    'bronpatchen_buiten_git_toegepast_en_alle_hashes_gecontroleerd': True,
    'omvang': 'Uitsluitend de hieronder exact benoemde ongewijzigde ruwe logs en patches zijn uitgezonderd. Alle overige toegevoegde wijzigingen voldoen aan git diff --cached --check. Geen algemene pad- of bestandstype-uitzondering.',
    'uitzonderingen': uitzonderingen, 'exacte_uitzonderingsbestanden': namen,
    'oorspronkelijk_witruimtelog_sha256': sha(rawlog.read_bytes())}
(p / 'witruimtecontrole.json').write_text(json.dumps(rapport, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'bronbestanden': 668, 'bewijskopieen': len(kopieen), 'exacte_ruwe_uitzonderingsbestanden': namen}, ensure_ascii=False, indent=2))
