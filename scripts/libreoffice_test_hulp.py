"""Isolated, hidden LibreOffice/UNO session for independent format tests.

Run with a Python that provides uno and set OPENAEC_CONVERSIE_PROGRAMMA.
Uses a short temporary profile and only terminates its own child process.
"""
from contextlib import contextmanager
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
import uno

ROOT = Path(__file__).resolve().parents[1]

def prop(name, value):
    result = uno.createUnoStruct("com.sun.star.beans.PropertyValue")
    result.Name, result.Value = name, value
    return result

@contextmanager
def office_session(out):
    out.mkdir(parents=True, exist_ok=True)
    profile = Path(tempfile.mkdtemp(prefix="oos-test-"))
    (profile / "user").mkdir()
    shutil.copyfile(ROOT / "src-tauri/src/conversieprofiel.xcu", profile / "user/registrymodifications.xcu")
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        channel = "socket,host=127.0.0.1,port=" + str(sock.getsockname()[1])
    env = dict(os.environ, SAL_DISABLE_DEFAULTPRINTER="1", SAL_DISABLE_PRINTERLIST="1")
    for key in ("URE_BOOTSTRAP", "UNO_PATH", "UNO_SERVICES", "UNO_TYPES", "PYTHONHOME", "PYTHONPATH"):
        env.pop(key, None)
    child = subprocess.Popen([os.environ["OPENAEC_CONVERSIE_PROGRAMMA"], "--accept=" + channel + ";urp", "-env:UserInstallation=" + profile.as_uri(), "--quickstart=no", "--norestore", "--nologo", "--headless"], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env, creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
    desktop, docs = None, []
    try:
        local = uno.getComponentContext()
        resolver = local.ServiceManager.createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver", local)
        limit = time.monotonic() + 40
        while True:
            try:
                context = resolver.resolve("uno:" + channel + ";urp;StarOffice.ComponentContext")
                break
            except Exception:
                if time.monotonic() >= limit:
                    raise TimeoutError("Our isolated LibreOffice did not start within 40 seconds")
                time.sleep(.05)
        desktop = context.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", context)
        def load(path):
            url = path if isinstance(path, str) else path.resolve().as_uri()
            doc = desktop.loadComponentFromURL(url, "_blank", 0, (prop("Hidden", True), prop("MacroExecutionMode", uno.getConstantByName("com.sun.star.document.MacroExecMode.NEVER_EXECUTE")), prop("UpdateDocMode", uno.getConstantByName("com.sun.star.document.UpdateDocMode.NO_UPDATE"))))
            if doc is None:
                raise AssertionError("No document loaded: " + url)
            docs.append(doc)
            return doc
        yield load
    finally:
        for doc in docs:
            try: doc.close(True)
            except Exception: pass
        if desktop:
            try: desktop.terminate()
            except Exception: pass
        try:
            output, _ = child.communicate(timeout=8)
        except subprocess.TimeoutExpired:
            if os.name == "nt":
                subprocess.run(["taskkill", "/PID", str(child.pid), "/T", "/F"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW, timeout=10)
            else: child.kill()
            output, _ = child.communicate(timeout=5)
        (out / "converter.log").write_bytes(output)
