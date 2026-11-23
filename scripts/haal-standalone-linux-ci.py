"""Split standalone apps from one checksum-verified release artifact download.

The complete artifact stays in RUNNER_TEMP, outside the isolated app HOME. Office
payloads are never extracted. A successful build is not treated as native proof.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import zipfile

REPO = "OpenAEC-Foundation/open-office-studio"


def api(route):
    return json.loads(subprocess.check_output(["gh", "api", f"repos/{REPO}/{route}"]))


def digest(path):
    checksum = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            checksum.update(chunk)
    return checksum.hexdigest()


def main():
    assert os.environ["GITHUB_REPOSITORY"] == REPO
    source = os.environ["STANDALONE_APP_COMMIT"]
    run_id = os.environ["STANDALONE_BUILD_RUN"]
    assert len(source) == 40 and run_id.isdecimal()
    assert subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip() == source
    studios = json.loads(Path("assets/studios.json").read_text())
    studios = [s for s in studios if s["sleutel"] != "office"]
    assert len(studios) == 6
    purpose = os.environ.get("STANDALONE_PURPOSE", "frozen-candidate-acceptance")
    assert purpose in ("frozen-candidate-acceptance", "host-driver-preflight-NOT-final-acceptance")
    if purpose == "host-driver-preflight-NOT-final-acceptance":
        studios = [s for s in studios if s["sleutel"] == "notition"]
    version = json.loads(Path("package.json").read_text())["version"]
    run = api(f"actions/runs/{run_id}")
    assert run["head_sha"] == source
    assert run["path"] == ".github/workflows/release.yml"
    artifacts = api(f"actions/runs/{run_id}/artifacts?per_page=100")["artifacts"]
    matches = [a for a in artifacts if a["name"] == "uitgave-Linux" and not a["expired"]]
    assert len(matches) == 1
    artifact = matches[0]
    reuse = os.environ.get("STANDALONE_PREFLIGHT_REUSE_RUN", "")
    if reuse:
        assert purpose == "host-driver-preflight-NOT-final-acceptance" and reuse.isdecimal()
        qa_run = api(f"actions/runs/{reuse}")
        assert qa_run["path"] == ".github/workflows/standalone-linux-acceptance.yml"
        out = Path(".local/standalone-linux-prepared/notition")
        subprocess.run(["gh", "run", "download", reuse, "--repo", REPO, "--name", "standalone-input-notition", "--dir", str(out)], check=True)
        origin = json.loads((out / "origin.json").read_text())
        assert origin["purpose"] == purpose and origin["sourceCommit"] == source and origin["version"] == version
        assert origin["run"] == int(run_id) and origin["artifact"]["id"] == artifact["id"]
        assert "sha256:" + origin["artifact"]["zipSha256"] == artifact["digest"]
        assert origin["sourceTree"] == subprocess.check_output(["git", "rev-parse", "HEAD^{tree}"], text=True).strip()
        assert origin["studio"]["sleutel"] == "notition"
        for package in origin["packages"]:
            path = out / package["path"]
            assert path.parent == out and path.stat().st_size == package["bytes"] and digest(path) == package["sha256"]
        origin["reusedVerifiedInputRun"] = int(reuse)
        (out / "origin.json").write_text(json.dumps(origin, indent=2) + "\n")
        print(json.dumps(origin))
        return
    archive = Path(os.environ["RUNNER_TEMP"]) / "standalone-release.zip"
    with archive.open("wb") as target:
        subprocess.run(["gh", "api", f"repos/{REPO}/actions/artifacts/{artifact['id']}/zip"], stdout=target, check=True)
    archive_hash = digest(archive)
    assert artifact["digest"] == "sha256:" + archive_hash
    with zipfile.ZipFile(archive) as bundle:
        for studio in studios:
            extract_app(bundle, studio, version, source, run_id, artifact, archive_hash)
    archive.unlink()


def extract_app(bundle, studio, version, source, run_id, artifact, archive_hash):
    app = studio["sleutel"]
    out = Path(".local/standalone-linux-prepared") / app
    out.mkdir(parents=True, exist_ok=False)
    report_name = "pakketcontrole-Database-Linux.json" if app == "database" else f"pakketcontrole-{app}-Linux.json"
    for member in bundle.namelist():
        name = Path(member).name
        is_app_package = f"/{app}/" in "/" + member and name.endswith((".deb", ".AppImage"))
        if not is_app_package and name != report_name:
            continue
        dest = out / name
        assert not dest.exists(), f"Duplicate artifact member: {name}"
        with bundle.open(member) as src, dest.open("wb") as target:
            shutil.copyfileobj(src, target)
    packages = sorted(p for p in out.iterdir() if p.suffix in (".deb", ".AppImage"))
    assert len(packages) == 2 and {p.suffix for p in packages} == {".deb", ".AppImage"}
    control = json.loads((out / report_name).read_text())
    assert control["programma"] == studio["programma"] and control["versie"] == version
    for package in packages:
        expected = next(p for p in control["pakketten"] if p["naam"] == package.name)
        assert package.stat().st_size == expected["bytes"] and digest(package) == expected["sha256"]
    origin = {"sourceCommit": source, "sourceTree": subprocess.check_output(["git", "rev-parse", "HEAD^{tree}"], text=True).strip(),
              "version": version, "run": int(run_id), "artifact": {"id": artifact["id"], "zipSha256": archive_hash},
              "purpose": os.environ.get("STANDALONE_PURPOSE", "frozen-candidate-acceptance"),
              "studio": studio, "packageReport": report_name,
              "packages": [{"path": p.name, "sha256": digest(p), "bytes": p.stat().st_size} for p in packages],
              "signatureStatus": "not signed: detached Linux OpenPGP signatures are created only by the publishing job, which is not authorized"}
    (out / "origin.json").write_text(json.dumps(origin, indent=2) + "\n")
    print(json.dumps(origin))


if __name__ == "__main__":
    main()
