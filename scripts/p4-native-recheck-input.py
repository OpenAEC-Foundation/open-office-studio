"""One unchanged P4 Desktop artifact recheck; the original failed job stays failed."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import zipfile

REPO = "OpenAEC-Foundation/open-office-studio"
SOURCE = "04fa6cd43b84e3f59fb9d5055bb2d00dde351a47"
TREE = "94fa38c20b51a73e4912964f37f0e1a659b0fb1b"
RUN, JOB, ATTEMPT = 45172076803, 137683860055, 1
PINS = [
    (14818307604, "open-office-studio-Linux", 811837559, "131866de994986d4e3cd5ebce3b16148303074084854c5dfae6f31363103c106"),
    (14818337583, "pakketcontrole-Linux", 675, "acef4b384c8df391f3d6786cf51c0205b1f1a707204056c388a61748206faab7"),
    (14818562463, "native-linux-writer-roundtrip", 1114, "71b70b2ed001844594de18f38fd66d852270727d4d758b753489ddbcbd2cad01"),
]
DEB_SHA = "c666690b091d5a4548c7e6d3f3157f9b3c77cb10b534ba2b0d1cbf02b297b3a0"
ELF_SHA = "ee4ed6255cd99a354fa9bccd8c0e990e6f30fd9f1e71f0448e464af3f5d53cb9"


def api(route):
    return json.loads(subprocess.check_output(["gh", "api", f"repos/{REPO}/{route}"]))


def sha(path):
    digest = hashlib.sha256()
    with path.open("rb") as src:
        while chunk := src.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


assert os.environ["GITHUB_REPOSITORY"] == REPO
assert subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip() == SOURCE
assert subprocess.check_output(["git", "rev-parse", "HEAD^{tree}"], text=True).strip() == TREE
run = api(f"actions/runs/{RUN}")
assert run["head_sha"] == SOURCE and run["run_attempt"] == ATTEMPT
assert run["path"] == ".github/workflows/desktop.yml"
job = api(f"actions/jobs/{JOB}")
assert (job["run_id"], job["head_sha"], job["run_attempt"], job["status"], job["conclusion"]) == (RUN, SOURCE, ATTEMPT, "completed", "failure")
steps = {s["name"]: s for s in job["steps"]}
native = steps["Native Linux Writer edit, save and full application reopen"]
assert native["conclusion"] == "failure"
for name in ["Linux-pakket bouwen", "Linux-installers werkelijk uitpakken en controleren", "Run actions/upload-artifact@v4", "Pakketrapport bewaren"]:
    step = steps[name]
    assert step["conclusion"] == "success" and step["completed_at"] <= native["started_at"]

out = Path(".local/p4-native-original")
out.mkdir(parents=True, exist_ok=False)
package_dir = Path(".local/native-recheck-package")
package_dir.mkdir(parents=True, exist_ok=False)
origin = {"run": RUN, "sourceCommit": SOURCE, "sourceTree": TREE, "job": job,
          "attempt": ATTEMPT, "originalJobConclusion": "failure", "artifacts": [],
          "expectedExecutableSha256": ELF_SHA}
for aid, name, size, digest in PINS:
    metadata = api(f"actions/artifacts/{aid}")
    assert not metadata["expired"]
    assert (metadata["name"], metadata["size_in_bytes"], metadata["digest"]) == (name, size, "sha256:" + digest)
    assert metadata["workflow_run"]["id"] == RUN and metadata["workflow_run"]["head_sha"] == SOURCE
    if name != "native-linux-writer-roundtrip":
        assert metadata["created_at"] <= native["started_at"]
    archive = out / f"{aid}.zip"
    with archive.open("xb") as target:
        subprocess.run(["gh", "api", f"repos/{REPO}/actions/artifacts/{aid}/zip"], stdout=target, check=True)
    assert archive.stat().st_size == size and sha(archive) == digest
    (out / f"{aid}.json").write_text(json.dumps(metadata, indent=2) + "\n")
    origin["artifacts"].append({"id": aid, "name": name, "zipSha256": digest, "zipBytes": size})
    with zipfile.ZipFile(archive) as z:
        if name == "open-office-studio-Linux":
            members = [n for n in z.namelist() if n.endswith(".deb")]
            assert len(members) == 1
            dest = package_dir / Path(members[0]).name
        elif name == "pakketcontrole-Linux":
            members = [n for n in z.namelist() if Path(n).name == "pakketcontrole-Linux.json"]
            assert len(members) == 1
            dest = Path(".local/pakketcontrole-Linux.json")
        else:
            members = [n for n in z.namelist() if Path(n).name == "report.json"]
            assert len(members) == 1
            dest = out / "original-failed-report.json"
        with z.open(members[0]) as src, dest.open("xb") as target:
            while chunk := src.read(1024 * 1024):
                target.write(chunk)
    if name == "open-office-studio-Linux":
        assert dest.stat().st_size == 383828606 and sha(dest) == DEB_SHA

report_path = Path(".local/pakketcontrole-Linux.json")
assert sha(report_path) == "52f8d74bd659208ebaf9935537d693569cb15c61196a28ffbdecc358b5603dca"
report = json.loads(report_path.read_text())
assert report["versie"] == "2026.48.1" and report["platform"] == "linux"
assert len([p for p in report["pakketten"] if p["sha256"] == DEB_SHA and p["bytes"] == 383828606]) == 1
original = json.loads((out / "original-failed-report.json").read_text())
assert original["sourceCommit"] == SOURCE and original["sourceTree"] == TREE
assert original["status"] == "failed" and original["checks"] == []
assert original["packagedExecutableSha256"] == ELF_SHA
assert "sudo dpkg --install" in original["error"]
origin["packageReportSha256"] = sha(report_path)
origin["originalFailedReportSha256"] = sha(out / "original-failed-report.json")
Path(".local/native-recheck-origin.json").write_text(json.dumps(origin, indent=2) + "\n")
print(json.dumps({"source": SOURCE, "packageSha256": DEB_SHA, "originalJobConclusion": "failure", "verifiedArtifacts": len(PINS)}))
