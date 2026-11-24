import copy
from pathlib import Path
import runpy
import unittest

M = runpy.run_path(str(Path(__file__).with_name("mac-native-writer-preflight.py")))


def state(dirty):
    return {"pid":17,"frontmostPid":17,"applicationActive":True,
            "focusAfter":{"role":"AXTextArea","description":"Document input"},
            "window":{"title":"private.docx" + (" \u2022" if dirty else "") + " \u2014 Open Office Studio (Text)"}}


class NativeSaveReadiness(unittest.TestCase):
    def test_delayed_dirty_and_saved_ui_are_observed_without_input(self):
        for wanted in [True,False]:
            values=iter([state(not wanted),state(not wanted),state(wanted)])
            clock=[0.0]
            def pause(seconds):clock[0]+=seconds
            result=M["wait_native_save_state"](lambda:next(values),17,"private.docx",wanted,
                                               clock=lambda:clock[0],pause=pause)
            self.assertEqual(result["attempts"],3)
            self.assertFalse(result["editorInputSent"])

    def test_never_ready_is_bounded_without_retrying_save_or_typing(self):
        clock=[0.0]
        def pause(seconds):clock[0]+=seconds
        with self.assertRaisesRegex(AssertionError,"expected dirty/saved"):
            M["wait_native_save_state"](lambda:state(False),17,"private.docx",True,seconds=.4,
                                         clock=lambda:clock[0],pause=pause)
        self.assertEqual(clock[0],.4)

    def test_other_document_pid_or_focus_is_rejected(self):
        for key,bad in [("pid",18),("frontmostPid",18),("applicationActive",False),
                        ("focusAfter",{"role":"AXTextField","description":"Find"}),
                        ("window",{"title":"other.docx \u2022 \u2014 Open Office Studio (Text)"})]:
            observed=copy.deepcopy(state(True));observed[key]=bad
            with self.subTest(key=key),self.assertRaises(PermissionError):
                M["wait_native_save_state"](lambda:observed,17,"private.docx",True)


if __name__ == "__main__":unittest.main()
