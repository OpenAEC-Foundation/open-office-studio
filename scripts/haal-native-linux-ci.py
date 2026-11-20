"""Fetch the exact checked package of an existing desktop CI run; never rebuild it."""
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import zipfile

repo = "OpenAEC-Foundation/open-office-studio"
assert os.environ["GITHUB_REPOSITORY"] == repo
run = os.environ["NATIVE_BUILD_RUN"]
source = os.environ["NATIVE_APP_COMMIT"]
assert run.isdecimal() and len(source) == 40
assert subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip() == source


def api(route):
    return subprocess.check_output(["gh", "api", f"repos/{repo}/{route}"])


metadata = json.loads(api(f"actions/runs/{run}"))
assert metadata["head_sha"] == source
assert metadata["path"] == ".github/workflows/desktop.yml"
artifacts = json.loads(api(f"actions/runs/{run}/artifacts"))["artifacts"]
out = Path(".local/native-recheck-package")
out.mkdir(parents=True, exist_ok=True)
origin = {"run": int(run), "sourceCommit": source, "artifacts": []}
for name in ["open-office-studio-Linux", "pakketcontrole-Linux"]:
    matches = [a for a in artifacts if a["name"] == name and not a["expired"]]
    assert len(matches) == 1
    artifact = matches[0]
    raw = api(f"actions/artifacts/{artifact['id']}/zip")
    sha = hashlib.sha256(raw).hexdigest()
    assert artifact["digest"] == "sha256:" + sha
    origin["artifacts"].append({"id": artifact["id"], "name": name, "zipSha256": sha})
    found = 0
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        for member in archive.namelist():
            if name == "open-office-studio-Linux" and member.endswith(".deb"):
                dest = out / Path(member).name
            elif name == "pakketcontrole-Linux" and Path(member).name == "pakketcontrole-Linux.json":
                dest = Path(".local/pakketcontrole-Linux.json")
            else:
                continue
            with archive.open(member) as src, dest.open("wb") as target:
                while chunk := src.read(1024 * 1024):
                    target.write(chunk)
            found += 1
    assert found == 1
Path(".local/native-recheck-origin.json").write_text(json.dumps(origin, indent=2) + "\n")
print(json.dumps(origin))
