"""Synthetic provenance/ZIP tests, never package install or native acceptance."""
import hashlib
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("consumer", Path(__file__).with_name("linux-p2-native-package.py"))
consumer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(consumer)


class InputContract(unittest.TestCase):
    def test_exact_descriptor_and_tampering(self):
        data = consumer.DESCRIPTOR.read_bytes()
        value = consumer.descriptor(data)
        self.assertEqual(value["artifact"]["id"], 14804990580)
        self.assertEqual(value["debMember"], "canonical-office.deb")
        with self.assertRaises(AssertionError):
            consumer.descriptor(data + b"\n")

    def test_official_artifact_origin_digest_size_and_expiry(self):
        actual = dict(id=4, name="synthetic", expired=False, digest="sha256:abc", size_in_bytes=3,
                      workflow_run=dict(id=8, head_sha="source"))
        expected = dict(artifact_id=4, name="synthetic", run=8, source="source", sha256="abc", size=3)
        consumer.verify_artifact(actual, **expected)
        for patch in [dict(expired=True), dict(digest="sha256:bad"), dict(size_in_bytes=4),
                      dict(workflow_run=dict(id=9, head_sha="source")), dict(workflow_run=dict(id=8, head_sha="other"))]:
            with self.assertRaises(AssertionError):
                consumer.verify_artifact({**actual, **patch}, **expected)

    def test_exact_member_crc_size_and_sha(self):
        with tempfile.TemporaryDirectory() as temp:
            archive, output = Path(temp) / "input.zip", Path(temp) / "out.deb"
            with zipfile.ZipFile(archive, "w") as bundle:
                bundle.writestr("canonical-office.deb", b"synthetic")
            consumer.copy_verified_member(archive, output, "canonical-office.deb", 9, hashlib.sha256(b"synthetic").hexdigest())
            self.assertEqual(output.read_bytes(), b"synthetic")
            with self.assertRaises(AssertionError):
                consumer.copy_verified_member(archive, Path(temp) / "bad.deb", "canonical-office.deb", 8, "bad")

    def test_unsafe_missing_and_duplicate_members_stop(self):
        with tempfile.TemporaryDirectory() as temp:
            archive = Path(temp) / "input.zip"
            with zipfile.ZipFile(archive, "w") as bundle:
                bundle.writestr("canonical-office.deb", b"a")
                bundle.writestr("canonical-office.deb", b"a")
            for member in ["../escape.deb", "/absolute.deb", "bad\\name.deb", "missing.deb", "canonical-office.deb"]:
                with self.assertRaises(AssertionError):
                    consumer.copy_verified_member(archive, Path(temp) / "out.deb", member, 1, hashlib.sha256(b"a").hexdigest())


if __name__ == "__main__":
    unittest.main()
