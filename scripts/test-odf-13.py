"""Convert fixed fixtures and validate strict ODF 1.3 with the OASIS schemas.

Requires lxml and LibreOffice. Set OPENAEC_CONVERSIE_PROGRAMMA if soffice is
not on PATH. Outputs and isolated macro-disabled profiles stay in .local.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time
import urllib.request
import uuid
import zipfile

from lxml import etree as ET

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / os.environ.get("OOS_ODF_UIT", ".local/odf-13")
SCHEMAS = {
    "OpenDocument-v1.3-schema.rng": "40bad03efdbb02825230d357da0aa6ac679934c5bf56c6281752c0c24d58e4e6",
    "OpenDocument-v1.3-manifest-schema.rng": "8aee71f03484be112af972d622cc9031280c007b0a454ae8815e8e333c9bdd17",
}
BASE = "https://docs.oasis-open.org/office/OpenDocument/v1.3/os/schemas/"
OFFICE = "{urn:oasis:names:tc:opendocument:xmlns:office:1.0}"
MANIFEST = "{urn:oasis:names:tc:opendocument:xmlns:manifest:1.0}"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def schema(name):
    cache = Path(os.environ.get("OOS_ODF_SCHEMA_DIR", OUT / "schemas"))
    cache.mkdir(parents=True, exist_ok=True)
    path = cache / name
    if not path.exists():
        with urllib.request.urlopen(BASE + name, timeout=45) as response:
            path.write_bytes(response.read())
    data = path.read_bytes()
    if sha(data) != SCHEMAS[name]:
        raise ValueError(f"Unexpected official schema hash: {name}")
    parser = ET.XMLParser(resolve_entities=False, no_network=True)
    return ET.RelaxNG(ET.fromstring(data, parser))


def run(exe, args, directory):
    log = directory / "converter.log"
    options = {"stdin": subprocess.DEVNULL, "stdout": subprocess.PIPE, "stderr": subprocess.STDOUT}
    if os.name == "nt":
        options["creationflags"] = subprocess.CREATE_NO_WINDOW
    else:
        options["start_new_session"] = True
    started = time.monotonic()
    child = subprocess.Popen([exe, *args], **options)
    try:
        output, _ = child.communicate(timeout=45)
    except subprocess.TimeoutExpired:
        # Match the production converter: stop our whole process tree.
        if os.name == "nt":
            subprocess.run(["taskkill", "/PID", str(child.pid), "/T", "/F"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                           creationflags=subprocess.CREATE_NO_WINDOW, timeout=10)
        else:
            os.killpg(child.pid, signal.SIGKILL)
        child.kill()
        output, _ = child.communicate()
        log.write_bytes(output)
        raise TimeoutError("Conversion exceeded the unchanged 45-second limit")
    log.write_bytes(output)
    if child.returncode:
        raise RuntimeError(f"Converter exited with {child.returncode}; see {log}")
    return round((time.monotonic() - started) * 1000)


def validate(path, document_schema, manifest_schema, mime):
    parser = ET.XMLParser(resolve_entities=False, no_network=True)
    checks = []
    with zipfile.ZipFile(path) as package:
        first = package.infolist()[0]
        checks.append({"part": "mimetype", "valid": first.filename == "mimetype"
                       and first.compress_type == zipfile.ZIP_STORED
                       and package.read("mimetype").decode() == mime})
        for name in ["content.xml", "styles.xml", "meta.xml", "settings.xml", "META-INF/manifest.xml"]:
            if name not in package.namelist():
                checks.append({"part": name, "valid": False, "errors": ["missing"]})
                continue
            xml = ET.fromstring(package.read(name), parser)
            validator = manifest_schema if name.startswith("META-INF") else document_schema
            version = xml.get((MANIFEST if name.startswith("META-INF") else OFFICE) + "version")
            valid = validator.validate(xml)
            checks.append({"part": name, "version": version,
                           "valid": valid and version == "1.3",
                           "errors": [str(error) for error in validator.error_log]})
    return checks


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    exe = os.environ.get("OPENAEC_CONVERSIE_PROGRAMMA") or shutil.which("soffice")
    if not exe:
        raise RuntimeError("Set OPENAEC_CONVERSIE_PROGRAMMA to the LibreOffice executable")
    document_schema = schema("OpenDocument-v1.3-schema.rng")
    manifest_schema = schema("OpenDocument-v1.3-manifest-schema.rng")
    profile = (ROOT / "src-tauri/src/conversieprofiel.xcu").read_bytes()
    report = {"converter": exe, "profileSha256": sha(profile), "schemaSha256": SCHEMAS, "cases": []}
    version_dir = OUT / ("version-" + uuid.uuid4().hex[:10])
    (version_dir / "profile/user").mkdir(parents=True)
    (version_dir / "profile/user/registrymodifications.xcu").write_bytes(profile)
    run(exe, ["-env:UserInstallation=" + (version_dir / "profile").as_uri(),
              "--headless", "--version"], version_dir)
    report["converterVersion"] = (version_dir / "converter.log").read_text(encoding="utf-8").strip()
    cases = [(f"D{n}", f"docs/tests/documentmatrix-2026-11-06/bron/D{n}.docx", "odt", "writer8", "text") for n in (1, 2, 3)]
    cases += [("Spreadsheet", "public/templates/nieuw.xlsx", "ods", "calc8", "spreadsheet"),
              ("Presentation", "public/templates/nieuw.pptx", "odp", "impress8", "presentation")]
    try:
        for label, source, ext, filter_name, mime_type in cases:
            directory = OUT / (label + "-" + uuid.uuid4().hex[:10])
            (directory / "profile/user").mkdir(parents=True)
            (directory / "output").mkdir()
            (directory / "profile/user/registrymodifications.xcu").write_bytes(profile)
            source = ROOT / source
            target = directory / "output" / (source.stem + "." + ext)
            case = {"label": label, "input": str(source), "inputSha256": sha(source.read_bytes()),
                    "output": str(target), "profile": str(directory / "profile")}
            report["cases"].append(case)
            try:
                case["ms"] = run(exe, ["-env:UserInstallation=" + (directory / "profile").as_uri(),
                    "--headless", "--nologo", "--nodefault", "--norestore", "--nolockcheck",
                    "--convert-to", ext + ":" + filter_name, "--outdir", str(directory / "output"), str(source)], directory)
                if not target.is_file():
                    raise RuntimeError("Converter produced no output file")
                case["outputSha256"] = sha(target.read_bytes())
                case["checks"] = validate(target, document_schema, manifest_schema,
                                           "application/vnd.oasis.opendocument." + mime_type)
                case["pass"] = all(check["valid"] for check in case["checks"])
            except Exception as error:
                case["error"] = str(error)
                case["pass"] = False
            print(json.dumps({"label": label, "pass": case["pass"], "ms": case.get("ms"), "error": case.get("error")}), flush=True)
        report["pass"] = all(case["pass"] for case in report["cases"])
    finally:
        (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return 0 if report["pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
