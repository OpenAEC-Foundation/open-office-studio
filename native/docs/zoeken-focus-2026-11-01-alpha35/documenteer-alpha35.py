"""Leg de volledige alpha35-broncontrole en ongewijzigde afkeuringen vast."""
from pathlib import Path
import gzip, hashlib, json, re, shutil

r = Path.cwd()
w = r / '.local/controle-2026-10-31'
d = r / 'native/docs'
bron = json.loads((w / 'native-alpha35-testbron.json').read_text())
assert len(bron) == 668
def h(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()
def schrijf(p, v):
    p.write_text(json.dumps(v, ensure_ascii=False, indent=2) + '\n')
for n, sha in bron.items():
    assert h(r / n) == sha, n
assert (w / 'native-alpha35-controleopdracht.log').read_text().endswith('Volledige bron vóór en na de controles bytegelijk.\n')
schermen = json.loads((d / 'schermen-2026-11-01-alpha35.json').read_text())
assert schermen['reguliere_tests'] == 382 and schermen['laatste_ui_tests'] == 145 and len(schermen['beelden']) == 57
assert json.loads((w / 'native-alpha35-bronherstel.json').read_text())['geslaagd']
assert json.loads((w / 'native-na-alpha34-zoekfocus-momentcontrole.json').read_text())['geslaagd']
log = (w / 'native-alpha35-definitief-tests.log').read_text()
tests = re.findall(r'fn (writer_zoek(?:openfocus|sluitklik)\w*)\(', (r / 'native/crates/office-ui/src/tests/raster_proeven.rs').read_text())
assert len(tests) == 8
assert all(f'test tests::raster_proeven::{naam} ... ok' in log for naam in tests)

p = d / 'zoeken-focus-2026-11-01-alpha35'
p.mkdir()
kopieen = {}
def kopie(origineel, doel):
    assert origineel.is_file()
    doel.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(origineel, doel)
    assert h(origineel) == h(doel)
    kopieen[doel.relative_to(p).as_posix()] = {'bron': origineel.relative_to(r).as_posix(), 'sha256': h(doel)}

namen = [
    'native-na-alpha34-zoeksluitklik-voor.log', 'native-na-alpha34-zoeksluitklik-voor.patch', 'native-na-alpha34-zoeksluitklik-voor.json',
    'native-na-alpha34-zoekopenfocus-voor.log', 'native-na-alpha34-zoekopenfocus-voor.patch', 'native-na-alpha34-zoekopenfocus-voor.json',
    'native-na-alpha34-zoekfocus-eerste-correctie.log', 'native-na-alpha34-zoekfocus-clippy.log',
    'native-na-alpha34-zoekfocus-grenzen.log', 'native-na-alpha34-zoekfocus-grenzen-eerste.patch', 'native-na-alpha34-zoekfocus-grenzen-eerste.json',
    'native-na-alpha34-zoekfocus-grenzen-hertest.log', 'native-na-alpha34-zoekfocus-orakelcorrectie.json',
    'native-na-alpha34-zoekfocus-momentcontrole.json', 'native-na-alpha34-zoekfocus-momentcontrole.log', 'verifieer-zoekfocus-momenten.py',
    'native-alpha35-geteste-bron.patch', 'native-alpha35-geteste-bron.json', 'native-alpha35-bronherstel.json', 'native-alpha35-bronherstel.log', 'verifieer-alpha35-bron.py',
    'controle-alpha35-definitief.py', 'finaliseer-alpha35.py', 'documenteer-alpha35.py', 'audit-alpha35.py', 'native-alpha35-controleopdracht.log', 'native-alpha35-testbron.json',
    'native-alpha35-definitief-tests.log', 'native-alpha35-definitief-fmt.log', 'native-alpha35-definitief-clippy.log',
    'native-alpha35-definitief-python.log', 'native-alpha35-definitief-bron.log', 'native-alpha35-definitief-onafhankelijk.log',
    'native-alpha35-runtime.log', 'native-alpha35-conversie-onafhankelijk.log',
    'opruiming-testcache-voor-alpha35.json', 'opruiming-testcache-voor-alpha35.log', 'ruim-testcache-voor-alpha35.py',
    'ruim-oude-incrementele-cache-alpha35.py', 'opruiming-oude-incrementele-cache-tijdens-alpha35.log',
]
for naam in namen:
    kopie(w / naam, p / naam)
for naam in ['native/Cargo.toml', 'native/Cargo.lock', 'native/crates/office-ui/src/main.rs',
             'native/crates/office-ui/src/zoeken_ui.rs', 'native/crates/office-ui/src/invoerfocus.rs',
             'native/crates/office-ui/src/tests/raster_proeven.rs']:
    kopie(r / naam, p / 'bron' / naam)
cache = w / 'opruiming-oude-incrementele-cache-tijdens-alpha35.json'
ingepakt = gzip.compress(cache.read_bytes(), mtime=0)
assert gzip.decompress(ingepakt) == cache.read_bytes()
(p / (cache.name + '.gz')).write_bytes(ingepakt)
schrijf(p / 'cacheopruiming.json', {'omvang': 'Uitsluitend oude herbouwbare caches; alle oorspronkelijke cachepaden, groottes en hashes blijven verliesloos bewaard.',
    'bron_sha256': h(cache), 'gzip_sha256': h(p / (cache.name + '.gz')),
    'vrije_bytes_voor': json.loads(cache.read_text())['vrije_bytes_voor'],
    'vrije_bytes_na': json.loads(cache.read_text())['vrije_bytes_na']})
schrijf(p / 'rapport.json', {'versie': '2026.44.9-alpha.35', 'reguliere_tests': 382, 'ui_tests': 145,
    'runtime_tests': 6, 'python_tests': 7, 'bronbestanden': 668, 'widgetbeelden': 57,
    'nieuwe_widgetproeven': tests, 'broncontrole_geslaagd': True, 'volledige_suite_gemigreerd': False,
    'oorspronkelijke_pixelpariteit_geslaagd': False, 'eigen_releasebouw_en_vensterhertest_nog_verplicht': True})
(p / 'LEESMIJ.md').write_text('''# Zoekfocus, alpha 35

Een uitgestelde openingsfocus van Zoeken kon een later gekozen documentcursor overnemen. De oorspronkelijke echte alpha-34-Writer-route blijft lokaal en in CI afgekeurd; haar ongewijzigde bestanden en cursoronderzoek staan bij de [alpha-34-vensterproeven](../vensterproeven-2026-11-01-alpha34/LEESMIJ.md).

Twee aanvullende proeven met echte sluitknopklikken slagen al vóór de correctie. De volgende proef stelt de latere paginacursor vast, voert daarna de oude openingsopdracht uit en typt 9: de oude bron faalt op ontbrekende documentinvoer. De sluitknop is daarmee niet zonder meer de oorzaak. De negatieve bronpatch en alle 667 bronhashes zijn buiten de werkboom volledig hersteld en gecontroleerd.

Alpha 35 registreert muisklikken, toetsaanslagen en aanraakacties vóór de widgetafhandeling, ook in bovenliggende keuzemenu’s. Een al gemaakte focusvraag vervalt na nieuwe bediening. Zij controleert daarnaast of het unieke zoekveld van dat paneel en document nog bestaat in de actuele bedienbare widgetboom. De registratie tekent niets en verbruikt de gebeurtenis niet.

Acht nieuwe widgetproeven controleren twee echte sluitklikroutes, onmiddellijke vervolginvoer in dezelfde widgetronde, een latere paginacursor, normale zoekinvoer met een eigen proefklembord, een later lettertypeveld, een nieuwe cursor in dezelfde alinea en een nieuw paneel of document. Tekst, bronwijziging en bronexacte undo blijven waar toepasselijk verplicht. Dit is geen volledige focus-/IME-/platformmatrix.

Een eerste grensproef verwachtte ten onrechte een onveranderde editorversie na een tweede klik in dezelfde alinea. De bestaande code vernieuwt die versie bij iedere klik. Haar oorspronkelijke afkeuring blijft behouden; de hertest verlangt dezelfde alinea-ID, exact één versieverhoging en cursorpositie 8 vóór de oude focusvraag. De tekst-, bron- en undo-eisen zijn niet afgezwakt. Ook die oorspronkelijke 668 bronbytes zijn volledig uit de patch hersteld.

De volledige bronronde slaagt op 382 reguliere Rust-tests, waaronder 145 UI-tests, zes afzonderlijk uitgevoerde runtimeproeven en zeven Python-tests. Rustfmt, Clippy met waarschuwingen als fouten, bronpins en onafhankelijke lezers slagen. Alle 668 bronbestanden blijven vóór en na de ronde bytegelijk. De complete bronpatch herstelt die bytes vanaf de vastgelegde Git-basis.

Alle 57 volledige native widgetbeelden zijn vastgelegd. Vijftien gedeelde documentbeelden, acht letterbeelden en de vijf oorspronkelijke renderer-goldens blijven gecontroleerd. De vier oorspronkelijke browser- en vier afzonderlijke desktopvergelijkingen blijven zonder maskers, herschaling of tolerantie zichtbaar; dit is geen bewijs van oorspronkelijke pixelpariteit.

De eigen alpha-35-releasebouw, volledige platformronde en echte releasevensterhertests blijven afzonderlijk vereist. Geen stabiele native vrijgave of volledige migratiegoedkeuring.
''')
schrijf(p / 'bewijskopieen.json', {'omvang': 'Ongewijzigde ruwe logs, patches en bronnen. Geen oorspronkelijke afkeuring vervangen door succes.', 'bestanden': kopieen})

verschillen = {naam: {v['module']: v['afwijkende_pixels'] for v in json.loads((d / pad / 'rapport.json').read_text())['resultaten']}
              for naam, pad in [('browser', 'pixelcontrole-alpha35'), ('desktop', 'pixelcontrole-alpha35-desktop')]}
(d / 'controle-2026-11-01-alpha35.md').write_text(f'''# Native controle, 1 november 2026: alpha 35

**2026.44.9-alpha.35** bewaakt [uitgestelde zoekfocus](zoeken-focus-2026-11-01-alpha35/LEESMIJ.md) tegen latere bediening en bindt het doel aan paneel en document.

- **382 reguliere Rust-tests**, inclusief **145 UI-tests**, zes runtimeproeven en zeven Python-tests geslaagd.
- Rustfmt, Clippy zonder toegestane waarschuwingen, bronpins en onafhankelijke lezers geslaagd; **668 bronbestanden** vóór en na de volledige ronde bytegelijk.
- Acht nieuwe gerichte widgetproeven. De oorspronkelijke negatieve openingsfocusproef en de afzonderlijke testverwachtingscorrectie blijven met volledig herstelbare bron bewaard.
- **57 volledige native widgetbeelden**; vijftien gedeelde documentbeelden en acht letterbeelden bytegelijk aan alpha 34; vijf oorspronkelijke renderer-goldens blijven gecontroleerd.

De [volledige alpha-34-platformronde](platformen-2026-11-01-alpha34.json) slaagt op vijf taken met 2669 bytegelijke bronbestanden per pakket, 114 exacte native beeldparen en 21 paginabezoeken. De [echte alpha-34-vensters](vensterproeven-2026-11-01-alpha34/LEESMIJ.md) slagen voor gerichte lijst-, stijl- en rasterbediening, maar haar afzonderlijke Writer-zoekroute blijft afgekeurd. Dit is geen alpha-35-releasevenstergoedkeuring.

De eigen alpha-35-releasebouw, platformronde en echte vensterhertests blijven afzonderlijk vereist.

De vier [volledige browservergelijkingen](pixelcontrole-alpha35/rapport.json) geven {verschillen['browser']}. De vier [afzonderlijke desktopvergelijkingen](pixelcontrole-alpha35-desktop/rapport.json) geven {verschillen['desktop']}. Elk volledig beeld heeft 943.736 pixels; geen maskers, herschaling of kleurtolerantie.

Alle tien acceptatiegebieden blijven open op volledige functie-, test- en pixelpariteit. Geen stabiele native vrijgave.
''')

m = json.loads((d / 'migratie.json').read_text())
for gebied in m['gebieden']:
    assert not any(gebied[k] for k in ['functioneel_gelijk', 'alle_functies_getest', 'visueel_gelijk'])
    if gebied['id'] == 'writer':
        gebied['resterend'] += ' Alpha 35 bewaakt al gemaakte openingsfocusvragen voor Zoeken met een invoergeneratie en een uniek paneel-/documentdoel. Acht nieuwe widgetproeven controleren latere cursor-/lettertypekeuze, normale zoekinvoer, echte sluitklikken, nieuwe panelen en andere documenten. De oorspronkelijke echte alpha34-zoekroute blijft afgekeurd; de alpha35-releasevensterhertest en volledige focus-/IME-/platformmatrix blijven open.'
schrijf(d / 'migratie.json', m)
readme = r / 'native/README.md'
t = readme.read_text()
nieuw = 'Het [controlerapport voor alpha 35](docs/controle-2026-11-01-alpha35.md) legt **382 reguliere Rust-tests**, inclusief **145 UI-tests**, zes runtimeproeven en zeven Python-tests vast. Rustfmt, Clippy, bronpins en onafhankelijke lezers slagen. **57 volledige native widgetbeelden** en **668 bronbestanden** zijn vastgelegd. Acht nieuwe gerichte proeven controleren uitgestelde zoekfocus en werkelijke sluitknopklikken. De oorspronkelijke afkeuringen blijven behouden. Eigen alpha35-releasebouw, platformronde en echte vensterhertests blijven afzonderlijk vereist; volledige oorspronkelijke UI-pariteit blijft open.'
t, aantal = re.subn(r'^Het \[controlerapport voor alpha 34\].*$', nieuw, t, flags=re.M)
assert aantal == 1
t = t.replace('De [controle van alpha 34](docs/controle-2026-11-01-alpha34.md) legt de huidige lokale tests', 'De [controle van alpha 35](docs/controle-2026-11-01-alpha35.md) legt de huidige lokale tests')
readme.write_text(t)
readme = r / 'README.md'
t = readme.read_text()
a = t.index('Alpha 34 adds Writer bullets')
b = t.index('\n## Suite or a separate app', a)
t = t[:a] + '''Alpha 35 prevents a pending search focus request from taking over a later
document cursor or input field. Its [validation report](native/docs/controle-2026-11-01-alpha35.md)
records 382 Rust tests, including 145 UI tests, six runtime checks and seven
Python tests. The original failed alpha-34 GUI checks remain available; the
new release windows require a separate retest. Full visual parity is still open;
the original browser and [desktop references](native/docs/referentie-desktop-2026-11-01/LEESMIJ.md)
remain separately available.
''' + t[b:]
readme.write_text(t)
for n, sha in bron.items():
    assert h(r / n) == sha, n
print('Alpha35-broncontrole, ongewijzigde afkeuringen en beide volledige pixelrapporten vastgelegd.')
