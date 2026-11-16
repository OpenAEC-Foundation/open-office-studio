"""Fetch the #358 DMG, pinned to one source/run/artifact identity; no rebuild."""
import hashlib, json, os, shutil, subprocess, zipfile
from pathlib import Path

repo="OpenAEC-Foundation/open-office-studio"
source=os.environ['APPLICATION_COMMIT']
assert len(source)==40 and all(c in '0123456789abcdef' for c in source)
run=os.environ["NATIVE_BUILD_RUN"]
assert run.isdecimal()
assert os.environ["GITHUB_REPOSITORY"]==repo
assert subprocess.check_output(["git","rev-parse","HEAD"],text=True).strip()==source
def api(route): return subprocess.check_output(["gh","api",f"repos/{repo}/{route}"])
metadata=json.loads(api(f"actions/runs/{run}"))
assert metadata["head_sha"]==source and metadata["path"]==".github/workflows/desktop.yml"
artifacts=json.loads(api(f"actions/runs/{run}/artifacts"))["artifacts"]
out=Path(".local/writer358-macos-package");out.mkdir(parents=True,exist_ok=True)
origin={"applicationCommit":source,"run":run,"artifacts":[]}
expected={"open-office-studio-macOS":(int(os.environ['INSTALLER_ID']),os.environ['INSTALLER_ZIP_SHA256']),"pakketcontrole-macOS":(int(os.environ['CONTROL_ID']),os.environ['CONTROL_ZIP_SHA256'])}
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
dmgs=list(out.glob('*.dmg'));assert len(dmgs)==1
origin['dmg']={'name':dmgs[0].name,'sha256':hashlib.sha256(dmgs[0].read_bytes()).hexdigest(),'bytes':dmgs[0].stat().st_size}
(out/"origin.json").write_text(json.dumps(origin,indent=2)+"\n",encoding='utf-8')
print(json.dumps(origin))
