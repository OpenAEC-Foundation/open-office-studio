"""Fetch and verify the immutable F macOS DMG; never rebuild the application."""
import hashlib, io, json, os, subprocess, zipfile
from pathlib import Path

repo="OpenAEC-Foundation/open-office-studio"
source="e1f84f84f4d72e5ce8ab967e376a6f38344edf39"
run="43838167666"
assert os.environ["GITHUB_REPOSITORY"]==repo
assert subprocess.check_output(["git","rev-parse","HEAD"],text=True).strip()==source
def api(route): return subprocess.check_output(["gh","api",f"repos/{repo}/{route}"])
metadata=json.loads(api(f"actions/runs/{run}"))
assert metadata["head_sha"]==source and metadata["path"]==".github/workflows/desktop.yml"
artifacts=json.loads(api(f"actions/runs/{run}/artifacts"))["artifacts"]
out=Path(".local/writer349-macos-package");out.mkdir(parents=True,exist_ok=True)
origin={"applicationCommit":source,"run":run,"artifacts":[]}
for name,expected_id,expected_sha in [
    ("open-office-studio-macOS",14212893733,"3fa471425d94c79866b6de10be775c888e90b1eefbaeb2d34a92ac546b1feee3"),
    ("pakketcontrole-macOS",14213985282,"4e1db49af79b436a606f99c3950be07235ce8ae9de95584654fc3c8ae45c07ad")]:
    matches=[a for a in artifacts if a["name"]==name and not a["expired"]];assert len(matches)==1
    artifact=matches[0];assert artifact["id"]==expected_id
    raw=api(f"actions/artifacts/{expected_id}/zip");sha=hashlib.sha256(raw).hexdigest()
    assert sha==expected_sha and artifact["digest"]=="sha256:"+sha
    origin["artifacts"].append({"name":name,"id":expected_id,"zipSha256":sha,"bytes":len(raw)})
    found=0
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        for member in archive.namelist():
            if name=="open-office-studio-macOS" and member.endswith(".dmg"):
                dest=out/Path(member).name
            elif name=="pakketcontrole-macOS" and Path(member).name=="pakketcontrole-macOS.json":
                dest=out/"pakketcontrole-macOS.json"
            else: continue
            dest.write_bytes(archive.read(member));found+=1
    assert found==1
(out/"origin.json").write_text(json.dumps(origin,indent=2)+"\n")
print(json.dumps(origin))
