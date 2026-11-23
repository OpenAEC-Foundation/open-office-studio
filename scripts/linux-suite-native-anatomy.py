"""Read-only GTK accessibility and screen bounds of one caller-proven PID."""
import json
import os
import sys
import gi

gi.require_version("Atspi", "2.0")
from gi.repository import Atspi

assert sys.platform == "linux" and os.environ.get("GITHUB_ACTIONS") == "true"
pid = int(sys.argv[1])
desktop = Atspi.get_desktop(0)
apps = [desktop.get_child_at_index(i) for i in range(desktop.get_child_count())]
apps = [app for app in apps if app.get_process_id() == pid]
assert len(apps) == 1
nodes, queue = [], [apps[0]]
while queue and len(nodes) < 1500:
    item = queue.pop(0)
    state = item.get_state_set()
    value = dict(name=item.get_name(), role=item.get_role_name(),
                 focused=state.contains(Atspi.StateType.FOCUSED),
                 showing=state.contains(Atspi.StateType.SHOWING))
    try:
        component = item.get_component_iface()
        rect = component.get_extents(Atspi.CoordType.SCREEN)
        value["bounds"] = dict(x=rect.x, y=rect.y, width=rect.width, height=rect.height)
    except Exception:
        pass
    try:
        text = item.get_text_iface()
        if text is not None:
            value["text"] = text.get_text(0, -1)
    except Exception:
        pass
    nodes.append(value)
    if len(queue) < 1500:
        queue.extend(item.get_child_at_index(i) for i in range(item.get_child_count()))
print(json.dumps(dict(pid=pid, nodes=nodes, truncated=bool(queue))))
