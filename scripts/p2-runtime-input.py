"""Prepare one provenance-bound, runtime-only Linux QA handoff; never install Office."""
import gzip
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import struct
import subprocess
import sys
import tarfile
import tempfile
import zipfile

REPO = "OpenAEC-Foundation/open-office-studio"
SOURCE = "dc3f8d5d6e8fdffaaec82caa4ab93b579e075e6b"
TREE = "5a644e397ecc6af5452a49b6404edf953687d1b2"
VERSION = "2026.48.1"
RUN = 45143305147
JOB = 137586343061
RUNTIME = PurePosixPath("usr/libexec/Open Office Studio/kantoorruntime")
META = PurePosixPath("usr/lib/Open Office Studio/kantoorruntime/meta")
OUT = Path(".local/p2-runtime-input")
RECOVERY = Path(".local/p2-runtime-recovery")


def sha(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            h.update(chunk)
    return h.hexdigest()


def command(*args, **options):
    return subprocess.check_output([str(a) for a in args], text=True, timeout=120, **options).strip()


def api(route):
    return json.loads(command("gh", "api", f"repos/{REPO}/{route}"))


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def artifact_metadata(name):
    artifacts = api(f"actions/runs/{RUN}/artifacts?per_page=100")["artifacts"]
    matches = [a for a in artifacts if a["name"] == name and not a["expired"]]
    assert len(matches) == 1, f"Exactly one nonexpired canonical artifact required: {name}"
    assert matches[0]["workflow_run"]["head_sha"] == SOURCE
    assert matches[0]["digest"].startswith("sha256:")
    return matches[0]


def download(artifact, path):
    assert not path.exists(), "A canonical archive is fetched once, never overwritten"
    with path.open("wb") as target:
        subprocess.run(["gh", "api", f"repos/{REPO}/actions/artifacts/{artifact['id']}/zip"], stdout=target, check=True, timeout=900)
    actual = sha(path)
    assert artifact["digest"] == "sha256:" + actual, "Actual downloaded artifact ZIP digest"
    return {"id": artifact["id"], "name": artifact["name"], "sha256": actual, "bytes": path.stat().st_size}


def bind_parent(work):
    run = api(f"actions/runs/{RUN}")
    job = api(f"actions/jobs/{JOB}")
    assert run["head_sha"] == SOURCE and run["path"] == ".github/workflows/desktop.yml"
    assert job["head_sha"] == SOURCE and job["run_id"] == RUN
    assert job["name"] == "desktop (ubuntu-22.04)"
    assert job["status"] == "completed" and job["conclusion"] == "success", "Own canonical Linux job must succeed; other platforms are independent"
    package_artifact = artifact_metadata("open-office-studio-Linux")
    report_artifact = artifact_metadata("pakketcontrole-Linux")
    recovery_run = os.environ.get("P2_RUNTIME_RECOVERY_RUN", "")
    if recovery_run:
        assert recovery_run.isdecimal()
        recovery_source = api(f"actions/runs/{recovery_run}")
        assert recovery_source["path"] == ".github/workflows/qa-p2-runtime-input.yml"
        subprocess.run(["gh", "run", "download", recovery_run, "--repo", REPO, "--name", "p2-runtime-prep-recovery", "--dir", str(RECOVERY)], check=True)
        parent = json.loads((RECOVERY / "parent.json").read_text())
        assert (parent["sourceCommit"], parent["sourceTree"], parent["appVersion"], parent["run"], parent["job"]) == (SOURCE, TREE, VERSION, RUN, JOB)
        assert parent["installerArchive"]["id"] == package_artifact["id"] and "sha256:" + parent["installerArchive"]["sha256"] == package_artifact["digest"]
        assert parent["reportArchive"]["id"] == report_artifact["id"] and "sha256:" + parent["reportArchive"]["sha256"] == report_artifact["digest"]
        report_file = RECOVERY / "package-verification-Linux.json"
        assert sha(report_file) == parent["packageReportSha256"]
        report = json.loads(report_file.read_text())
        assert report["programma"] == "open-office-studio" and report["versie"] == VERSION
        deb = RECOVERY / "canonical-office.deb"
        expected = next(p for p in report["pakketten"] if p["naam"] == parent["deb"]["originalName"])
        assert sha(deb) == expected["sha256"] == parent["deb"]["sha256"] and deb.stat().st_size == expected["bytes"]
        parent["reusedVerifiedDebRun"] = int(recovery_run)
        return deb, parent
    report_zip = work / "package-report.zip"
    report_archive = download(report_artifact, report_zip)
    with zipfile.ZipFile(report_zip) as archive:
        members = [n for n in archive.namelist() if PurePosixPath(n).name == "pakketcontrole-Linux.json"]
        assert len(members) == 1
        report_bytes = archive.read(members[0])
    report = json.loads(report_bytes)
    assert report["programma"] == "open-office-studio" and report["versie"] == VERSION and report["platform"] == "linux"
    packages = [p for p in report["pakketten"] if p["naam"].endswith(".deb")]
    assert len(packages) == 1
    expected = packages[0]
    RECOVERY.mkdir(parents=True, exist_ok=False)
    report_file = RECOVERY / "package-verification-Linux.json"
    report_file.write_bytes(report_bytes)
    # Only one large Desktop Linux archive download. AppImage stays unextracted.
    installer_zip = work / "desktop-linux.zip"
    installer_archive = download(package_artifact, installer_zip)
    deb = RECOVERY / "canonical-office.deb"
    with zipfile.ZipFile(installer_zip) as archive:
        members = [n for n in archive.namelist() if PurePosixPath(n).name == expected["naam"]]
        assert len(members) == 1
        with archive.open(members[0]) as src, deb.open("wb") as dest:
            shutil.copyfileobj(src, dest)
    assert deb.stat().st_size == expected["bytes"] and sha(deb) == expected["sha256"]
    parent = {"sourceCommit": SOURCE, "sourceTree": TREE, "appVersion": VERSION,
              "run": RUN, "job": JOB, "jobConclusion": job["conclusion"],
              "installerArchive": installer_archive, "reportArchive": report_archive,
              "packageReportSha256": sha(report_file),
              "deb": {"originalName": expected["naam"], "sha256": sha(deb), "bytes": deb.stat().st_size}}
    write_json(RECOVERY / "parent.json", parent)
    installer_zip.unlink()
    return deb, parent


def safe_name(name):
    while name.startswith("./"):
        name = name[2:]
    path = PurePosixPath(name)
    assert not path.is_absolute() and ".." not in path.parts and name, f"Unsafe package path: {name}"
    return path


def selected(path):
    return path == RUNTIME or RUNTIME in path.parents or path == META or META in path.parents or (
        str(path).startswith("usr/share/doc/") and str(path).split("/")[3] in ("open-office-studio", "Open Office Studio")
        and path.name.lower() in ("copyright", "license", "license.gz", "copyright.gz"))


def elf_metadata(prefix, digest, size):
    assert prefix[:6] == b"\x7fELF\x02\x01" and len(prefix) >= 64
    assert struct.unpack_from("<H", prefix, 18)[0] == 62, "x64 ELF required"
    return {"sha256": digest, "bytes": size, "format": "ELF64 little endian", "machine": "x86_64"}


def extract_runtime(stream, payload):
    payload.mkdir(parents=True, exist_ok=False)
    deferred = []
    executable = None
    source_entries = {}
    with tarfile.open(fileobj=stream, mode="r|") as archive:
        for item in archive:
            if item.name in (".", "./"):
                continue
            path = safe_name(item.name)
            keep = selected(path)
            is_app = str(path) == "usr/bin/open-office-studio"
            if not keep and not is_app:
                continue
            assert str(path) not in source_entries, f"Duplicate selected DEB path: {path}"
            source_entries[str(path)] = {"mode": f"{item.mode:04o}", "uid": item.uid, "gid": item.gid,
                                         "tarType": item.type.decode("ascii"), "linkTarget": item.linkname or None}
            if item.isfile():
                data = archive.extractfile(item)
                digest = hashlib.sha256()
                prefix = b""
                dest = payload.joinpath(*path.parts)
                if keep:
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    target = dest.open("wb")
                else:
                    target = None
                try:
                    while chunk := data.read(1024 * 1024):
                        digest.update(chunk)
                        if len(prefix) < 64:
                            prefix += chunk[:64 - len(prefix)]
                        if target:
                            target.write(chunk)
                finally:
                    if target:
                        target.close()
                if keep:
                    dest.chmod(item.mode)
                if is_app:
                    assert item.mode & 0o111
                    executable = elf_metadata(prefix, digest.hexdigest(), item.size)
            elif keep and item.isdir():
                dest = payload.joinpath(*path.parts)
                dest.mkdir(parents=True, exist_ok=True)
                dest.chmod(item.mode)
            elif keep and (item.issym() or item.islnk()):
                deferred.append((path, item))
            else:
                raise AssertionError(f"Unexpected selected package entry: {path} type={item.type!r}")
    assert executable is not None, "Inspect the actual Office ELF without writing/installing/starting it"
    for path, item in deferred:
        dest = payload.joinpath(*path.parts)
        dest.parent.mkdir(parents=True, exist_ok=True)
        assert not dest.exists() and not dest.is_symlink()
        if item.issym():
            assert not PurePosixPath(item.linkname).is_absolute(), f"Nonportable absolute link: {path} -> {item.linkname}"
            resolved = (dest.parent / item.linkname).resolve(strict=False)
            assert resolved.is_relative_to(payload.resolve()), f"Link escapes QA input: {path}"
            dest.symlink_to(item.linkname)
        else:
            target_path = safe_name(item.linkname)
            assert selected(target_path), f"Hardlink target outside selected runtime: {path}"
            target = payload.joinpath(*target_path.parts)
            assert target.is_file()
            os.link(target, dest)
    for path, item in deferred:
        dest = payload.joinpath(*path.parts)
        assert dest.resolve(strict=True).is_relative_to(payload.resolve()), f"Broken/external link: {path}"
    return executable, source_entries


def entry_manifest(payload, source_entries=None):
    entries = []
    for path in sorted(payload.rglob("*")):
        relative = path.relative_to(payload).as_posix()
        info = path.lstat()
        entry = {"path": "payload/" + relative, "mode": f"{stat.S_IMODE(info.st_mode):04o}"}
        if source_entries and relative in source_entries:
            entry["debMetadata"] = source_entries[relative]
        if path.is_symlink():
            target = os.readlink(path)
            resolved = path.resolve(strict=True)
            assert resolved.is_relative_to(payload.resolve())
            entry.update(type="symlink", linkTarget=target,
                         linkTargetSha256=hashlib.sha256(os.fsencode(target)).hexdigest(),
                         resolvedPath="payload/" + resolved.relative_to(payload).as_posix())
        elif path.is_file():
            entry.update(type="file", bytes=info.st_size, sha256=sha(path))
        elif path.is_dir():
            entry.update(type="directory")
        else:
            raise AssertionError(f"Unsupported runtime entry {path}")
        entries.append(entry)
    return entries


def portable_tar(payload, destination):
    with destination.open("wb") as target, gzip.GzipFile(fileobj=target, mode="wb", mtime=0, filename="") as zipped:
        with tarfile.open(fileobj=zipped, mode="w|", format=tarfile.PAX_FORMAT) as archive:
            for path in [payload] + sorted(payload.rglob("*")):
                relative = "payload" if path == payload else "payload/" + path.relative_to(payload).as_posix()
                info = archive.gettarinfo(str(path), arcname=relative)
                info.uid = info.gid = 0
                info.uname = info.gname = "root"
                info.mtime = 0
                with path.open("rb") if info.isfile() else io.BytesIO() as data:
                    archive.addfile(info, data if info.isfile() else None)


def canary(consumer, receipt):
    program = consumer / "payload" / RUNTIME / receipt["executable"]
    runtime = consumer / "payload" / RUNTIME
    assert program.resolve(strict=True).is_relative_to(runtime.resolve())
    for name in ("/usr/bin/libreoffice", "/usr/bin/soffice", "/usr/bin/open-office-studio"):
        assert not Path(name).exists(), f"No host suite or LibreOffice allowed: {name}"
    packages = command("dpkg-query", "-W", "-f=${Package}\n").splitlines()
    assert not any(p == "open-office-studio" or p.startswith("libreoffice") for p in packages)
    home = consumer / "canary-home"
    home.mkdir(mode=0o700)
    case = consumer / "canary"
    case.mkdir()
    env = {"HOME": str(home), "XDG_CONFIG_HOME": str(home / "config"), "XDG_DATA_HOME": str(home / "data"),
           "PATH": "/usr/bin:/bin", "LANG": "C.UTF-8", "SAL_USE_VCLPLUGIN": "svp"}
    invocation = [str(program), "-env:UserInstallation=" + (home / "profile").as_uri(), "--headless", "--nologo", "--nodefault", "--nolockcheck", "--nofirststartwizard"]
    version = command(*invocation, "--version", env=env, cwd=case)
    assert receipt["version"] in version
    marker = "P2_PRIVATE_RUNTIME_ONLY_CANARY_2026_48_1"
    source = case / "canary.txt"
    source.write_text(marker + "\n", encoding="utf-8")
    trace = OUT / "canary-execve.log"
    result = command("strace", "-f", "-e", "trace=execve", "-o", trace, *invocation,
                     "--convert-to", "fodt", "--outdir", case, source, env=env, cwd=case)
    output = case / "canary.fodt"
    assert output.is_file() and marker in output.read_text(encoding="utf-8")
    trace_text = trace.read_text()
    assert str(runtime / "program/soffice.bin") in trace_text
    assert 'execve("/usr/bin/soffice' not in trace_text and 'execve("/usr/bin/libreoffice' not in trace_text
    (OUT / "canary.fodt").write_bytes(output.read_bytes())
    ldd = command("ldd", runtime / "program/soffice.bin", env=env)
    assert "not found" not in ldd
    (OUT / "soffice-bin-ldd.txt").write_text(ldd + "\n")
    return {"status": "passed", "scope": "runtime-only headless version and synthetic TXT-to-FODT canary; no Office GUI or format-matrix acceptance",
            "versionOutput": version, "stdout": result, "marker": marker, "outputSha256": sha(OUT / "canary.fodt"),
            "execveTraceSha256": sha(trace), "hostLibreOffice": "absent", "environment": env,
            "os": Path("/etc/os-release").read_text(), "kernel": command("uname", "-srm")}


def main():
    assert os.environ.get("GITHUB_ACTIONS") == "true" and os.environ["GITHUB_REPOSITORY"] == REPO
    assert command("git", "rev-parse", "HEAD") == SOURCE
    assert command("git", "rev-parse", "HEAD^{tree}") == TREE
    assert json.loads(Path("package.json").read_text())["version"] == VERSION
    manifest = json.loads(Path("assets/kantoorruntime.json").read_text())
    OUT.mkdir(parents=True, exist_ok=False)
    with tempfile.TemporaryDirectory(prefix="p2-runtime-only-", dir=os.environ["RUNNER_TEMP"]) as temp:
        work = Path(temp)
        deb, parent = bind_parent(work)
        for field, expected in (("Package", "open-office-studio"), ("Version", VERSION), ("Architecture", "amd64")):
            assert command("dpkg-deb", "--field", deb, field) == expected
        payload = work / "producer-payload"
        process = subprocess.Popen(["dpkg-deb", "--fsys-tarfile", str(deb)], stdout=subprocess.PIPE)
        try:
            executable, source_entries = extract_runtime(process.stdout, payload)
        finally:
            process.stdout.close()
        assert process.wait(timeout=60) == 0
        receipt_path = payload / META / "receipt.json"
        receipt = json.loads(receipt_path.read_text())
        receipt_sha = sha(receipt_path)
        asset = manifest["targets"]["linux-x64"]
        assert receipt["target"] == "linux-x64" and receipt["version"] == manifest["version"]
        assert receipt["sourceSha256"] == asset["sha256"] and receipt["executable"] == asset["executable"]
        assert receipt["layoutVersion"] == manifest["layoutVersion"]
        private = payload / RUNTIME
        for name in ("LICENSE.html", "NOTICE", "meta/SOURCE-NOTICE.txt"):
            assert (private / name).is_file(), f"Bundled runtime original licenses/notice required: {name}"
        if (private / "meta/receipt.json").exists():
            assert (private / "meta/receipt.json").read_bytes() == receipt_path.read_bytes()
        entries = entry_manifest(payload, source_entries)
        write_json(OUT / "entry-manifest.json", entries)
        tar = OUT / "runtime-only-p2-linux-x64.tar.gz"
        portable_tar(payload, tar)
        # Producer files are removed before the consumer canary: only tar bytes remain.
        assert payload.resolve().is_relative_to(work.resolve())
        shutil.rmtree(payload)
        consumer = work / "consumer"
        consumer.mkdir()
        with tarfile.open(tar, "r:gz") as archive:
            archive.extractall(consumer, filter="data")
        consumed = entry_manifest(consumer / "payload")
        comparable = [{k: v for k, v in e.items() if k != "debMetadata"} for e in entries]
        assert consumed == comparable, "Consumer-extracted bytes, modes and links equal the complete manifest"
        probe = canary(consumer, receipt)
        write_json(OUT / "canary-report.json", probe)
        descriptor = {"schemaVersion": 1, "purpose": "Shared runtime-only QA input for parallel #30 probes; not standalone-app or GUI release acceptance",
                      "parent": parent, "officeExecutableMetadataOnly": executable,
                      "runtimeReceipt": receipt, "runtimeReceiptSha256": receipt_sha,
                      "runtimeManifestSourceSha256": sha("assets/kantoorruntime.json"),
                      "tar": {"name": tar.name, "sha256": sha(tar), "bytes": tar.stat().st_size},
                      "entryManifest": {"name": "entry-manifest.json", "sha256": sha(OUT / "entry-manifest.json"), "entries": len(entries)},
                      "canonicalConverterPath": "payload/" + str(RUNTIME / receipt["executable"]),
                      "resourcesPath": "payload/usr/lib/Open Office Studio",
                      "privateRuntimePath": "payload/" + str(RUNTIME),
                      "canary": {"status": probe["status"], "report": "canary-report.json", "reportSha256": sha(OUT / "canary-report.json")},
                      "qaRun": int(os.environ["GITHUB_RUN_ID"]), "qaArtifact": "p2-linux-private-runtime-only",
                      "harnessCommit": command("git", "-C", Path(__file__).resolve().parent.parent, "rev-parse", "HEAD")}
        write_json(OUT / "descriptor.json", descriptor)
        shutil.copy2(RECOVERY / "package-verification-Linux.json", OUT)
        verifier = Path(__file__).with_name("p2-runtime-consumer.py")
        shutil.copy2(verifier, OUT)
        descriptor["consumerVerifierSha256"] = sha(OUT / verifier.name)
        write_json(OUT / "descriptor.json", descriptor)
        verification = command(sys.executable, (OUT / verifier.name).resolve(), OUT.resolve(), descriptor["tar"]["sha256"], work / "worker-verified")
        write_json(OUT / "consumer-verification.json", json.loads(verification))
        print(json.dumps(descriptor))


if __name__ == "__main__":
    main()
