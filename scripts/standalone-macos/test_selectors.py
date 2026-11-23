"""Driver failures must stop input before touching the wrong native control."""
import unittest
from unittest.mock import patch
from cases import Case
from native import Unavailable


def row(index,parent,**attrs):
    return {"index":index,"parent":parent,"attributes":attrs}


def button(index,parent,y,**attrs):
    return row(index,parent,AXRole="AXButton",AXTitle="Save",AXEnabled=True,
               frame={"x":20,"y":y,"width":60,"height":30},actions=["AXPress"],**attrs)


class FakeSession:
    def __init__(self,snapshot):self.snapshot=snapshot;self.actions=[];self.report={}
    def ax(self,action,spec=None,check=True):
        if action=="snapshot":return self.snapshot
        self.actions.append((action,spec));return {"status":"input-sent"}


class SelectorTests(unittest.TestCase):
    def panel(self):
        return {"rawNodes":[row(0,-1,AXRole="AXWindow",AXIdentifier="open-panel",AXSubrole="AXDialog",
                    frame={"x":200,"y":100,"width":800,"height":600}),
                row(1,0,AXRole="AXButton",AXIdentifier="OKButton",AXTitle="Open",AXEnabled=True,
                    frame={"x":900,"y":650,"width":70,"height":30})],
                "focused":{"AXRole":"AXList","frame":{"x":300,"y":200,"width":600,"height":350}}}

    def test_native_modal_default_uses_one_return_with_owned_focus(self):
        s=FakeSession(self.panel());Case(s,"fixture").native_panel_confirm("Open","fixture")
        self.assertEqual(s.actions,[("key","return")])
        self.assertEqual(s.report["nativeFileDialogs"][0]["nativeModalWindow"]["AXIdentifier"],"open-panel")

    def test_attached_native_save_sheet_confirms_with_owned_filename_focus(self):
        snap=self.panel();panel=snap["rawNodes"][0]["attributes"]
        panel.update(AXRole="AXSheet",AXIdentifier="save-panel")
        snap["rawNodes"][1]["attributes"]["AXTitle"]="Save"
        snap["focused"]["AXRole"]="AXTextField"
        s=FakeSession(snap);Case(s,"fixture").native_panel_confirm("Save","fixture")
        self.assertEqual(s.actions,[("key","return")])

    def test_animating_dialog_control_settles_before_a_single_native_action(self):
        class Animating(FakeSession):
            def __init__(self):super().__init__({});self.reads=0
            def ax(self,action,spec=None,check=True):
                if action=="snapshot":
                    self.reads+=1
                    y=300 if self.reads==1 else 310
                    return {"rawNodes":[row(0,-1,AXRole="AXGroup",AXSubrole="AXApplicationDialog"),button(1,0,y)]}
                return super().ax(action,spec,check)
        s=Animating()
        with patch("cases.time.sleep"):Case(s,"fixture").button("Save",dialog=True)
        self.assertEqual(s.reads,4);self.assertEqual(len(s.actions),1)
        self.assertEqual(s.actions[0][1]["frame"]["y"],310)

    def test_native_modal_confirmation_refuses_disabled_wrong_or_background_controls(self):
        for variant in ("disabled","background","wrong-name","focus-outside","duplicate"):
            with self.subTest(variant=variant):
                snap=self.panel();target=snap["rawNodes"][1]["attributes"]
                if variant=="disabled":target["AXEnabled"]=False
                elif variant=="background":snap["rawNodes"][0]["attributes"]["AXIdentifier"]="main-window"
                elif variant=="wrong-name":target["AXTitle"]="Delete"
                elif variant=="focus-outside":snap["focused"]["frame"]["x"]=0
                else:snap["rawNodes"].append(row(2,0,**target))
                s=FakeSession(snap)
                with patch("cases.time.monotonic",side_effect=[0,0,46]),self.assertRaises(Unavailable):
                    Case(s,"fixture").native_panel_confirm("Open","fixture")
                self.assertEqual(s.actions,[])

    def test_readonly_readiness_poll_sends_only_one_native_press(self):
        class Delayed(FakeSession):
            def __init__(self):super().__init__({"rawNodes":[button(0,-1,300)]});self.reads=0
            def ax(self,action,spec=None,check=True):
                if action=="snapshot":
                    self.reads+=1
                    return {"rawNodes":[]} if self.reads==1 else self.snapshot
                return super().ax(action,spec)
        s=Delayed()
        with patch("cases.time.sleep"):Case(s,"fixture").button("Save")
        self.assertEqual(s.reads,2);self.assertEqual(len(s.actions),1)
        self.assertEqual(s.actions[0][0],"press")

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

    def test_toolbar_scope_distinguishes_quick_access_from_ribbon_duplicate(self):
        s=FakeSession({"rawNodes":[row(0,-1,AXRole="AXToolbar",AXTitle="Quick access"),button(1,0,35),
            row(2,-1,AXRole="AXToolbar",AXTitle="Save"),button(3,2,100)]})
        Case(s,"fixture").button("Save",toolbar="Save")
        self.assertEqual(len(s.actions),1);self.assertEqual(s.actions[0][1]["frame"]["y"],100)

    def test_view_toggle_uses_actual_checkbox_role_and_ribbon_scope(self):
        toggle=lambda index,parent,y:row(index,parent,AXRole="AXCheckBox",AXTitle="Outline",AXEnabled=True,
                                        frame={"x":20,"y":y,"width":60,"height":30},actions=["AXPress"])
        s=FakeSession({"rawNodes":[row(0,-1,AXRole="AXToolbar",AXTitle="View"),toggle(1,0,100),
                                  row(2,-1,AXRole="AXGroup"),toggle(3,2,650)]})
        Case(s,"fixture").view_toggle("Outline")
        self.assertEqual(s.actions[0][1]["frame"]["y"],100)

    def test_formula_bar_value_mismatch_blocks_native_cell_typing(self):
        class Cell(FakeSession):
            def __init__(self):
                self.formula=False
                super().__init__({})
            def ax(self,action,spec=None,check=True):
                if action=="click":self.formula=True
                if action!="snapshot":return super().ax(action,spec,check)
                formula={"AXRole":"AXTextField","AXDescription":"Enter a value or formula","AXValue":"3",
                         "frame":{"x":150,"y":220,"width":300,"height":28},"AXEnabled":True}
                return {"focused":formula if self.formula else {"AXRole":"AXCell","AXSelected":True,"AXTitle":"B2, 3, selected"},
                        "rawNodes":[row(0,-1,AXRole="AXTextField",AXTitle="Name box",AXValue="B2"),
                                    {"index":1,"parent":-1,"attributes":formula}]}
        s=Cell()
        with patch("cases.time.sleep"),self.assertRaises(Unavailable):Case(s,"fixture").edit_selected_cell("B2","42",expected="2")
        self.assertFalse(any(a[0]=="type" for a in s.actions))

    def test_transient_native_panel_window_is_polled_without_any_input(self):
        class Opening(FakeSession):
            def __init__(self):super().__init__({"status":"observed","rawNodes":[]});self.reads=0
            def ax(self,action,spec=None,check=True):
                self.reads+=1
                return {"status":"blocked","reason":"Owned native windows unavailable"} if self.reads==1 else self.snapshot
        s=Opening();s.process=type('Process',(),{'poll':lambda self:None})()
        with patch("cases.time.sleep"):self.assertEqual(Case(s,"fixture").snapshot()["status"],"observed")
        self.assertEqual(s.reads,2);self.assertEqual(s.actions,[])

    def test_missing_focus_or_wrong_field_value_prevents_replace(self):
        for focused in ({"AXRole":"AXButton"},{"AXRole":"AXTextArea","AXValue":"other document"}):
            s=FakeSession({"focused":focused})
            with self.assertRaises(Unavailable):Case(s,"fixture").replace("edit",expected="own-seed")
            self.assertEqual(s.actions,[])

    def test_notebook_native_choice_must_confirm_actual_selected_book(self):
        popup=row(0,-1,AXRole="AXPopUpButton",AXDescription="Choose notebook",AXValue="Standalone QA",
                  AXEnabled=True,frame={"x":20,"y":300,"width":200,"height":30},actions=["AXPress"])
        s=FakeSession({"rawNodes":[popup]})
        with patch("cases.time.sleep"):Case(s,"fixture").notes_notebook()
        self.assertEqual([a[0] for a in s.actions],["press","key","key"])
        self.assertEqual([a[1] for a in s.actions[1:]],["end","return"])

    def test_wrong_selected_notebook_blocks_before_any_note_typing(self):
        popup=row(0,-1,AXRole="AXPopUpButton",AXTitle="Choose notebook",AXValue="Other book",
                  AXEnabled=True,frame={"x":20,"y":300,"width":200,"height":30},actions=["AXPress"])
        s=FakeSession({"rawNodes":[popup]})
        with patch("cases.time.sleep"),patch("cases.time.monotonic",side_effect=[0,0,0,5]):
            with self.assertRaises(Unavailable):Case(s,"fixture").notes_notebook()
        self.assertFalse(any(a[0]=="type" for a in s.actions))


if __name__=="__main__":unittest.main()
