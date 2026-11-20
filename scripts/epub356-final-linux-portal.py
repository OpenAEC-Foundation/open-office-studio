"""Observe real SaveFile calls on the disposable test bus; never call SaveFile."""
import argparse
import codecs
import json
import os
from pathlib import Path
import re
import selectors
import signal
import subprocess
import time
import uuid

FRONT = "org.freedesktop.portal.FileChooser"
BACK = "org.freedesktop.impl.portal.FileChooser"
BROKER = "org.freedesktop.portal.Desktop"
GTK = "org.freedesktop.impl.portal.desktop.gtk"
HEADER = re.compile(r"^method call .*?sender=(\S+) -> destination=(\S+) serial=(\d+) path=([^;]+); interface=([^;]+); member=(\w+)")


def parse_call(text):
    """Only the narrow public SaveFile wire shape; unknown encodings fail closed."""
    match = HEADER.match(text)
    if not match or match[5] not in (FRONT, BACK) or match[6] != "SaveFile":
        return None
    sender, destination, serial, path, interface, _ = match.groups()
    if path != "/org/freedesktop/portal/desktop":
        return None
    def option(key, allowed):
        values = re.findall(r'string "' + key + r'"\s+variant\s+string "(' + allowed + r')"', text)
        return values[0] if len(values) == 1 else None
    handles = re.findall(r'^\s*object path "([/A-Za-z0-9_]+)"', text, re.M)
    return dict(sender=sender, destination=destination, serial=int(serial), interface=interface,
                token=option("handle_token", r"[A-Za-z0-9_]+"),
                currentName=option("current_name", r"[^\"\\]+"),
                handle=handles[0] if len(handles) == 1 else None)


def select_correlation(calls, owned_pid, expected_names, owner, peer_pid):
    """Bind sender credentials and the actual forwarded request, never its title."""
    broker = owner(BROKER)
    gtk = owner(GTK)
    fronts = []
    for call in calls:
        if call["interface"] != FRONT or call["currentName"] not in expected_names or not call["token"]:
            continue
        if call["destination"] not in (BROKER, broker) or peer_pid(call["sender"]) != owned_pid:
            continue
        sender = call["sender"]
        if not re.fullmatch(r":[0-9]+\.[0-9]+", sender):
            continue
        handle = "/org/freedesktop/portal/desktop/request/" + sender[1:].replace(".", "_") + "/" + call["token"]
        fronts.append((call, handle))
    assert len(fronts) <= 1, "BLOCKED: multiple owned SaveFile requests"
    if not fronts:
        return None
    front, handle = fronts[0]
    backends = [c for c in calls if c["interface"] == BACK]
    assert len(backends) <= 1, "BLOCKED: multiple backend SaveFile requests on private bus"
    if not backends:
        return None
    backend = backends[0]
    if backend["handle"] != handle or backend["sender"] != broker:
        return None
    if backend["destination"] not in (GTK, gtk) or backend["currentName"] not in expected_names:
        return None
    backend_pid = peer_pid(gtk)
    assert backend_pid > 0 and backend_pid != owned_pid
    assert peer_pid(broker) > 0
    return dict(ownedPid=owned_pid, requestHandle=handle, frontend=front, backend=backend,
                brokerUniqueName=broker, backendUniqueName=gtk, backendPid=backend_pid)


def bus_call(method, *args):
    value = subprocess.check_output(["gdbus", "call", "--session", "--dest", "org.freedesktop.DBus",
        "--object-path", "/org/freedesktop/DBus", "--method", "org.freedesktop.DBus." + method, *args],
        text=True, timeout=5).strip()
    if method == "GetConnectionUnixProcessID":
        match = re.fullmatch(r"\(uint32 ([0-9]+),\)", value)
        assert match, "Unsupported D-Bus peer credential response"
        return int(match[1])
    match = re.fullmatch(r"\('([A-Za-z0-9_.:]+)',\)", value)
    assert match, "Unsupported D-Bus name/ID response"
    return match[1]


def atomic_json(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def observe(args):
    assert os.environ.get("GITHUB_ACTIONS") == "true" and os.environ.get("DISPLAY")
    address = os.environ.get("DBUS_SESSION_BUS_ADDRESS", "")
    assert re.match(r"^unix:(?:path|abstract)=/tmp/dbus-", address), "Disposable dbus-run-session required"
    assert Path(f"/proc/{args.pid}").exists()
    assert os.getpgrp() == os.getpid(), "Observer must have its own isolated process group"
    assert not args.report.exists() and not args.ready.exists()
    args.report.parent.mkdir(parents=True, exist_ok=True)
    bus_id = bus_call("GetId")
    token = "epub356_" + uuid.uuid4().hex
    rules = [f"type='method_call',interface='{interface}',member='SaveFile'" for interface in (FRONT, BACK)]
    rules.append("type='signal',interface='org.openaec.epub356',member='Ready'")
    raw = args.report.with_suffix(".dbus.txt")
    errors = args.report.with_suffix(".stderr.txt")
    state = dict(status="observing", ownedPid=args.pid, busId=bus_id, privateBusAddress=address,
                 display=os.environ["DISPLAY"], calls=[], readyBeforeSave=False)
    stop = False
    def stopping(*_):
        nonlocal stop
        stop = True
    signal.signal(signal.SIGTERM, stopping)
    signal.signal(signal.SIGINT, stopping)
    process = None
    try:
        with raw.open("xb") as log, errors.open("xb") as stderr:
            process = subprocess.Popen(["stdbuf", "-oL", "dbus-monitor", "--session", *rules],
                                       stdout=subprocess.PIPE, stderr=stderr)
            state.update(observerPid=os.getpid(), ownedProcessGroup=os.getpgrp(), monitorPid=process.pid)
            selector = selectors.DefaultSelector()
            selector.register(process.stdout, selectors.EVENT_READ)
            deadline, next_probe, last_data = time.monotonic() + 80, 0, time.monotonic()
            fragment, frame, frames_seen = "", "", set()
            decoder = codecs.getincrementaldecoder("utf-8")("strict")
            received = 0
            def inspect_frame():
                nonlocal frame
                call = parse_call(frame)
                if not call:
                    return
                identity = (call["sender"], call["serial"])
                # A frame may be incomplete when the pipe is momentarily idle.
                # Do not mark it seen until required options have arrived.
                if not call["currentName"] or (call["interface"] == FRONT and not call["token"]):
                    return
                if identity not in frames_seen:
                    frames_seen.add(identity)
                    state["calls"].append(call)
                try:
                    correlation = select_correlation(state["calls"], args.pid, {args.name, Path(args.name).stem},
                        lambda name: bus_call("GetNameOwner", name),
                        lambda name: bus_call("GetConnectionUnixProcessID", name))
                    if correlation:
                        executable = Path(f"/proc/{correlation['backendPid']}/exe").resolve()
                        assert executable.name == "xdg-desktop-portal-gtk", "Unexpected portal executable"
                        assert bus_call("GetId") == bus_id
                        state.update(status="attributed", correlation=correlation, backendExecutable=str(executable))
                except subprocess.CalledProcessError as error:
                    # Portal activation may still be in progress. Preserve this
                    # capability gap and retry the same observed frame.
                    state["lastPeerQueryError"] = str(error)
                atomic_json(args.report, state)
            while not stop and time.monotonic() < deadline:
                assert process.poll() is None, "D-Bus monitor exited unexpectedly"
                if not state["readyBeforeSave"] and time.monotonic() >= next_probe:
                    subprocess.run(["gdbus", "emit", "--session", "--object-path", "/org/openaec/epub356",
                        "--signal", "org.openaec.epub356.Ready", "'" + token + "'"], check=True, capture_output=True, timeout=5)
                    next_probe = time.monotonic() + .25
                if selector.select(.15):
                    chunk = os.read(process.stdout.fileno(), 65536)
                    assert chunk, "D-Bus monitor closed its output"
                    received += len(chunk)
                    assert received <= 1024 * 1024, "D-Bus diagnostic capture limit exceeded"
                    log.write(chunk); log.flush()
                    fragment += decoder.decode(chunk)
                    last_data = time.monotonic()
                    while "\n" in fragment:
                        line, fragment = fragment.split("\n", 1)
                        if line.startswith(("method call ", "signal ", "method return ", "error ")):
                            inspect_frame()
                            frame = line + "\n"
                        else:
                            frame += line + "\n"
                        if token in line and "interface=org.openaec.epub356; member=Ready" in frame:
                            state["readyBeforeSave"] = True
                            atomic_json(args.ready, dict(status="ready", ownedPid=args.pid, busId=bus_id, observerPid=os.getpid()))
                elif time.monotonic() - last_data >= .15:
                    inspect_frame()
                if not Path(f"/proc/{args.pid}").exists():
                    break
            if not state["readyBeforeSave"]:
                raise RuntimeError("BLOCKED: monitor readiness barrier was not observed")
            if state["status"] != "attributed":
                state.update(status="blocked", reason="No credential-bound frontend/backend SaveFile correlation")
    except Exception as error:
        state.update(status="blocked" if "BLOCKED:" in str(error) else "failed", reason=str(error))
    finally:
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill(); process.wait(timeout=3)
        state["monitorClosed"] = process is None or process.poll() is not None
        atomic_json(args.report, state)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pid", type=int, required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--ready", type=Path, required=True)
    observe(parser.parse_args())
