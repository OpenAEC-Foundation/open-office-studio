"""Consume only the coordinator-pinned separate Suite transfer, never parent ZIP."""
import hashlib
import json
import os
import re
from pathlib import Path, PurePosixPath
import shutil
import stat
import subprocess
import sys
import zipfile

REPO = "OpenAEC-Foundation/open-office-studio"
HERE = Path(__file__).resolve().parent.parent


def digest(path):
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def safe_member(name):
    path = PurePosixPath(name)
    assert not path.is_absolute() and ".." not in path.parts and "\\" not in name
    return path


def verify_artifact(actual, expected, run, commit, *, transfer=False):
    assert actual["id"] == expected["id"] and actual["name"] == expected["name"]
    assert actual["expired"] is False
    assert actual["workflow_run"]["id"] == run and actual["workflow_run"]["head_sha"] == commit
    checksum, size = (expected["zipSha256"], expected["zipBytes"]) if transfer else (expected["sha256"], expected["bytes"])
    assert actual["digest"] == "sha256:" + checksum and actual["size_in_bytes"] == size


def validate_descriptor(value, request, kind):
    assert request["go"] is True and request["publicationAuthorized"] is False
    assert value["schemaVersion"] == 1 and value["executionApproved"] is True
    candidate, parent, package = request["candidate"], value["parent"], value["package"]
    assert not any(s["commit"] == candidate["commit"] for s in request["supersededCandidates"])
    for key, candidate_key in [("sourceCommit", "commit"), ("sourceTree", "tree"), ("appVersion", "version"), ("run", "producerRun"), ("job", "linuxJob"), ("attempt", "attempt")]:
        assert parent[key] == candidate[candidate_key], key
    assert parent["jobConclusion"] == "success" and parent["reportArchive"] is None
    assert package["kind"] == kind
    assert package["member"] == ("canonical-office.deb" if kind == "deb" else "canonical-office.AppImage")
    safe_member(package["member"])
    safe_member(parent["packageMember"])
    safe_member(parent["packageReportMember"])
    assert package["payloadElf"]["path"] == "usr/bin/open-office-studio"
    assert package["payloadElf"]["elfClass"] == 2 and package["payloadElf"]["machine"] == 62
    if kind == "deb":
        assert package["control"]["Package"] == "open-office-studio"
        assert package["control"]["Version"] == candidate["version"] and package["control"]["Architecture"] == "amd64"
        assert "zenity" in package["control"]["Depends"]
    else:
        assert package["control"] is None, "AppImage is bound through its own report/payload, never DEB control fields"
    assert value["signatureBinding"]["publicationAuthorized"] is False
    for checksum in [parent["installerArchive"]["sha256"], parent["packageReportSha256"], value["artifact"]["zipSha256"], package["sha256"], package["payloadElf"]["sha256"]]:
        assert isinstance(checksum, str) and re.fullmatch(r"[0-9a-f]{64}", checksum)
    for size in [parent["installerArchive"]["bytes"], value["artifact"]["zipBytes"], package["bytes"], package["payloadElf"]["bytes"]]:
        assert isinstance(size, int) and size > 0
    for number in [parent["installerArchive"]["id"], value["artifact"]["run"], value["artifact"]["id"]]:
        assert isinstance(number, int) and number > 0
    assert re.fullmatch(r"[0-9a-f]{40}", value["qaPin"]["producerCommit"])
    assert isinstance(package["payloadElf"]["mode"], int) and package["payloadElf"]["mode"] & 0o111
    return value


def copy_package(archive, destination, package):
    with zipfile.ZipFile(archive) as bundle:
        assert bundle.testzip() is None
        assert all(safe_member(info.filename) for info in bundle.infolist())
        entries = [i for i in bundle.infolist() if i.filename == package["member"]]
        assert len(entries) == 1 and not entries[0].is_dir() and entries[0].file_size == package["bytes"]
        with bundle.open(entries[0]) as source, destination.open("xb") as target:
            shutil.copyfileobj(source, target, 1024 * 1024)
    assert destination.stat().st_size == package["bytes"] and digest(destination) == package["sha256"]


def verify_transfer_members(archive, descriptor):
    """Bind the original optional signature bytes, without certifying signatures."""
    package, parent = descriptor["package"], descriptor["parent"]
    report_name = PurePosixPath(parent["packageReportMember"]).name
    signatures = descriptor["signatureBinding"]["members"]
    expected = [package["member"], report_name, "descriptor.json"]
    for signature in signatures:
        assert signature["packagePath"] == PurePosixPath(parent["packageMember"]).name
        assert signature["path"] == signature["packagePath"] + ".sig"
        assert signature["canonicalMember"] == parent["packageMember"] + ".sig"
        assert re.fullmatch(r"[0-9a-f]{64}", signature["sha256"])
        assert isinstance(signature["bytes"], int) and signature["bytes"] > 0
        expected.append(signature["path"])
    assert len(expected) == len(set(expected))
    with zipfile.ZipFile(archive) as bundle:
        names = bundle.namelist()
        assert len(names) == len(set(names)) and set(names) == set(expected)
        assert all(safe_member(n).parent == PurePosixPath(".") for n in names)
        embedded = json.loads(bundle.read("descriptor.json"))
        for key in ["parent", "package", "qaPin", "signatureBinding"]:
            assert embedded[key] == descriptor[key], key
        for key in ["run", "name"]:
            assert embedded["artifact"][key] == descriptor["artifact"][key]
        for signature in signatures:
            raw = bundle.read(signature["path"])
            assert len(raw) == signature["bytes"] and hashlib.sha256(raw).hexdigest() == signature["sha256"]
        report = bundle.read(report_name)
    assert hashlib.sha256(report).hexdigest() == parent["packageReportSha256"]
    return report


def verify_elf(path, expected):
    with path.open("rb") as stream:
        header = stream.read(20)
    assert header[:6] == b"\x7fELF\x02\x01" and int.from_bytes(header[18:20], "little") == 62
    assert path.stat().st_size == expected["bytes"] and digest(path) == expected["sha256"]
    assert stat.S_IMODE(path.stat().st_mode) == stat.S_IMODE(expected["mode"])
    assert stat.S_IMODE(path.stat().st_mode) & 0o111


def api(path):
    return json.loads(subprocess.check_output(["gh", "api", f"repos/{REPO}/{path}"]))


def main(kind):
    assert sys.platform == "linux" and os.environ.get("GITHUB_ACTIONS") == "true"
    assert kind in ("deb", "appimage")
    request = json.loads((HERE / "qa/linux-suite-final/request.json").read_bytes())
    assert request["go"] is True, "No coordinator package start instruction"
    pin = request["inputDescriptors"][kind]
    assert pin["path"] == f"qa/linux-suite-final/office-{kind}-input-descriptor.json"
    assert pin["upstreamPath"] == f"docs/tests/linux-release-input-p5/office-{kind}-input-descriptor.json"
    descriptor_path = HERE / pin["path"]
    assert digest(descriptor_path) == pin["sha256"]
    subprocess.run(["git", "-C", str(HERE), "fetch", "--no-tags", "--depth=1", "origin", pin["commit"]], check=True)
    git_bytes = subprocess.check_output(["git", "-C", str(HERE), "show", f"{pin['commit']}:{pin['upstreamPath']}"])
    assert git_bytes == descriptor_path.read_bytes(), "Exact producer Git descriptor bytes"
    value = validate_descriptor(json.loads(git_bytes), request, kind)
    candidate, parent, transfer, package = request["candidate"], value["parent"], value["artifact"], value["package"]
    git = lambda *args: subprocess.check_output(["git", *args], text=True).strip()
    assert git("rev-parse", "HEAD") == candidate["commit"] and git("rev-parse", "HEAD^{tree}") == candidate["tree"]
    assert git("status", "--porcelain", "--untracked-files=no") == ""
    assert json.loads(Path("package.json").read_bytes())["version"] == candidate["version"]
    run = api(f"actions/runs/{parent['run']}/attempts/{parent['attempt']}")
    job = api(f"actions/jobs/{parent['job']}")
    assert run["head_sha"] == candidate["commit"] and run["run_attempt"] == parent["attempt"]
    assert job["run_id"] == parent["run"] and job["run_attempt"] == parent["attempt"]
    assert job["head_sha"] == candidate["commit"] and job["status"] == "completed" and job["conclusion"] == "success"
    canonical = api(f"actions/artifacts/{parent['installerArchive']['id']}")
    verify_artifact(canonical, parent["installerArchive"], parent["run"], candidate["commit"])
    producer = api(f"actions/runs/{transfer['run']}")
    assert producer["head_sha"] == value["qaPin"]["producerCommit"]
    actual = api(f"actions/artifacts/{transfer['id']}")
    verify_artifact(actual, transfer, transfer["run"], value["qaPin"]["producerCommit"], transfer=True)
    out = Path(".local/linux-suite-final-input")
    out.mkdir(parents=True, exist_ok=False)
    archive = out / "suite-input.zip"
    with archive.open("xb") as stream:
        subprocess.run(["gh", "api", f"repos/{REPO}/actions/artifacts/{transfer['id']}/zip"], stdout=stream, check=True)
    assert archive.stat().st_size == transfer["zipBytes"] and digest(archive) == transfer["zipSha256"]
    shared = HERE / "qa/linux-suite-final/input-upstream"
    shared_pin = json.loads((shared / "upstream-binding.json").read_bytes())
    assert shared_pin["commit"] == "9b996cc1e9f1e81febbb097a93309c1fe5d59cca"
    for name, checksum in shared_pin["files"].items():
        assert digest(shared / name) == checksum
    shared_out = out / "shared-verification"
    subprocess.run([sys.executable, str(shared / "verify-linux-suite-input-p5.py"), "--descriptor", str(descriptor_path), "--zip", str(archive.resolve()), "--out", str(shared_out.resolve())], check=True)
    shutil.copyfile(shared_out / "verified-input.json", out / "shared-verifier-receipt.json")
    report_bytes = verify_transfer_members(archive, value)
    with zipfile.ZipFile(archive) as bundle:
        for signature in value["signatureBinding"]["members"]:
            (out / signature["path"]).write_bytes(bundle.read(signature["path"]))
    path = out / package["member"]
    copy_package(archive, path, package)
    report = json.loads(report_bytes)
    assert report["platform"] == "linux" and report["programma"] == "open-office-studio" and report["versie"] == candidate["version"]
    matches = [p for p in report["pakketten"] if p["sha256"] == package["sha256"] and p["bytes"] == package["bytes"] and p["naam"] == PurePosixPath(parent["packageMember"]).name]
    assert len(matches) == 1
    (out / "canonical-package-report.json").write_bytes(report_bytes)
    (out / "native-input-descriptor.json").write_bytes(git_bytes)
    extracted = out / "payload"
    if kind == "deb":
        for field, expected in package["control"].items():
            assert subprocess.check_output(["dpkg-deb", "-f", str(path), field], text=True).strip() == expected, field
        subprocess.run(["dpkg-deb", "--extract", str(path), str(extracted)], check=True)
        verify_elf(extracted / package["payloadElf"]["path"], package["payloadElf"])
        # The package manager resolves the actual declared requirement. Zenity
        # is never installed as an undeclared native test tool on this host.
        subprocess.run(["sudo", "apt-get", "install", "-y", "--no-install-recommends", str(path.resolve())], check=True)
        installed = Path("/usr/bin/open-office-studio")
        verify_elf(installed, package["payloadElf"])
        launch, launch_sha = installed, digest(installed)
    else:
        assert not Path("/usr/bin/open-office-studio").exists(), "AppImage host has no installed Suite DEB"
        path.chmod(0o755)
        extracted.mkdir()
        subprocess.run([str(path.resolve()), "--appimage-extract"], cwd=extracted, check=True, stdout=subprocess.DEVNULL)
        verify_elf(extracted / "squashfs-root" / package["payloadElf"]["path"], package["payloadElf"])
        launch, launch_sha = path.resolve(), package["sha256"]
    identity = dict(sourceCommit=candidate["commit"], sourceTree=candidate["tree"], version=candidate["version"],
                    packageType=kind, packagePath=str(path.resolve()), packageSha256=package["sha256"],
                    executableSha256=package["payloadElf"]["sha256"], launchPath=str(launch), launchSha256=launch_sha,
                    expectedPayloadElf=package["payloadElf"], origin=value, descriptorGit=pin["commit"], descriptorSha256=pin["sha256"],
                    consumerSha256=digest(Path(__file__)), executionApproved=True,
                    signatureStatus="Descriptor binding retained; no cryptographic signature certification by this native consumer")
    (out / f"{kind}-identity.json").write_text(json.dumps(identity, indent=2) + "\n")
    if kind == "deb":
        (out / "identity.json").write_text(json.dumps(identity, indent=2) + "\n")
    (out / "api-bindings.json").write_text(json.dumps(dict(run=run, job=job, canonical=canonical, producer=producer, transfer=actual), indent=2) + "\n")
    print(json.dumps(identity, indent=2))


if __name__ == "__main__":
    main(sys.argv[1])
