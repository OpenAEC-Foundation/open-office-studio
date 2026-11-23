"""Safety/provenance contracts before fetching the one canonical archive."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import struct
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("runtime_input", Path(__file__).with_name("p2-runtime-input.py"))
producer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(producer)


def synthetic_tar(link="../share/data.txt"):
    stream = io.BytesIO()
    elf = bytearray(64)
    elf[:6] = b"\x7fELF\x02\x01"
    struct.pack_into("<H", elf, 18, 62)
    with tarfile.open(fileobj=stream, mode="w") as archive:
        root = tarfile.TarInfo("./")
        root.type = tarfile.DIRTYPE
        root.mode = 0o755
        archive.addfile(root)
        for name, data, mode in [("usr/bin/open-office-studio", bytes(elf), 0o755),
                                 (str(producer.RUNTIME / "program/soffice"), b"synthetic launcher", 0o755),
                                 (str(producer.RUNTIME / "share/data.txt"), b"included runtime resource", 0o644),
                                 (str(producer.META / "receipt.json"), b"{}", 0o644),
                                 ("usr/share/applications/Office.desktop", b"must not be extracted", 0o644)]:
            item = tarfile.TarInfo("./" + name)
            item.mode = mode
            item.size = len(data)
            archive.addfile(item, io.BytesIO(data))
        item = tarfile.TarInfo(str(producer.RUNTIME / "program/data-link"))
        item.type = tarfile.SYMTYPE
        item.linkname = link
        item.mode = 0o777
        archive.addfile(item)
    stream.seek(0)
    return stream


class Contracts(unittest.TestCase):
    def test_only_runtime_and_meta_extracted_while_app_elf_is_fingerprinted(self):
        with tempfile.TemporaryDirectory() as temp:
            payload = Path(temp) / "payload"
            exe, source = producer.extract_runtime(synthetic_tar(), payload)
            self.assertEqual(exe["machine"], "x86_64")
            self.assertFalse((payload / "usr/bin/open-office-studio").exists())
            self.assertFalse((payload / "usr/share/applications").exists())
            self.assertTrue((payload / producer.RUNTIME / "share/data.txt").is_file())
            entries = producer.entry_manifest(payload, source)
            link = next(e for e in entries if e["type"] == "symlink")
            self.assertEqual(link["linkTarget"], "../share/data.txt")
            self.assertTrue(link["resolvedPath"].endswith("/share/data.txt"))

    def test_rejects_escape_symlink(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(AssertionError):
                producer.extract_runtime(synthetic_tar("../../../../../../etc/passwd"), Path(temp) / "payload")

    def test_rejects_absolute_symlink(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(AssertionError):
                producer.extract_runtime(synthetic_tar("/usr/bin/soffice"), Path(temp) / "payload")

    def test_rejects_malformed_archive_path(self):
        for path in ("/usr/bin/test", "a/../outside"):
            with self.assertRaises(AssertionError): producer.safe_name(path)

    def test_tar_roundtrip_preserves_complete_file_modes_hashes_and_links(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            payload = root / "payload"
            producer.extract_runtime(synthetic_tar(), payload)
            before = producer.entry_manifest(payload)
            archive = root / "runtime.tar.gz"
            producer.portable_tar(payload, archive)
            consumer = root / "consumer"
            consumer.mkdir()
            with tarfile.open(archive) as bundle: bundle.extractall(consumer, filter="data")
            self.assertEqual(before, producer.entry_manifest(consumer / "payload"))

    def test_parent_gate_does_not_download_before_own_linux_success(self):
        run = {"head_sha": producer.SOURCE, "path": ".github/workflows/desktop.yml"}
        job = {"head_sha": producer.SOURCE, "run_id": producer.RUN, "name": "desktop (ubuntu-22.04)", "status": "in_progress", "conclusion": None}
        with patch.object(producer, "api", side_effect=[run, job]), patch.object(producer, "download") as fetch:
            with self.assertRaises(AssertionError): producer.bind_parent(Path("unused"))
            fetch.assert_not_called()


if __name__ == "__main__": unittest.main()
