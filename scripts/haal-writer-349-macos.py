"""Fetch and verify the immutable combined G DMG; never rebuild the application."""
import hashlib, json, os, shutil, subprocess, zipfile
from pathlib import Path

repo="OpenAEC-Foundation/open-office-studio"
source="9e0ad565402815082e8edf11a4c23943455fb6ce"
run=os.environ["NATIVE_BUILD_RUN"]
assert run.isdecimal()
assert os.environ["GITHUB_REPOSITORY"]==repo
assert subprocess.check_output(["git","rev-parse","HEAD"],text=True).strip()==source
def api(route): return subprocess.check_output(["gh","api",f"repos/{repo}/{route}"])
metadata=json.loads(api(f"actions/runs/{run}"))
assert metadata["head_sha"]==source and metadata["path"]==".github/workflows/desktop.yml"
artifacts=json.loads(api(f"actions/runs/{run}/artifacts"))["artifacts"]
out=Path(".local/writer349-macos-package");out.mkdir(parents=True,exist_ok=True)
origin={"applicationCommit":source,"run":run,"artifacts":[]}
expected={"open-office-studio-macOS":(14224840906,"857547ea62ea9a5b29e3b07943e4a9f39c8dee52c6b7a2ea485044fd8d53a2d4"),"pakketcontrole-macOS":(14224925527,"7fec1c11df425c75dcb1ac53bf5c243b08ea248c343c562962ca8b03deab26af")}
for name in ["open-office-studio-macOS","pakketcontrole-macOS"]:
    matches=[a for a in artifacts if a["name"]==name and not a["expired"]];assert len(matches)==1
    artifact=matches[0];expected_id=artifact["id"]
    assert expected_id==expected[name][0]
    archive_file=out/f"{expected_id}.zip"
    with archive_file.open("wb") as target:
        subprocess.run(["gh","api",f"repos/{repo}/actions/artifacts/{expected_id}/zip"],stdout=target,check=True)
    digest=hashlib.sha256()
    with archive_file.open("rb") as stream:
        while chunk:=stream.read(1024*1024): digest.update(chunk)
    sha=digest.hexdigest()
    assert sha==expected[name][1] and artifact["digest"]=="sha256:"+sha
    origin["artifacts"].append({"name":name,"id":expected_id,"zipSha256":sha,"bytes":archive_file.stat().st_size})
    found=0
    with zipfile.ZipFile(archive_file) as archive:
        for member in archive.namelist():
            if name=="open-office-studio-macOS" and member.endswith(".dmg"):
                dest=out/Path(member).name
            elif name=="pakketcontrole-macOS" and Path(member).name=="pakketcontrole-macOS.json":
                dest=out/"pakketcontrole-macOS.json"
            else: continue
            with archive.open(member) as src, dest.open("wb") as target:
                shutil.copyfileobj(src,target,length=1024*1024)
            found+=1
    assert found==1
(out/"origin.json").write_text(json.dumps(origin,indent=2)+"\n")
print(json.dumps(origin))
