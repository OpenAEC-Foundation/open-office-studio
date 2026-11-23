"""Bounded request/archive contracts only; no download/install/application."""
import copy
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("consumer", Path(__file__).with_name("linux-suite-native-package.py"))
consumer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(consumer)


def fixture():
    request = dict(go=True, publicationAuthorized=False, supersededCandidates=[], candidate=dict(commit="a" * 40, tree="b" * 40, version="2026.48.1", producerRun=1, linuxJob=2, attempt=1))
    value = dict(schemaVersion=1, executionApproved=True, parent=dict(sourceCommit="a" * 40, sourceTree="b" * 40, appVersion="2026.48.1", run=1, job=2, attempt=1, jobConclusion="success", reportArchive=None, installerArchive=dict(id=3, name="uitgave-Linux", sha256="c" * 64, bytes=9), packageReportSha256="d" * 64, packageReportMember="report.json", packageMember="dist/office.deb"), artifact=dict(run=4, id=5, name="suite-input", zipSha256="e" * 64, zipBytes=7), qaPin=dict(producerCommit="f" * 40), package=dict(kind="deb", member="canonical-office.deb", sha256="1" * 64, bytes=8, control=dict(Package="open-office-studio", Version="2026.48.1", Architecture="amd64", Depends="libgtk-3-0, libwebkit2gtk-4.1-0, zenity"), payloadElf=dict(path="usr/bin/open-office-studio", sha256="2" * 64, bytes=6, mode=0o755, elfClass=2, machine=62)), signatureBinding=dict(publicationAuthorized=False))
    return request, value


class Contracts(unittest.TestCase):
    def test_bound_descriptor(self):
        request, value = fixture()
        self.assertIs(consumer.validate_descriptor(value, request, "deb"), value)

    def test_no_go_no_execution(self):
        request, value = fixture()
        for target in (request, value):
            candidate = copy.deepcopy(target)
            candidate["go" if target is request else "executionApproved"] = False
            with self.assertRaises(AssertionError):
                consumer.validate_descriptor(value if target is request else candidate, candidate if target is request else request, "deb")

    def test_wrong_source_attempt_or_incomplete_metadata(self):
        request, value = fixture()
        for key, wrong in [("sourceCommit", "0" * 40), ("attempt", 2), ("jobConclusion", "failure"), ("packageReportSha256", None)]:
            bad = copy.deepcopy(value)
            bad["parent"][key] = wrong
            with self.assertRaises(AssertionError):
                consumer.validate_descriptor(bad, request, "deb")

    def test_requires_declared_confirmation_dependency(self):
        request, value = fixture()
        value["package"]["control"]["Depends"] = "libgtk-3-0"
        with self.assertRaises(AssertionError):
            consumer.validate_descriptor(value, request, "deb")

    def test_appimage_has_own_payload_and_no_deb_control_alias(self):
        request, value = fixture()
        value["package"].update(kind="appimage", member="canonical-office.AppImage", control=None)
        value["parent"]["packageMember"] = "dist/office.AppImage"
        consumer.validate_descriptor(value, request, "appimage")

    def test_package_kind_and_elf_are_not_aliased(self):
        request, value = fixture()
        with self.assertRaises(AssertionError):
            consumer.validate_descriptor(value, request, "appimage")
        value["package"]["payloadElf"]["machine"] = 183
        with self.assertRaises(AssertionError):
            consumer.validate_descriptor(value, request, "deb")

    def test_safe_relative_members_only(self):
        for member in ("../package", "/package", "x\\package"):
            with self.assertRaises(AssertionError):
                consumer.safe_member(member)

    def test_official_artifact_digest_source_and_run(self):
        expected = dict(id=1, name="suite", zipSha256="a" * 64, zipBytes=3)
        actual = dict(id=1, name="suite", expired=False, workflow_run=dict(id=2, head_sha="b" * 40), digest="sha256:" + "a" * 64, size_in_bytes=3)
        consumer.verify_artifact(actual, expected, 2, "b" * 40, transfer=True)
        for key, wrong in [("digest", "sha256:" + "c" * 64), ("size_in_bytes", 4), ("expired", True)]:
            bad = copy.deepcopy(actual)
            bad[key] = wrong
            with self.assertRaises(AssertionError):
                consumer.verify_artifact(bad, expected, 2, "b" * 40, transfer=True)

    def test_exact_member_hash_and_duplicate_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            data = b"owned test bytes"
            package = dict(member="canonical-office.deb", bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
            with zipfile.ZipFile(root / "input.zip", "w") as bundle:
                bundle.writestr(package["member"], data)
            consumer.copy_package(root / "input.zip", root / "out.deb", package)
            self.assertEqual((root / "out.deb").read_bytes(), data)
            with zipfile.ZipFile(root / "duplicate.zip", "w") as bundle:
                bundle.writestr(package["member"], data)
                bundle.writestr(package["member"], data)
            with self.assertRaises(AssertionError):
                consumer.copy_package(root / "duplicate.zip", root / "never.deb", package)


if __name__ == "__main__":
    unittest.main()
