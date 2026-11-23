"""Negative checks for a manifest-only binding: equal counts must not hide changed bytes/links."""
import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("binding", Path(__file__).with_name("format30-stw-package-binding.py"))
binding = importlib.util.module_from_spec(spec)
spec.loader.exec_module(binding)


class ManifestBoundary(unittest.TestCase):
    def setUp(self):
        self.source = [{"path": "program/soffice", "bytes": 4, "sha256": "a" * 64},
                       {"path": "program/link", "link": "soffice"},
                       {"path": "meta/receipt.json", "bytes": 1, "sha256": "b" * 64}]
        self.entries = [{"path": "payload/runtime/program/soffice", "type": "file", "bytes": 4, "sha256": "a" * 64},
                        {"path": "payload/runtime/program/link", "type": "symlink", "linkTarget": "soffice"},
                        {"path": "payload/runtime/meta/receipt.json", "type": "file", "bytes": 2, "sha256": "c" * 64}]

    def test_metadata_stays_visible_and_is_not_payload_equality(self):
        result = binding.compare(self.source, self.entries, "payload/runtime")
        self.assertTrue(result["passed"])
        self.assertEqual((result["matchedFiles"], result["matchedSymlinks"]), (1, 1))
        self.assertNotEqual(result["testedMetadata"][0]["sha256"], result["packagedMetadata"][0]["sha256"])

    def test_same_count_changed_bytes_link_or_path_are_rejected(self):
        for index, key, value in [(0, "sha256", "f" * 64), (1, "linkTarget", "outside"), (0, "path", "payload/runtime/unexpected")]:
            entries = copy.deepcopy(self.entries)
            entries[index][key] = value
            self.assertFalse(binding.compare(self.source, entries, "payload/runtime")["passed"])


if __name__ == "__main__":
    unittest.main()
