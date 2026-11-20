"""Credential/handle rejection contracts using synthetic protocol messages only."""
import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("portal", Path(__file__).with_name("epub356-final-linux-portal.py"))
portal = importlib.util.module_from_spec(spec)
spec.loader.exec_module(portal)

FRONT = '''method call time=1 sender=:1.12 -> destination=org.freedesktop.portal.Desktop serial=7 path=/org/freedesktop/portal/desktop; interface=org.freedesktop.portal.FileChooser; member=SaveFile
   string ""
   string "Save as"
   array [
      dict entry(
         string "handle_token"
         variant             string "owned_token"
      )
      dict entry(
         string "current_name"
         variant             string "leesvolgorde.docx"
      )
   ]
'''
BACK = '''method call time=2 sender=:1.2 -> destination=:1.3 serial=9 path=/org/freedesktop/portal/desktop; interface=org.freedesktop.impl.portal.FileChooser; member=SaveFile
   object path "/org/freedesktop/portal/desktop/request/1_12/owned_token"
   string ""
   string ""
   string "Save as"
   array [
      dict entry(
         string "current_name"
         variant             string "leesvolgorde.docx"
      )
   ]
'''


class CorrelationContracts(unittest.TestCase):
    def setUp(self):
        self.calls = [portal.parse_call(FRONT), portal.parse_call(BACK)]
        self.owners = {portal.BROKER: ":1.2", portal.GTK: ":1.3"}
        self.pids = {":1.12": 501, ":1.2": 502, ":1.3": 503}

    def correlate(self):
        return portal.select_correlation(self.calls, 501, {"leesvolgorde.docx", "leesvolgorde"},
                                         self.owners.__getitem__, self.pids.__getitem__)

    def test_matching_wire_request_binds_actual_peer_credentials(self):
        result = self.correlate()
        self.assertEqual(result["ownedPid"], 501)
        self.assertEqual(result["backendPid"], 503)
        self.assertEqual(result["requestHandle"], "/org/freedesktop/portal/desktop/request/1_12/owned_token")

    def test_same_title_filename_and_handle_cannot_override_foreign_client_pid(self):
        self.pids[":1.12"] = 999
        self.assertIsNone(self.correlate())

    def test_mismatched_forwarded_handle_is_not_attributable(self):
        self.calls[1]["handle"] += "_other"
        self.assertIsNone(self.correlate())

    def test_backend_must_be_sent_by_live_portal_broker_owner(self):
        self.calls[1]["sender"] = ":1.55"
        self.assertIsNone(self.correlate())

    def test_backend_must_be_addressed_to_live_gtk_owner(self):
        self.calls[1]["destination"] = ":1.66"
        self.assertIsNone(self.correlate())

    def test_two_owned_requests_are_ambiguous(self):
        extra = copy.deepcopy(self.calls[0]); extra["token"] = "another"
        self.calls.append(extra)
        with self.assertRaisesRegex(AssertionError, "multiple owned"):
            self.correlate()

    def test_two_backend_requests_are_ambiguous_even_with_one_matching(self):
        self.calls.append(copy.deepcopy(self.calls[1]))
        with self.assertRaisesRegex(AssertionError, "multiple backend"):
            self.correlate()

    def test_missing_token_or_incomplete_frame_never_authorizes(self):
        self.calls[0]["token"] = None
        self.assertIsNone(self.correlate())
        self.assertIsNone(portal.parse_call("method call time=1 sender=:1.2"))

    def test_wrong_filename_or_backend_name_is_not_authorized(self):
        self.calls[1]["currentName"] = "other.docx"
        self.assertIsNone(self.correlate())
        self.calls[1]["currentName"] = "leesvolgorde.docx"
        self.calls[0]["destination"] = "org.foreign.Portal"
        self.assertIsNone(self.correlate())

    def test_not_a_savefile_call_or_wrong_object_is_ignored(self):
        self.assertIsNone(portal.parse_call(FRONT.replace("member=SaveFile", "member=OpenFile")))
        self.assertIsNone(portal.parse_call(FRONT.replace("path=/org/freedesktop/portal/desktop;", "path=/wrong;")))


if __name__ == "__main__":
    unittest.main()
