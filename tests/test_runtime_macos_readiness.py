"""The native driver must not retry permission failures or another app's PID."""
from pathlib import Path
import runpy
import unittest

retry = runpy.run_path(str(Path(__file__).resolve().parents[1] /
                          "scripts/proef-runtime-macos-interface.py"))["temporary_ax_failure"]


class NativeReadinessBoundary(unittest.TestCase):
    def test_only_trusted_live_cannot_complete_can_retry(self):
        state = {"status": "blocked", "trusted": True, "errors": {"-25204": 1}}
        self.assertTrue(retry(state, 71, [71]))
        self.assertFalse(retry(state, 71, []))
        self.assertFalse(retry(state, 71, [72]))

    def test_permissions_and_unsupported_attributes_remain_blocked(self):
        self.assertFalse(retry({"status": "blocked", "trusted": False,
                                "errors": {"-25204": 1}}, 71, [71]))
        self.assertFalse(retry({"status": "blocked", "trusted": True,
                                "errors": {"-25205": 1}}, 71, [71]))

    def test_success_is_not_retried(self):
        self.assertFalse(retry({"status": "ok", "trusted": True,
                                "errors": {"-25204": 1}}, 71, [71]))


if __name__ == "__main__":
    unittest.main()
