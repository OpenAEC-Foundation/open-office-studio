"""Operate only an owned app's real file dialog on a disposable Windows CI host."""
import argparse
import json
import os
from pathlib import Path
import time

assert os.name == "nt" and os.environ.get("RUNNER_ENVIRONMENT") == "github-hosted"
from pywinauto import Desktop

p = argparse.ArgumentParser()
p.add_argument("pid", type=int)
p.add_argument("path", type=Path)
p.add_argument("report", type=Path)
args = p.parse_args()
desktop = Desktop(backend="uia")
end = time.monotonic() + 45
while time.monotonic() < end:
    dialogs = desktop.windows(process=args.pid, class_name="#32770", visible_only=True)
    if dialogs:
        break
    time.sleep(.2)
assert len(dialogs) == 1, f"Exactly one owned file dialog required; found {len(dialogs)}"
d = dialogs[0]
controls = [{"name": c.window_text(), "id": c.automation_id(), "type": c.element_info.control_type}
            for c in d.descendants()]
proof = {"pid": args.pid, "title": d.window_text(), "controls": controls}
def save_proof():
    args.report.write_text(json.dumps(proof, indent=2), encoding="utf8")
save_proof()
fields = [c for c in d.descendants(control_type="Edit")
          if c.automation_id() in ("1148", "1001") and c.window_text() == "File name:"]
assert len(fields) == 1, f"Expected one observed native File name Edit1148/Open or Edit1001/Save, found {len(fields)}"
field = fields[0]
target = str(args.path.resolve())
field.set_focus()
assert field.element_info.element.CurrentHasKeyboardFocus, "Actual native filename input must have keyboard focus"
literal = "".join("{" + ch + "}" if ch in "+^%~(){}" else ch for ch in target)
field.type_keys("^a", set_foreground=False)
field.type_keys(literal, with_spaces=True, vk_packet=True, set_foreground=False, pause=.005)
assert field.get_value() == target
proof["typedFilename"] = field.get_value()
field.type_keys("{TAB}", set_foreground=False)
proof["filenameAfterCommit"] = field.get_value()
save_proof()
buttons = [c for c in d.descendants(control_type="Button") if c.automation_id() == "1"]
assert len(buttons) == 1, "Expected exactly one native Open/Save commit button"
buttons[0].invoke()
for _ in range(50):
    remaining = desktop.windows(process=args.pid, class_name="#32770", visible_only=True)
    if not remaining:
        break
    time.sleep(.2)
proof["nativeDialogClosed"] = not remaining
proof["remainingDialogs"] = [{"title": w.window_text(), "controls": [{"name": c.window_text(), "id": c.automation_id(), "type": c.element_info.control_type} for c in w.descendants()]} for w in remaining]
save_proof()
assert proof["nativeDialogClosed"], "Native file dialog did not close after real filename input and Save/Open"
print(json.dumps({"pid": args.pid, "nativeDialogClosed": True, "path": target}))
