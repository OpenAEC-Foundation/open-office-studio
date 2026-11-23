"""Driver failures must stop input before touching the wrong native control."""
import unittest
from cases import Case
from native import Unavailable


def row(index,parent,**attrs):
    return {"index":index,"parent":parent,"attributes":attrs}


def button(index,parent,y,**attrs):
    return row(index,parent,AXRole="AXButton",AXTitle="Save",AXEnabled=True,
               frame={"x":20,"y":y,"width":60,"height":30},actions=["AXPress"],**attrs)


class FakeSession:
    def __init__(self,snapshot):self.snapshot=snapshot;self.actions=[];self.report={}
    def ax(self,action,spec=None):
        if action=="snapshot":return self.snapshot
        self.actions.append((action,spec));return {"status":"input-sent"}


class SelectorTests(unittest.TestCase):
    def test_duplicate_active_names_stop_all_native_input(self):
        s=FakeSession({"rawNodes":[button(0,-1,20),button(1,-1,300)]})
        with self.assertRaises(Unavailable):Case(s,"fixture").button("Save")
        self.assertEqual(s.actions,[])

    def test_dialog_scope_selects_actual_modal_frame_over_background_save(self):
        s=FakeSession({"rawNodes":[row(0,-1,AXRole="AXWindow"),button(1,0,20),
            row(2,0,AXRole="AXGroup",AXSubrole="AXApplicationDialog"),button(3,2,300)]})
        Case(s,"fixture").button("Save",dialog=True)
        self.assertEqual(len(s.actions),1)
        self.assertEqual(s.actions[0][1]["frame"]["y"],300)

    def test_missing_focus_or_wrong_field_value_prevents_replace(self):
        for focused in ({"AXRole":"AXButton"},{"AXRole":"AXTextArea","AXValue":"other document"}):
            s=FakeSession({"focused":focused})
            with self.assertRaises(Unavailable):Case(s,"fixture").replace("edit",expected="own-seed")
            self.assertEqual(s.actions,[])


if __name__=="__main__":unittest.main()
