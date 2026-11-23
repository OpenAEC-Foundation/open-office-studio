"""Read pixels from the caller's exact validated existing X11 window only."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

import gi
gi.require_version("Gdk", "3.0")
gi.require_version("GdkX11", "3.0")
from gi.repository import Gdk, GdkX11

pid, xid, start_time, executable, output = sys.argv[1:]
assert os.environ.get("GITHUB_ACTIONS") == "true" and sys.platform == "linux"
assert pid.isdigit() and xid.isdigit() and os.environ.get("DISPLAY", "").startswith(":")
path = Path(output).resolve()
assert not path.exists() and path.suffix == ".png"
assert path.is_relative_to((Path.cwd() / ".local/linux-p2-native").resolve()), "Only caller-owned evidence directory"


def owner():
    proc = Path("/proc") / pid
    stat = (proc / "stat").read_text()
    assert stat[:stat.index("(")].strip() == pid
    assert stat[stat.rindex(")") + 2:].split()[19] == start_time
    assert str((proc / "exe").resolve()) == executable
    assert subprocess.check_output(["xdotool", "getwindowpid", xid], text=True).strip() == pid
    assert subprocess.check_output(["xdotool", "getwindowfocus"], text=True).strip() == xid


owner()
display = Gdk.Display.get_default()
assert display is not None
window = GdkX11.X11Window.foreign_new_for_display(display, int(xid))
assert window is not None and window.is_viewable()
width, height = window.get_width(), window.get_height()
assert 100 <= width <= 4096 and 100 <= height <= 4096
display.sync()
pixels = Gdk.pixbuf_get_from_window(window, 0, 0, width, height)
assert pixels is not None
pixels.savev(str(path), "png", [], [])
owner()
print(json.dumps(dict(pid=int(pid), xid=xid, startTime=start_time, width=width, height=height,
                     sha256=hashlib.sha256(path.read_bytes()).hexdigest(), backend="owned X11 window pixels")))
