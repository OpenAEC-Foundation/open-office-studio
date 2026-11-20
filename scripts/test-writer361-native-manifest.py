"""Canonical-manifest protocol tests only; no download, build or app execution."""
import base64
import copy
import hashlib
import json
from pathlib import Path
import runpy
import unittest

MODULE = runpy.run_path(str(Path(__file__).with_name('writer361-native-manifest.py')))
VERIFY = MODULE['verify_root_candidate']
VALIDATE = MODULE['validate']


def candidate():
    root = {'schemaVersion': 1, 'frozen': True, 'applicationCommit': '1'*40,
            'desktopRun': 9, 'artifacts': {'Linux': {'name': 'office-Linux',
            'archiveSha256': '3'*64, 'packages': [{'path': 'deb/office.deb', 'sha256': '4'*64}]}}}
    # CRLF is intentional: the exact original bytes must survive roundtrip.
    raw = json.dumps(root, indent=2).replace('\n', '\r\n').encode()
    value = {'sourceCommit': '1'*40, 'sourceTree': '2'*40, 'artifactRun': 9,
             'artifactId': 10, 'platform': 'Linux', 'archiveSha256': '3'*64,
             'packageMember': 'deb/office.deb', 'packageSha256': '4'*64,
             'executionApproved': True, 'rootFrozenCandidateSha256': hashlib.sha256(raw).hexdigest(),
             'rootFrozenCandidateBase64': base64.b64encode(raw).decode()}
    return value, raw


class ManifestTests(unittest.TestCase):
    def test_exact_original_bytes_roundtrip(self):
        value, raw = candidate()
        self.assertEqual(VERIFY(value)[0], raw)
        self.assertEqual(VALIDATE(value, 'linux'), value)

    def test_tampered_byte_stream_is_rejected(self):
        value, raw = candidate()
        value['rootFrozenCandidateBase64'] = base64.b64encode(raw+b'\n').decode()
        with self.assertRaisesRegex(ValueError, 'byte hash'):
            VERIFY(value)

    def test_reserialization_does_not_match_original_hash(self):
        value, raw = candidate()
        value['rootFrozenCandidateBase64'] = base64.b64encode(json.dumps(json.loads(raw)).encode()).decode()
        with self.assertRaises(ValueError):
            VERIFY(value)

    def test_foreign_source_or_run_is_rejected(self):
        for field, foreign in [('sourceCommit', '5'*40), ('artifactRun', 11)]:
            value, _ = candidate()
            value[field] = foreign
            with self.assertRaisesRegex(ValueError, 'source/run'):
                VERIFY(value)

    def test_wrong_selected_archive_or_package_is_rejected(self):
        for field, foreign in [('archiveSha256', '5'*64), ('packageSha256', '5'*64), ('packageMember', 'deb/other.deb')]:
            value, _ = candidate()
            value[field] = foreign
            with self.assertRaisesRegex(ValueError, 'archive/package'):
                VERIFY(value)

    def test_no_release_no_execute(self):
        value, _ = candidate()
        value['executionApproved'] = False
        with self.assertRaisesRegex(ValueError, 'execution approval'):
            VALIDATE(value, 'linux')


if __name__ == '__main__':
    unittest.main()
