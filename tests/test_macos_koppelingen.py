"""Positieve en negatieve proeven voor de controle van de echte app-plist."""
import copy
import importlib.util
from pathlib import Path
import plistlib
import unittest

spec = importlib.util.spec_from_file_location('macos_koppelingen', Path(__file__).parents[1] / 'scripts/controleer-macos-koppelingen.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class MacKoppelingen(unittest.TestCase):
    def setUp(self):
        self.config = [{'ext': ['docx'], 'name': 'Tekstdocument', 'role': 'Editor', 'rank': 'Default'},
                       {'ext': ['xlsx'], 'name': 'Rekenblad', 'role': 'Editor', 'rank': 'Default'}]
        self.plist = {'CFBundleIdentifier': 'org.openaec.proef', 'CFBundleDocumentTypes': [
            {'CFBundleTypeExtensions': ['docx'], 'CFBundleTypeName': 'Tekstdocument', 'CFBundleTypeRole': 'Editor', 'LSHandlerRank': 'Default'},
            {'CFBundleTypeExtensions': ['xlsx'], 'CFBundleTypeName': 'Rekenblad', 'CFBundleTypeRole': 'Editor', 'LSHandlerRank': 'Default'}]}

    def test_accepteert_de_binaire_plist_met_beide_documenttypen(self):
        gegevens = plistlib.loads(plistlib.dumps(self.plist, fmt=plistlib.FMT_BINARY))
        self.assertEqual(module.controleer(gegevens, self.config, 'org.openaec.proef'), ['docx', 'xlsx'])

    def test_weigert_een_verkeerde_app(self):
        with self.assertRaisesRegex(ValueError, 'bundle-identificatie'):
            module.controleer(self.plist, self.config, 'org.openaec.andere-app')

    def test_weigert_ontbrekende_onverwachte_of_dubbele_extensies(self):
        for extensies in ([], ['txt'], ['docx', 'docx']):
            with self.subTest(extensies=extensies):
                gegevens = copy.deepcopy(self.plist)
                gegevens['CFBundleDocumentTypes'][0]['CFBundleTypeExtensions'] = extensies
                with self.assertRaises(ValueError):
                    module.controleer(gegevens, self.config, 'org.openaec.proef')

    def test_weigert_verkeerde_naam_rol_of_rang(self):
        for sleutel in ('CFBundleTypeName', 'CFBundleTypeRole', 'LSHandlerRank'):
            with self.subTest(sleutel=sleutel):
                gegevens = copy.deepcopy(self.plist)
                gegevens['CFBundleDocumentTypes'][0][sleutel] = 'anders'
                with self.assertRaises(ValueError):
                    module.controleer(gegevens, self.config, 'org.openaec.proef')

    def test_weigert_een_uti_lijst_die_extensies_kan_verdringen(self):
        self.plist['CFBundleDocumentTypes'][0]['LSItemContentTypes'] = ['public.text']
        with self.assertRaisesRegex(ValueError, 'UTI-lijst'):
            module.controleer(self.plist, self.config, 'org.openaec.proef')
