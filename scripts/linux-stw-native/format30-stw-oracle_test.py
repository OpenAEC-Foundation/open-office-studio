"""QA-oracle tests only. No office/runtime/engine execution or product-acceptance claim."""
import importlib.util
import os
import tempfile
import unittest
import zipfile
from xml.etree import ElementTree as ET
from pathlib import Path

spec = importlib.util.spec_from_file_location("stw_oracle", Path(__file__).with_name("format30-stw-oracle.py"))
oracle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(oracle)


class SourceOracleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = Path(os.environ.get("OOS_STW_FIXTURE", ".local/stw30/source/lo-report.stw"))
        cls.expected = oracle.source_oracle(cls.source)

    def test_real_source_is_old_container_with_source_derived_properties(self):
        self.assertEqual(len(self.expected["paragraphs"]), 8)
        self.assertEqual(self.expected["paragraphs"][0]["text"], "Report Title")
        self.assertEqual(self.expected["paragraphs"][0]["properties"]["sizePt"], 32)
        self.assertEqual(self.expected["paragraphs"][1]["properties"]["sizePt"], 24)
        self.assertTrue(self.expected["paragraphs"][1]["properties"]["smallCaps"])
        self.assertEqual(self.expected["paragraphs"][6]["headingLevel"], 1)
        self.assertTrue(self.expected["paragraphs"][6]["properties"]["bold"])
        self.assertEqual(self.expected["tableCount"], 0)
        self.assertFalse(self.expected["container"]["mimetypeEntryPresent"])
        self.assertEqual(self.expected["paragraphs"][6]["text"], "This is the heading of the first section")
        self.assertEqual(self.expected["paragraphs"][6]["sourceDisplayText"], "<This is the heading of the first section>")
        self.assertTrue(self.expected["paragraphs"][3]["text"].startswith("<This is"), "Literal cached-index brackets are not stripped")

    def test_real_converted_placeholder_contract_and_lost_field_counterexample(self):
        converted = Path(os.environ.get("OOS_STW_CONVERTED", ".local/stw30/attempt1/converted.docx"))
        if not converted.exists():
            self.skipTest("No Linux-CI converted output supplied; not a local converter test")
        self.assertTrue(oracle.docx_audit(converted, self.expected)["passed"])
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "fields-flattened.docx"
            with zipfile.ZipFile(converted) as archive:
                files = {name: archive.read(name) for name in archive.namelist()}
            document = ET.fromstring(files["word/document.xml"])
            for parent in document.iter():
                for control in list(parent):
                    if control.tag != oracle.q("w", "sdt") or control.find("w:sdtPr/w:showingPlcHdr", oracle.NS) is None:
                        continue
                    at = list(parent).index(control)
                    for child in list(control.find("w:sdtContent", oracle.NS)):
                        parent.insert(at, child)
                        at += 1
                    parent.remove(control)
            files["word/document.xml"] = ET.tostring(document)
            with zipfile.ZipFile(path, "w") as archive:
                for name, data in files.items():
                    archive.writestr(name, data)
            with self.assertRaisesRegex(AssertionError, "Source placeholder contract lost"):
                oracle.docx_audit(path, self.expected)

    def test_changed_or_renamed_input_cannot_be_positive_fixture(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "renamed.stw"
            p.write_bytes(b"<!DOCTYPE HTML><p>template</p>")
            with self.assertRaisesRegex(AssertionError, "Wrong immutable source"):
                oracle.source_oracle(p)
            changed = bytearray(self.source.read_bytes())
            changed[-1] ^= 1
            p.write_bytes(changed)
            with self.assertRaisesRegex(AssertionError, "Wrong immutable source"):
                oracle.source_oracle(p)

    def test_empty_conversion_is_not_accepted(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "empty.docx"
            self.counterexample(p, "", "")
            with self.assertRaisesRegex(AssertionError, "Missing/reordered source paragraph 0"):
                oracle.docx_audit(p, self.expected)

    def test_surviving_text_does_not_hide_lost_title_formatting(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "style-lost.docx"
            self.counterexample(p, '<w:p><w:r><w:t>Report Title</w:t></w:r></w:p>', '')
            with self.assertRaisesRegex(AssertionError, "Source-derived style mismatch at 0"):
                oracle.docx_audit(p, self.expected)

    @staticmethod
    def counterexample(path, body, styles):
        # Minimal negative OOXML examples test the audit's refusal, never a successful product route.
        ns = oracle.NS["w"]
        with zipfile.ZipFile(path, "w") as archive:
            archive.writestr("word/document.xml", f'<w:document xmlns:w="{ns}"><w:body>{body}</w:body></w:document>')
            archive.writestr("word/styles.xml", f'<w:styles xmlns:w="{ns}">{styles}</w:styles>')


if __name__ == "__main__":
    unittest.main()
