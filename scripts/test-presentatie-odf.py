"""Real presentation conversions, official ODF 1.3 schema and independent XML checks."""
from pathlib import Path
import hashlib
import importlib.util
import json
import os
import platform
import shutil
import subprocess
import sys
import tempfile
import zipfile
from lxml import etree as E

ROOT = Path(__file__).resolve().parent.parent
VOLUME = os.environ.get("OOS_PRESENTATIE_ODF_VOLUME") == "1"
OUT = (ROOT / os.environ.get("OOS_PRESENTATIE_ODF_UIT", ".local/presentatie-odf-volume" if VOLUME else ".local/presentatie-odf")).resolve()
spec = importlib.util.spec_from_file_location("odf_runner", ROOT / "scripts/test-odf-13.py")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
P = "{http://schemas.openxmlformats.org/presentationml/2006/main}"
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def node(*args):
    script = "scripts/test-presentatie-odf-volume.mjs" if VOLUME else "scripts/test-presentatie-odf.mjs"
    subprocess.run(["node", script, *args], cwd=ROOT, check=True,
                   env={**os.environ, "OOS_PRESENTATIE_ODF_UIT": str(OUT)}, timeout=60,
                   **({"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {}))


def convert(exe, source, ext, filter_name, directory):
    directory.mkdir(parents=True, exist_ok=True)
    # A short unique path also works with the portable Windows runtime. Profiles
    # are retained for review, without using or changing a personal profile.
    profile = Path(tempfile.mkdtemp(prefix="oos-odf-slides-"))
    (profile / "user").mkdir()
    (profile / "user/registrymodifications.xcu").write_bytes((ROOT / "src-tauri/src/conversieprofiel.xcu").read_bytes())
    ms = runner.run(exe, ["-env:UserInstallation=" + profile.as_uri(), "--headless", "--nologo",
        "--nodefault", "--norestore", "--nolockcheck", "--convert-to", ext + ":" + filter_name,
        "--outdir", str(directory), str(source)], directory)
    target = directory / (source.stem + "." + ext)
    if not target.is_file():
        raise RuntimeError("No native conversion output: " + str(target))
    return {"ms": ms, "output": str(target), "sha256": hashlib.sha256(target.read_bytes()).hexdigest(), "profile": str(profile)}


def independent(ext, expected):
    if VOLUME:
        return independent_volume(ext, expected)
    with zipfile.ZipFile(OUT / ("engine-" + ext + ".pptx")) as z:
        pres = E.fromstring(z.read("ppt/presentation.xml"))
        rels = {e.get("Id"): e.get("Target") for e in E.fromstring(z.read("ppt/_rels/presentation.xml.rels"))}
        slides = pres.find(P + "sldIdLst")
        assert len(slides) == 4
        sound_hashes = []
        for i, slide in enumerate(slides):
            target = rels[slide.get(R + "id")]
            path = os.path.normpath("ppt/" + target).replace("\\", "/")
            root = E.fromstring(z.read(path))
            transitions = root.findall(".//" + P + "transition")
            assert transitions
            for t in transitions:
                assert t.get("advTm") == str(expected["times"][i])
                assert t.get("advClick") in ("0", "false")
                assert t.find(P + "push").get("dir") == expected["dirs"][i]
                if ext != "fodp":
                    sound = t.find(".//" + P + "snd")
                    assert sound is not None
                    rp = path.rsplit("/", 1)[0] + "/_rels/" + path.rsplit("/", 1)[1] + ".rels"
                    rel = next(r for r in E.fromstring(z.read(rp)) if r.get("Id") == sound.get(R + "embed"))
                    assert rel.get("TargetMode") != "External"
                    mp = os.path.normpath(path.rsplit("/", 1)[0] + "/" + rel.get("Target")).replace("\\", "/")
                    sound_hashes.append(hashlib.sha256(z.read(mp)).hexdigest())
        assert not sound_hashes or len(set(sound_hashes)) == 1
        note_text = ["".join(E.fromstring(z.read(n)).itertext()) for n in z.namelist() if n.startswith("ppt/notesSlides/") and n.endswith(".xml")]
        assert any(expected["notes"] in text for text in note_text)
    return {"slides": 4, "allTransitionBranches": True, "notesPreserved": True,
            "soundActions": len(sound_hashes), "pass": True}


def independent_volume(ext, expected):
    p14 = "{http://schemas.microsoft.com/office/powerpoint/2010/main}"
    with zipfile.ZipFile(OUT / ("engine-" + ext + ".pptx")) as z:
        pres = E.fromstring(z.read("ppt/presentation.xml"))
        rels = {e.get("Id"): e.get("Target") for e in E.fromstring(z.read("ppt/_rels/presentation.xml.rels"))}
        slides = pres.find(P + "sldIdLst")
        assert len(slides) == 4
        count = 0
        for i, slide in enumerate(slides):
            path = os.path.normpath("ppt/" + rels[slide.get(R + "id")]).replace("\\", "/")
            root = E.fromstring(z.read(path))
            rp = path.rsplit("/", 1)[0] + "/_rels/" + path.rsplit("/", 1)[1] + ".rels"
            local = {r.get("Id"): r for r in E.fromstring(z.read(rp))}
            found = set()
            for pic in root.findall(".//" + P + "pic"):
                media = pic.find(".//" + p14 + "media")
                if media is None:
                    continue
                rel = local[media.get(R + "embed") or media.get(R + "link")]
                assert rel.get("TargetMode") != "External"
                target = os.path.normpath(path.rsplit("/", 1)[0] + "/" + rel.get("Target")).replace("\\", "/")
                digest = hashlib.sha256(z.read(target)).hexdigest()
                kind = next(k for k, value in expected["hashes"].items() if value == digest)
                assert kind not in found
                found.add(kind)
                value = expected["levels"][i if kind == "audio" else 3-i]
                shape_id = pic.find(P + "nvPicPr/" + P + "cNvPr").get("id")
                name = pic.find(P + "nvPicPr/" + P + "cNvPr").get("name")
                assert name == expected["names"][kind]
                nodes = [m for m in root.findall(".//" + P + "cMediaNode")
                         if m.find(P + "tgtEl/" + P + "spTgt").get("spid") == shape_id]
                if not nodes:
                    assert value == 1
                for m in nodes:
                    assert int(m.get("vol", "100000")) == round(value * 100000)
                    assert m.get("mute", "0") not in ("true", "1")
                count += 1
            assert found == {"audio", "video"}
        notes = ["".join(E.fromstring(z.read(n)).itertext()) for n in z.namelist() if n.startswith("ppt/notesSlides/") and n.endswith(".xml")]
        assert any(expected["notes"] in text for text in notes)
    return {"slides": 4, "exactVolumes": count, "mediaNames": count, "mediaBytesPreserved": True, "notesPreserved": True, "pass": True}


def main():
    exe = os.environ.get("OPENAEC_CONVERSIE_PROGRAMMA") or shutil.which("soffice") or shutil.which("libreoffice")
    if not exe:
        raise RuntimeError("Set OPENAEC_CONVERSIE_PROGRAMMA or install LibreOffice Impress")
    OUT.mkdir(parents=True, exist_ok=True)
    runner.OUT = OUT
    doc, manifest = runner.schema("OpenDocument-v1.3-schema.rng"), runner.schema("OpenDocument-v1.3-manifest-schema.rng")
    node("prepare")
    expected = json.loads((OUT / "expected.json").read_text(encoding="utf-8"))
    version_profile = Path(tempfile.mkdtemp(prefix="oos-slides-version-"))
    (version_profile / "user").mkdir()
    (version_profile / "user/registrymodifications.xcu").write_bytes((ROOT / "src-tauri/src/conversieprofiel.xcu").read_bytes())
    version_dir = OUT / "version"
    version_dir.mkdir(exist_ok=True)
    runner.run(exe, ["-env:UserInstallation=" + version_profile.as_uri(), "--headless", "--version"], version_dir)
    report = {"codepoint": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
              "platform": platform.platform(), "converterVersion": (version_dir / "converter.log").read_text(encoding="utf-8", errors="replace").strip(),
              "profileSha256": hashlib.sha256((ROOT / "src-tauri/src/conversieprofiel.xcu").read_bytes()).hexdigest(),
              "cases": [], "pass": False}
    try:
        for ext, filter_name in [("odp", "impress8"), ("otp", "impress8_template"), ("fodp", "OpenDocument Presentation Flat XML")]:
            if VOLUME and ext == "fodp":
                continue
            case = {"format": ext, "pass": False}
            report["cases"].append(case)
            try:
                case["export"] = convert(exe, OUT / ("source-" + ext + ".pptx"), ext, filter_name, OUT / ("raw-" + ext))
                node("export", ext)
                corrected = OUT / ("corrected-" + ext) / ("source-" + ext + "." + ext)
                if ext == "fodp":
                    root = E.fromstring(corrected.read_bytes(), E.XMLParser(resolve_entities=False, no_network=True))
                    valid = doc.validate(root)
                    case["validation"] = [{"part": "flat document", "valid": valid and root.get("{urn:oasis:names:tc:opendocument:xmlns:office:1.0}version") == "1.3", "errors": [str(e) for e in doc.error_log]}]
                else:
                    mime = "application/vnd.oasis.opendocument.presentation" + ("-template" if ext == "otp" else "")
                    case["validation"] = runner.validate(corrected, doc, manifest, mime)
                assert all(c["valid"] for c in case["validation"]), case["validation"]
                case["import"] = convert(exe, corrected, "pptx", "Impress MS PowerPoint 2007 XML", OUT / ("returned-" + ext))
                node("import", ext)
                case["independent"] = independent(ext, expected)
                case["pass"] = True
            except Exception as error:
                case["error"] = str(error)
            print(json.dumps({"format": ext, "pass": case["pass"], "error": case.get("error")}), flush=True)
        report["pass"] = all(c["pass"] for c in report["cases"])
    finally:
        (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return 0 if report["pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
