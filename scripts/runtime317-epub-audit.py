"""Verify actual EPUB export/import capability of the pinned private runtime."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
import zipfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("program", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    assert os.environ.get("GITHUB_ACTIONS") == "true", "Isolated CI only"
    args.output.mkdir(parents=True, exist_ok=True)
    source = Path("docs/voorbeelden/Ontwerpnotitie.docx")
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    report = {"applicationCommit": os.environ["OOS_RUNTIME_APPLICATION_COMMIT"],
              "harnessCommit": os.environ["OOS_RUNTIME_HARNESS_COMMIT"],
              "sourceSha256": source_hash, "status": "running"}
    try:
        with tempfile.TemporaryDirectory(prefix="oos-epub-audit-") as temp:
            root = Path(temp)
            fixture = root / "Catalogusproef.docx"
            shutil.copyfile(source, fixture)

            def convert(input_path, extension, filter_name, label):
                profile = root / label / "profile"
                (profile / "user").mkdir(parents=True)
                shutil.copyfile("src-tauri/src/conversieprofiel.xcu", profile / "user/registrymodifications.xcu")
                output = root / label / "output"
                output.mkdir()
                result = subprocess.run([str(args.program.resolve()), "-env:UserInstallation=" + profile.as_uri(),
                    "--headless", "--nologo", "--nodefault", "--norestore", "--nolockcheck",
                    "--convert-to", extension + ":" + filter_name, "--outdir", str(output), str(input_path)],
                    env=dict(os.environ, SAL_DISABLE_DEFAULTPRINTER="1", SAL_DISABLE_PRINTERLIST="1"),
                    text=True, capture_output=True, timeout=45)
                report[label] = {"exitCode": result.returncode, "stdout": result.stdout[-8000:],
                                 "stderr": result.stderr[-8000:]}
                return output / (input_path.stem + "." + extension)

            epub = convert(fixture, "epub", "EPUB", "export")
            assert epub.is_file() and epub.stat().st_size, "Export must produce an actual EPUB"
            with zipfile.ZipFile(epub) as archive:
                assert archive.read("mimetype").strip() == b"application/epub+zip"
                container = ET.fromstring(archive.read("META-INF/container.xml"))
                packages = [n.attrib["full-path"] for n in container.iter() if n.tag.endswith("rootfile")]
                assert packages
                package = ET.fromstring(archive.read(packages[0]))
                assert any(n.tag.endswith("spine") and len(n) for n in package.iter())
                report["export"]["validContainerAndSpine"] = True
                report["export"]["bytes"] = epub.stat().st_size
                report["export"]["sha256"] = hashlib.sha256(epub.read_bytes()).hexdigest()
            shutil.copyfile(epub, args.output / "valid-runtime-export.epub")
            imported = convert(epub, "docx", "Office Open XML Text", "import")
            report["import"]["producedDocx"] = imported.is_file() and imported.stat().st_size > 0
            if report["import"]["producedDocx"]:
                with zipfile.ZipFile(imported) as archive:
                    doc = ET.fromstring(archive.read("word/document.xml"))
                    text = "".join(n.text or "" for n in doc.iter() if n.tag.endswith("}t"))
                    report["import"]["text"] = text[:2000]
                shutil.copyfile(imported, args.output / "imported.docx")
            report["status"] = "passed" if report["import"]["producedDocx"] else "unsupported-catalog-input"
            assert report["import"]["producedDocx"], "The standard private runtime cannot import its own valid EPUB; #30 catalog acceptance remains open"
    except Exception as error:
        report["error"] = str(error)
        if report["status"] == "running":
            report["status"] = "failed"
        raise
    finally:
        report["originalUnchanged"] = hashlib.sha256(source.read_bytes()).hexdigest() == source_hash
        (args.output / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
