"""Isolation and transfer regression tests. No GUI, PID or real profiles touched."""
from pathlib import Path
import json
import tempfile
import unittest
from unittest.mock import patch
from native import environment,profile_paths,forbidden_suite_state
from run import verify_transfer
from test_contracts import request
from contracts import APPS,digest


class IsolationTests(unittest.TestCase):
    def test_suite_namespace_created_after_preflight_is_detected_without_deletion(self):
        with tempfile.TemporaryDirectory(prefix="standalone-suite-guard-") as t:
            home=Path(t)
            self.assertEqual(forbidden_suite_state(home,"42 /own/open-writer-studio"),[])
            suite=home/"Library/Application Support/org.openaec.office-studio";suite.mkdir(parents=True)
            receipt=suite/"sentinel";receipt.write_bytes(b"do not delete")
            found=forbidden_suite_state(home,"43 /wrong/open-office-studio")
            self.assertIn(str(suite),found);self.assertEqual(receipt.read_bytes(),b"do not delete")
            self.assertTrue(any("/wrong/open-office-studio" in row for row in found))

    def test_environment_drops_suite_developer_and_converter_overrides(self):
        inherited={"HOME":"/Users/own","USER":"own","PATH":"/Suite/Contents/MacOS:/opt/homebrew/bin",
            "OPENAEC_CONVERSIE_PROGRAMMA":"/Suite/soffice","OPENAEC_CONVERSIE_PROFIEL":"/Suite/profile",
            "DYLD_LIBRARY_PATH":"/Suite/runtime","NODE_PATH":"/project/node_modules","VITE_STUDIO_VARIANT":"office",
            "GH_TOKEN":"not-an-app-secret"}
        actual=environment(inherited)
        self.assertEqual(actual,{"HOME":"/Users/own","USER":"own","PATH":"/usr/bin:/bin:/usr/sbin:/sbin"})

    def test_profiles_bind_only_dedicated_identifier_in_real_home(self):
        root=Path("synthetic-home").resolve()
        paths=profile_paths(APPS["writer"][2],root)
        self.assertEqual(len(paths),7)
        self.assertTrue(all(p.is_relative_to(root/"Library") for p in paths))
        self.assertTrue(all(p.name.startswith(APPS["writer"][2]) for p in paths))
        self.assertFalse(any(p.name.startswith("org.openaec.office-studio") for p in paths))

    def test_transfer_hash_source_member_bytes_are_separate_gates(self):
        with tempfile.TemporaryDirectory(prefix="standalone-transfer-") as t:
            root=Path(t);q=request();name=Path(q["packages"]["writer"]["member"]).name
            dmg=root/name;dmg.write_bytes(b"synthetic not executable")
            q["packages"]["writer"]["sha256"]=digest(dmg)
            p={"app":"writer","source":q["source"],"parentArtifact":q["parentArtifact"],
               "member":q["packages"]["writer"]["member"],
               "package":{"filename":name,"bytes":dmg.stat().st_size,"sha256":digest(dmg)}}
            (root/"request.json").write_text(json.dumps(q));(root/"provenance.json").write_text(json.dumps(p))
            with patch("run.check_harness"):
                self.assertEqual(verify_transfer(root,"writer")[2],dmg.resolve())
                for key,bad in (("source",{}),("member","suite.dmg"),("app","office")):
                    (root/"provenance.json").write_text(json.dumps({**p,key:bad}))
                    with self.assertRaises(ValueError):verify_transfer(root,"writer")
                (root/"provenance.json").write_text(json.dumps(p));dmg.write_bytes(b"same identity altered bytes")
                with self.assertRaises(ValueError):verify_transfer(root,"writer")


if __name__=="__main__":unittest.main()
