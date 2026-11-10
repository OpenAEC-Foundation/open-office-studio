"""Dezelfde selectiepatch mag na activatie niet nogmaals worden toegepast."""
import importlib.util
from pathlib import Path
import unittest


spec = importlib.util.spec_from_file_location(
    "selectie_opmaak", Path(__file__).with_name("controleer-selectie-opmaak.py")
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class BronpatchesTest(unittest.TestCase):
    def setUp(self):
        self.prototype = {"patch": "selectie.patch", "patchSha256": "abc"}
        self.basis = {"patch": "basis.patch", "patchSha256": "def"}
        self.tabel = {"patch": "tabel.patch", "patchSha256": "ghi"}

    def test_voegt_nog_niet_actief_prototype_als_laatste_toe(self):
        metadata = {**self.basis, "extraPatches": [self.tabel]}
        self.assertEqual(
            module.bronpatches(metadata, self.prototype),
            [metadata, self.tabel, self.prototype],
        )
        self.assertEqual(metadata["extraPatches"], [self.tabel])

    def test_laat_actieve_selectiepatch_op_dezelfde_plek_staan(self):
        actief = dict(self.prototype)
        metadata = {**self.basis, "extraPatches": [actief, self.tabel]}
        self.assertEqual(
            module.bronpatches(metadata, self.prototype),
            [metadata, actief, self.tabel],
        )

    def test_weigert_actieve_selectie_met_afwijkende_checksum(self):
        actief = {**self.prototype, "patchSha256": "anders"}
        metadata = {**self.basis, "extraPatches": [actief]}
        with self.assertRaisesRegex(SystemExit, "wijkt af"):
            module.bronpatches(metadata, self.prototype)

    def test_weigert_dubbele_selectiepatch_in_actieve_metadata(self):
        metadata = {**self.basis, "extraPatches": [self.prototype, self.prototype]}
        with self.assertRaisesRegex(SystemExit, "meermaals"):
            module.bronpatches(metadata, self.prototype)


if __name__ == "__main__":
    unittest.main()
