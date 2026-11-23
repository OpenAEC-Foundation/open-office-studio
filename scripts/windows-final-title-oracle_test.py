"""Use a real exported DOCX to prove text-only/field-flattening false passes reject."""
import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile
from xml.etree import ElementTree as ET

fixture = Path(sys.argv.pop(1)).resolve()
spec = importlib.util.spec_from_file_location("stw_oracle", Path(__file__).with_name("format30-stw-oracle.py"))
oracle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(oracle)
marker = " -- STW30 EDIT 2026-11-23"


class TitleFieldTests(unittest.TestCase):
    def variant(self, edit):
        with zipfile.ZipFile(fixture) as archive:
            entries = {n: archive.read(n) for n in archive.namelist()}
        root = ET.fromstring(entries["word/document.xml"])
        p = next(p for p in root.find("w:body", oracle.NS).iter(oracle.q("w", "p")) if oracle.normalize(oracle.docx_text(p)))
        before = oracle.docx_text(p)
        edit(p)
        self.assertEqual(oracle.docx_text(p), before, "Counterexample must preserve all visible paragraph text")
        entries["word/document.xml"] = ET.tostring(root)
        with tempfile.TemporaryDirectory(prefix="oos-title-oracle-") as temp:
            path = Path(temp) / "counterexample.docx"
            with zipfile.ZipFile(path, "w") as archive:
                for n, value in entries.items():
                    archive.writestr(n, value)
            with self.assertRaises(AssertionError):
                oracle.title_field_contract(path, marker)

    def test_original_preserves_real_field_and_ordinary_marker(self):
        value = oracle.title_field_contract(fixture, marker)
        self.assertEqual(value["instruction"], "DOCVARIABLE Report")
        self.assertEqual(value["cachedText"], "Report Title")
        self.assertEqual(value["appendedOrdinaryText"], marker)

    def test_flattened_title_rejects_even_when_all_plain_text_survives(self):
        def flatten(p):
            for parent in p.iter():
                for child in list(parent):
                    if child.tag in (oracle.q("w", "fldChar"), oracle.q("w", "instrText")):
                        parent.remove(child)
        self.variant(flatten)

    def test_changed_field_definition_rejects_with_identical_visible_text(self):
        def change(p):
            next(p.iter(oracle.q("w", "instrText"))).text = " DOCVARIABLE DifferentVariable "
        self.variant(change)

    def test_marker_absorbed_into_field_rejects_with_identical_visible_text(self):
        def absorb(p):
            end_run = next(r for r in p if any(n.get(oracle.q("w", "fldCharType")) == "end" for n in r.iter(oracle.q("w", "fldChar"))))
            p.remove(end_run)
            p.append(end_run)
        self.variant(absorb)


if __name__ == "__main__":
    unittest.main(verbosity=2)
