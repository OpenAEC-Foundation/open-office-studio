"""Fetch/install one exact existing 420 DEB on a disposable runner. Never build."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import subprocess
import zipfile

REPO = "OpenAEC-Foundation/open-office-studio"
SOURCE = "420af640c10ab9ada6c66c844c0098caea87c493"
TREE = "c1334c8f4d92914e9d2114d56e467ef11eab9646"
RUN = 44753496663
ARTIFACT = 14639121545
ARCHIVE_SHA = "3ba6fcdc910803e107b881f57273373db0bfd7f423e6c1e8eb80a78e1cddf7da"
DEB_NAME = "Open Office Studio_2026.47.1_amd64.deb"
DEB_SHA = "c68ccacc61421afec6e7a30a26d9ef38f9cb954e86fd5ff9f31c4146a61261e9"
ELF_SHA = "ea4b4eaf1ac8929a19dba67b7f0dc80561dce119fb66a082a0c8d87d093e6f17"


def digest(path):
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for data in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(data)
    return result.hexdigest()


def api(path):
    return json.loads(subprocess.check_output(["gh", "api", f"repos/{REPO}/{path}"]))


if __name__ == "__main__":
    assert os.environ.get("GITHUB_ACTIONS") == "true", "Disposable runner only"
    assert subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip() == SOURCE
    assert subprocess.check_output(["git", "rev-parse", "HEAD^{tree}"], text=True).strip() == TREE
    run = api(f"actions/runs/{RUN}")
    assert run["head_sha"] == SOURCE and run["status"] == "completed"
    jobs = api(f"actions/runs/{RUN}/jobs?per_page=100")["jobs"]
    assert any(j["name"] == "desktop (ubuntu-22.04)" and j["conclusion"] == "success" for j in jobs)
    artifact = api(f"actions/artifacts/{ARTIFACT}")
    assert artifact["name"] == "open-office-studio-Linux" and not artifact["expired"]
    assert artifact["digest"] == "sha256:" + ARCHIVE_SHA
    assert artifact["workflow_run"]["id"] == RUN
    out = Path(".local/linux420-input")
    out.mkdir(parents=True, exist_ok=False)
    archive = out / "canonical-artifact.zip"
    with archive.open("wb") as stream:
        subprocess.run(["gh", "api", f"repos/{REPO}/actions/artifacts/{ARTIFACT}/zip"], stdout=stream, check=True)
    assert digest(archive) == ARCHIVE_SHA, "Actual downloaded archive differs"
    package = out / DEB_NAME
    with zipfile.ZipFile(archive) as bundle:
        matches = [n for n in bundle.namelist() if PurePosixPath(n).name == DEB_NAME]
        assert len(matches) == 1, "Exactly one canonical DEB"
        member = PurePosixPath(matches[0])
        assert not member.is_absolute() and ".." not in member.parts and "\\" not in str(member)
        with bundle.open(str(member)) as source, package.open("wb") as target:
            for data in iter(lambda: source.read(1024 * 1024), b""):
                target.write(data)
    assert digest(package) == DEB_SHA
    version = subprocess.check_output(["dpkg-deb", "-f", str(package), "Version"], text=True).strip()
    architecture = subprocess.check_output(["dpkg-deb", "-f", str(package), "Architecture"], text=True).strip()
    assert version == "2026.47.1" and architecture == "amd64"
    extracted = out / "deb-payload"
    subprocess.run(["dpkg-deb", "--extract", str(package), str(extracted)], check=True)
    payload = extracted / "usr/bin/open-office-studio"
    assert digest(payload) == ELF_SHA
    subprocess.run(["sudo", "dpkg", "--install", str(package)], check=True)
    assert digest(Path("/usr/bin/open-office-studio")) == ELF_SHA
    identity = dict(sourceCommit=SOURCE, sourceTree=TREE, version=version, artifactRun=RUN,
                    artifactId=ARTIFACT, artifactName=artifact["name"], archiveSha256=ARCHIVE_SHA,
                    packageMember=str(member), packagePath=str(package.resolve()), packageSha256=DEB_SHA,
                    executableSha256=ELF_SHA, executionApproved=True,
                    scope="Linux packaged 368/369 combination; not another release source")
    (out / "identity.json").write_text(json.dumps(identity, indent=2) + "\n")
    (out / "api-run.json").write_text(json.dumps({k: run[k] for k in ["id", "head_sha", "status", "conclusion", "html_url"]}, indent=2) + "\n")
    print(json.dumps(identity, indent=2))
