"""Isolation and transfer regression tests. No GUI, PID or real profiles touched."""
from pathlib import Path
import json
import tempfile
import subprocess
import unittest
from unittest.mock import patch
from native import environment,profile_paths,forbidden_suite_state,runtime_inventory,Session,Unavailable
from run import verify_transfer
from test_contracts import request
from contracts import APPS,digest


class CleanupSession:
    def __init__(self,identifier="save-panel",remaining=1,unknown_foreground=False):
        self.panel=identifier;self.remaining=remaining;self.unknown_foreground=unknown_foreground
        self.actions=[];self.report={};self.reads=0
        self.process=type('Process',(),{'pid':42,'returncode':0,'wait':lambda p,timeout:None})()
    def ax(self,action,spec=None):
        if action=="snapshot":
            self.reads+=1
            focus={'AXRole':'AXTextField','AXIdentifier':'filename','AXFocused':True,
                   'frame':{'x':30,'y':30,'width':100,'height':20}}
            nodes=[]
            if self.remaining:
                nodes=[{'index':0,'parent':-1,'attributes':{'AXRole':'AXSheet','AXIdentifier':self.panel}},
                       {'index':1,'parent':0,'attributes':dict(focus)}]
                if self.unknown_foreground:
                    nodes[1]['attributes']['AXFocused']=False
                    focus={**focus,'AXIdentifier':'unknown-confirmation-field'}
                    nodes.extend([{'index':2,'parent':-1,'attributes':{'AXRole':'AXSheet','AXIdentifier':'unknown-confirmation'}},
                                  {'index':3,'parent':2,'attributes':dict(focus)}])
            return {'rawNodes':nodes,'focused':focus}
        self.actions.append((action,spec))
        if action=='cancel-file-panel':self.remaining-=1
    def stop_watch(self):pass
    def guard_suite_namespace(self):pass
    def write(self,*args):pass


class IsolationTests(unittest.TestCase):
    def test_unselected_retry_app_is_rejected_before_package_or_native_setup(self):
        with tempfile.TemporaryDirectory(prefix="standalone-selected-app-") as t:
            root=Path(t);q=request();q['executeApps']=['email']
            (root/'request.json').write_text(json.dumps(q))
            with self.assertRaises(PermissionError):verify_transfer(root,'writer')

    def test_normal_cleanup_cancels_only_an_owned_native_file_panel_before_cmd_q(self):
        own=CleanupSession()
        with patch('native.time.sleep'):self.assertEqual(Session.quit(own),42)
        self.assertEqual(own.actions,[('cancel-file-panel',None),('key','cmd-q')])
        unknown=CleanupSession('unsaved-document-confirmation')
        unknown.process.wait=lambda timeout:(_ for _ in ()).throw(subprocess.TimeoutExpired('own-app',timeout))
        with self.assertRaises(Unavailable):Session.quit(unknown)
        self.assertEqual(unknown.actions,[('key','cmd-q')])
        self.assertNotIn('fullQuitVerified',unknown.report)

    def test_known_panel_behind_unknown_focused_confirmation_never_gets_cancelled(self):
        own=CleanupSession(unknown_foreground=True)
        with self.assertRaises(Unavailable):Session.quit(own)
        self.assertEqual(own.actions,[])
        self.assertNotIn('fullQuitVerified',own.report)

    def test_third_successful_native_panel_cancel_gets_final_observation(self):
        own=CleanupSession(remaining=3)
        with patch('native.time.sleep'):self.assertEqual(Session.quit(own),42)
        self.assertEqual(own.reads,4)
        self.assertEqual(own.actions,[('cancel-file-panel',None)]*3+[('key','cmd-q')])

    def test_inventory_includes_private_signed_helpers_and_bound_runtime_receipt(self):
        with tempfile.TemporaryDirectory(prefix="standalone-private-inventory-") as t:
            bundle=Path(t)/"Own.app"
            helper=bundle/"Contents/Helpers/LibreOffice.app/Contents/MacOS/soffice"
            receipt=bundle/"Contents/Resources/kantoorruntime/meta/receipt.json"
            for p,data in ((helper,b"private synthetic runtime"),(receipt,b'{"synthetic":true}')):
                p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
            records=runtime_inventory(bundle)
            self.assertEqual({r["relative"] for r in records},{p.relative_to(bundle).as_posix() for p in (helper,receipt)})
            self.assertTrue(all(r["resolvedInsideOwnApp"] for r in records))
            self.assertEqual({r["sha256"] for r in records},{digest(helper),digest(receipt)})

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
