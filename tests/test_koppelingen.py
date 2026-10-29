"""Bestandskoppelingen van de installers (Windows, macOS, Linux) tegen de formaatcatalogus.

Windows (tauri.windows.conf.json) is de referentie; macOS (tauri.macos.conf.json, Info.plist via
Tauri) en Linux (tauri.linux.conf.json, MimeType in het .desktop-bestand) moeten precies dezelfde
extensies aan dezelfde module koppelen.
"""
import json
from pathlib import Path
import re
import unittest
import xml.etree.ElementTree as ET

wortel = Path(__file__).parents[1]
tauri = wortel / 'src-tauri'


def koppelingen_van(platform):
    return json.loads((tauri / f'tauri.{platform}.conf.json').read_text(encoding='utf-8'))['bundle']['fileAssociations']


koppelingen = koppelingen_van('windows')
basis = json.loads((tauri / 'tauri.conf.json').read_text(encoding='utf-8'))
catalogus = json.loads((wortel / 'src/formaten.json').read_text(encoding='utf-8'))
haak = (tauri / 'windows/koppelingen.nsh').read_text(encoding='utf-8')
modules = {'OpenAEC.OfficeStudio.Tekst': 'docx', 'OpenAEC.OfficeStudio.Rekenblad': 'xlsx', 'OpenAEC.OfficeStudio.Presentatie': 'pptx'}
MIME_PAKKET = '/usr/share/mime/packages/open-office-studio.xml'


def per_extensie(lijst):
    return {ext: (koppeling['name'], koppeling['role']) for koppeling in lijst for ext in koppeling['ext']}


def mime_globs():
    """Extensie → MIME-typen volgens shared-mime-info van dit systeem (None als dat ontbreekt)."""
    bestand = Path('/usr/share/mime/globs2')
    if not bestand.is_file():
        return None
    globs = {}
    for regel in bestand.read_text(encoding='utf-8').splitlines():
        delen = regel.split(':')
        if len(delen) >= 3 and delen[2].startswith('*.'):
            globs.setdefault(delen[2][2:].lower(), set()).add(delen[1])
    return globs


class Koppelingen(unittest.TestCase):
    def test_elke_extensie_wordt_door_de_juiste_module_geopend(self):
        for koppeling in koppelingen:
            soort = modules.get(koppeling['name'])
            for ext in koppeling['ext']:
                with self.subTest(ext=ext):
                    if soort:
                        self.assertIn(ext, catalogus[soort]['invoer'])
                    else:
                        self.assertIn(ext, ('mdb', 'accdb'))

    def test_extensies_zijn_uniek(self):
        for platform in ('windows', 'macos', 'linux'):
            with self.subTest(platform=platform):
                alle = [ext for koppeling in koppelingen_van(platform) for ext in koppeling['ext']]
                self.assertEqual(len(alle), len(set(alle)))

    def test_standaard_apps_registratie_gelijk_aan_koppelingen(self):
        verwacht = {(ext, koppeling['name']) for koppeling in koppelingen for ext in koppeling['ext']}
        gevonden = set(re.findall(r'!insertmacro \$\{MACRO\} (\w+) ([\w.]+)', haak))
        self.assertEqual(gevonden, verwacht)

    def test_dertig_formaten_inclusief_access(self):
        alle = per_extensie(koppelingen)
        self.assertEqual(len(alle), 30)
        self.assertEqual(alle['mdb'][0], 'OpenAEC.OfficeStudio.Database')
        self.assertEqual(alle['accdb'][0], 'OpenAEC.OfficeStudio.Database')

    def test_macos_en_linux_koppelen_hetzelfde_als_windows(self):
        verwacht = per_extensie(koppelingen)
        for platform in ('macos', 'linux'):
            with self.subTest(platform=platform):
                self.assertEqual(per_extensie(koppelingen_van(platform)), verwacht)

    def test_basisconfig_koppelt_niets_zelf(self):
        # Elk platform heeft een eigen lijst; een lijst in tauri.conf.json zou er stil onder vallen.
        self.assertNotIn('fileAssociations', basis['bundle'])

    def test_macos_documenttypen(self):
        for koppeling in koppelingen_van('macos'):
            with self.subTest(naam=koppeling['name']):
                # CFBundleTypeName, CFBundleTypeRole en LSHandlerRank in de Info.plist.
                self.assertIn(koppeling['role'], ('Editor', 'Viewer'))
                self.assertEqual(koppeling.get('rank'), 'Default')
                # Met LSItemContentTypes negeert macOS de extensielijst; niet gebruiken.
                self.assertNotIn('contentTypes', koppeling)

    def test_linux_elk_mime_type_een_keer(self):
        lijst = koppelingen_van('linux')
        mime = [koppeling.get('mimeType') for koppeling in lijst]
        self.assertTrue(all(mime), 'elke Linux-koppeling heeft een mimeType (MimeType= in het .desktop-bestand)')
        self.assertEqual(len(mime), len(set(mime)))

    def test_linux_mime_typen_horen_bij_de_extensies(self):
        globs = mime_globs()
        if globs is None:
            self.skipTest('shared-mime-info ontbreekt op dit systeem')
        eigen = ET.parse(tauri / 'linux/open-office-studio-mime.xml').getroot()
        ns = {'m': 'http://www.freedesktop.org/standards/shared-mime-info'}
        for type_ in eigen.findall('m:mime-type', ns):
            for glob in type_.findall('m:glob', ns):
                globs.setdefault(glob.get('pattern')[2:].lower(), set()).add(type_.get('type'))
        for koppeling in koppelingen_van('linux'):
            for ext in koppeling['ext']:
                with self.subTest(ext=ext):
                    self.assertIn(koppeling['mimeType'], globs.get(ext, set()))

    def test_linux_pakketten_installeren_het_mime_pakket(self):
        for pakket in ('deb', 'rpm'):
            with self.subTest(pakket=pakket):
                bestanden = basis['bundle']['linux'][pakket]['files']
                self.assertEqual(bestanden.get(MIME_PAKKET), 'linux/open-office-studio-mime.xml')
                self.assertTrue((tauri / bestanden[MIME_PAKKET]).is_file())

    def test_linux_starter_geeft_bestanden_door(self):
        sjabloon = (tauri / 'linux/open-office-studio.desktop.hbs').read_text(encoding='utf-8')
        regels = sjabloon.splitlines()
        self.assertIn('Exec={{exec}} %F', regels)
        self.assertIn('MimeType={{mime_type}}', regels)
        self.assertEqual(basis['bundle']['linux']['deb']['desktopTemplate'], 'linux/open-office-studio.desktop.hbs')


if __name__ == '__main__':
    unittest.main()
