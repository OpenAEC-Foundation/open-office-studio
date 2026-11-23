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
args.report.write_text(json.dumps({"pid": args.pid, "title": d.window_text(), "controls": controls}, indent=2), encoding="utf8")
fields = [c for c in d.descendants(control_type="Edit") if c.automation_id() == "1148"]
assert len(fields) == 1, f"Expected observed File name Edit1148, found {len(fields)}"
field = fields[0]
field.set_edit_text(str(args.path.resolve()))
assert field.get_value() == str(args.path.resolve())
buttons = [c for c in d.descendants(control_type="Button") if c.automation_id() == "1"]
assert len(buttons) == 1, "Expected exactly one native Open/Save commit button"
buttons[0].invoke()
print(json.dumps({"pid": args.pid, "nativeCommitInvoked": True, "path": str(args.path.resolve())}))
