"""Bounded GTK diagnostic, not packaged Office acceptance. Real own-window XTest input."""

import json
import os
from pathlib import Path
import subprocess
import time

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("GdkX11", "3.0")
gi.require_version("WebKit2", "4.1")
from gi.repository import Gdk, GdkX11, GLib, Gtk, WebKit2

OUT = Path(".local/writer362-webkit-focus")
OUT.mkdir(parents=True, exist_ok=False)
report = {"kind": "standalone GTK cause diagnostic; not Office acceptance", "pid": os.getpid(), "harnessCommit": subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip(), "applicationSourceCompared": "e92b93a607c1bc6b2e37b56273ccc5047498f9e6", "cases": [], "cleanup": {}}
window = Gtk.Window()
window.set_default_size(800, 450)
view = WebKit2.WebView()
window.add(view)
window.show_all()


def pump_until(predicate, seconds=8):
    end = time.monotonic() + seconds
    while not predicate():
        if time.monotonic() > end:
            raise TimeoutError("Bounded GTK callback wait")
        while Gtk.events_pending():
            Gtk.main_iteration_do(False)
        time.sleep(0.005)


def read_dom(expression):
    """Only read-only diagnostic expressions; event handlers live in fixture HTML."""
    result = []
    def done(webview, task, *_):
        try:
            result.append(json.loads(webview.run_javascript_finish(task).get_js_value().to_string()))
        except Exception as error:
            result.append(error)
    view.run_javascript("JSON.stringify(" + expression + ")", None, done, None)
    pump_until(lambda: bool(result))
    if isinstance(result[0], Exception):
        raise result[0]
    return result[0]


def xdo(*args):
    return subprocess.check_output(["xdotool", *map(str, args)], text=True, timeout=5).strip()


def own_window():
    assert int(xdo("getwindowpid", xid)) == os.getpid(), "own exact XID/PID"
    assert xdo("getwindowfocus") == xid, "own exact foreground"


def key(name):
    own_window()
    xdo("key", "--clearmodifiers", name)


try:
    report["webkitPackages"] = subprocess.check_output(["dpkg-query", "-W", "-f=${Package} ${Version}\n", "libwebkit2gtk-4.1-0", "webkit2gtk-driver"], text=True)
    pump_until(lambda: window.get_window() is not None)
    xid = str(GdkX11.X11Window.get_xid(window.get_window()))
    report["xid"] = xid
    assert int(xdo("getwindowpid", xid)) == os.getpid()
    xdo("windowfocus", "--sync", xid)
    own_window()
    for route, explicit in [("arrow-down", False), ("tab", False), ("arrow-down-explicit-keyboard-option", True)]:
        loaded = []
        handle = view.connect("load-changed", lambda _v, event: loaded.append(True) if event == WebKit2.LoadEvent.FINISHED else None)
        # Same preventDefault + script-focus pattern as Lint.tabToets/baanToets.
        # Third case tests the standard FocusOptions API, not injected CSS.
        option = "{focusVisible:true}" if explicit else ""
        html = """<!doctype html><meta charset=utf-8><style>
        body{margin:30px}button{margin:8px;padding:12px}button:focus-visible{outline:2px solid orange;outline-offset:2px}
        </style><button id=tab>Insert</button><button id=collapse>Hide ribbon</button>
        <div id=toolbar><button id=a>Page Break</button><button id=b>Table</button></div>
        <script>window.events=[];
        const tabButton=document.querySelector('#tab'),bar=document.querySelector('#toolbar'),aButton=document.querySelector('#a'),bButton=document.querySelector('#b');
        document.addEventListener('keydown',e=>events.push({key:e.key,trusted:e.isTrusted}));
        tabButton.onkeydown=e=>{if(e.key==='ArrowDown'){e.preventDefault();requestAnimationFrame(()=>aButton.focus(OPTION));}};
        bar.onkeydown=e=>{if(e.key==='ArrowRight'){e.preventDefault();(document.activeElement===aButton?bButton:aButton).focus(OPTION);}};
        </script>""".replace("OPTION", option)
        view.load_html(html, "file:///writer362-diagnostic/")
        pump_until(lambda: bool(loaded))
        view.disconnect(handle)
        tab = read_dom("(()=>{const r=document.querySelector('#tab').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()")
        own_window()
        xdo("mousemove", "--window", xid, int(tab["x"]), int(tab["y"]))
        xdo("click", "1")
        pump_until(lambda: read_dom("document.activeElement.id") == "tab")
        case = {"route": route, "standardFocusVisibleOption": explicit, "states": []}
        report["cases"].append(case)
        for chord in (["Tab", "Tab", "Right"] if route == "tab" else ["Down", "Right"]):
            key(chord)
            expected = "collapse" if chord == "Tab" and not case["states"] else "b" if chord == "Right" else "a"
            pump_until(lambda: read_dom("document.activeElement.id") == expected)
            state = read_dom("(()=>{const e=document.activeElement,s=getComputedStyle(e);return{id:e.id,focusVisible:e.matches(':focus-visible'),outlineWidth:s.outlineWidth,outlineOffset:s.outlineOffset,hasFocus:document.hasFocus(),visibility:document.visibilityState,events:window.events}})()")
            state["nativeKey"] = chord
            case["states"].append(state)
        own_window()
        pixbuf = Gdk.pixbuf_get_from_window(window.get_window(), 0, 0, window.get_allocated_width(), window.get_allocated_height())
        assert pixbuf is not None
        pixbuf.savev(str(OUT / (route + ".png")), "png", [], [])
    report["baselineArrowVisible"] = all(s["focusVisible"] for s in report["cases"][0]["states"])
    report["nativeTabVisible"] = all(s["focusVisible"] for s in report["cases"][1]["states"])
    report["explicitKeyboardOptionVisible"] = all(s["focusVisible"] for s in report["cases"][2]["states"])
    report["status"] = "diagnostic completed"
except Exception as error:
    report["status"] = "failed"
    report["error"] = repr(error)
    raise
finally:
    window.destroy()
    while Gtk.events_pending():
        Gtk.main_iteration_do(False)
    report["cleanup"]["ownWindowDestroyed"] = True
    (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n")
