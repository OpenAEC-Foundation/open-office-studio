import json
from pathlib import Path
import runpy
import subprocess
import tempfile
import unittest

HERE = Path(__file__).parent
verify = runpy.run_path(str(HERE/"mac-native-signed-package.py"))["verify_signed_bundle"]
member = runpy.run_path(str(HERE/"mac-native-current-fetch.py"))["package_member"]


class SignedPackage(unittest.TestCase):
    def run_check(self, changes=None, failure=None):
        values = {"codesign-verify": "", "codesign-display": "Identifier=org.openaec.office-studio\nTeamIdentifier=TESTTEAM\nAuthority=Developer ID Application: Test (TESTTEAM)\n",
                  "gatekeeper": "accepted\nsource=Notarized Developer ID\n", "stapled-ticket": "The validate action worked!\n"}
        values.update(changes or {})
        def runner(command, **kwargs):
            name = "codesign-verify" if command[0:2] == ["codesign", "--verify"] else ("codesign-display" if command[0] == "codesign" else ("gatekeeper" if command[0] == "spctl" else "stapled-ticket"))
            return subprocess.CompletedProcess(command, 1 if name == failure else 0, "", values[name])
        with tempfile.TemporaryDirectory() as tmp:
            evidence = {}
            try:
                result = verify(Path(tmp)/"Owned Suite.app", Path(tmp)/"proof", evidence, runner)
                self.assertEqual(json.loads((Path(tmp)/"proof/report.json").read_text()), evidence)
                return result
            except RuntimeError:
                self.assertEqual(json.loads((Path(tmp)/"proof/report.json").read_text())["status"], "failed")
                raise

    def test_signed_notarized_stapled_suite(self):
        proof = self.run_check(); self.assertEqual(proof["status"], "passed")
        self.assertEqual(len(proof["checks"]), 4); self.assertFalse(proof["appModified"])

    def test_signature_rejection(self):
        with self.assertRaises(RuntimeError): self.run_check(failure="codesign-verify")

    def test_adhoc_rejected(self):
        with self.assertRaises(RuntimeError): self.run_check({"codesign-display": "Identifier=org.openaec.office-studio\nSignature=adhoc\n"})

    def test_wrong_application_rejected(self):
        with self.assertRaises(RuntimeError): self.run_check({"codesign-display": "Identifier=other.app\nTeamIdentifier=TESTTEAM\nAuthority=Developer ID Application: Test\n"})

    def test_missing_team_rejected(self):
        with self.assertRaises(RuntimeError): self.run_check({"codesign-display": "Identifier=org.openaec.office-studio\nAuthority=Developer ID Application: Test\n"})

    def test_non_notarized_gatekeeper_source_rejected(self):
        with self.assertRaises(RuntimeError): self.run_check({"gatekeeper": "accepted\nsource=Developer ID\n"})

    def test_missing_stapled_ticket_rejected(self):
        with self.assertRaises(RuntimeError): self.run_check(failure="stapled-ticket")


class ExactArchiveMember(unittest.TestCase):
    suite = "dist-installers/office/dmg/Open Office Studio_2026.48.1_aarch64.dmg"
    other = "dist-installers/writer/dmg/Open Writer Studio_2026.48.1_aarch64.dmg"

    def test_legacy_single_member(self):
        self.assertEqual(member({"declaredVersion": "2026.48.1"}, [self.suite]), self.suite)

    def test_exact_suite_member_of_seven_app_archive(self):
        self.assertEqual(member({"declaredVersion": "2026.48.1", "packageMember": self.suite}, [self.suite, self.other]), self.suite)

    def test_multiple_unpinned_members_rejected(self):
        with self.assertRaises(RuntimeError): member({"declaredVersion": "2026.48.1"}, [self.suite, self.other])

    def test_missing_exact_member_rejected(self):
        with self.assertRaises(RuntimeError): member({"declaredVersion": "2026.48.1", "packageMember": self.suite}, [self.other])

    def test_explicit_final_member_pin_is_mandatory(self):
        with self.assertRaises(RuntimeError): member({"declaredVersion": "2026.48.1", "requireExactPackageMember": True}, [self.suite])

    def test_duplicate_exact_member_rejected(self):
        with self.assertRaises(RuntimeError): member({"declaredVersion": "2026.48.1", "packageMember": self.suite}, [self.suite, self.suite])

    def test_unsafe_member_rejected(self):
        for value in ["../Open Office Studio_2026.48.1.dmg", "/Open Office Studio_2026.48.1.dmg", "office\\Open Office Studio_2026.48.1.dmg"]:
            with self.subTest(value=value), self.assertRaises(RuntimeError): member({"declaredVersion": "2026.48.1"}, [value])

    def test_wrong_version_rejected(self):
        with self.assertRaises(RuntimeError): member({"declaredVersion": "2026.48.2"}, [self.suite])


if __name__ == "__main__": unittest.main()
