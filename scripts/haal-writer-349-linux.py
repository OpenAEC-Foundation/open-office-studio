"""Verify and stream the fixed combined G Linux package without rebuilding it."""
import hashlib, json, os, shutil, subprocess, zipfile
from pathlib import Path

repo="OpenAEC-Foundation/open-office-studio"
source="9e0ad565402815082e8edf11a4c23943455fb6ce"
run=os.environ["NATIVE_BUILD_RUN"]
assert run.isdecimal() and os.environ["GITHUB_REPOSITORY"]==repo
assert subprocess.check_output(["git","rev-parse","HEAD"],text=True).strip()==source
def api(route): return subprocess.check_output(["gh","api",f"repos/{repo}/{route}"])
metadata=json.loads(api(f"actions/runs/{run}"))
assert metadata["head_sha"]==source and metadata["path"]==".github/workflows/desktop.yml"
artifacts=json.loads(api(f"actions/runs/{run}/artifacts"))["artifacts"]
out=Path(".local/native-recheck-package");out.mkdir(parents=True,exist_ok=True)
origin={"run":int(run),"sourceCommit":source,"artifacts":[]}
expected={"open-office-studio-Linux":(14221851734,"3925b646da482ed8a2a6afd0acac553fb07ec5cd66fb01207b7ac226b21cfed3"),"pakketcontrole-Linux":(14222026568,"330f69a2901bcba683f7379acace587ed26e8573bc3a1beae92ac059f568ff53")}
for name in ["open-office-studio-Linux","pakketcontrole-Linux"]:
    matches=[a for a in artifacts if a["name"]==name and not a["expired"]];assert len(matches)==1
    artifact=matches[0];archive_file=out/f"{artifact['id']}.zip"
    assert artifact['id']==expected[name][0]
    with archive_file.open("wb") as target:
        subprocess.run(["gh","api",f"repos/{repo}/actions/artifacts/{artifact['id']}/zip"],stdout=target,check=True)
    digest=hashlib.sha256()
    with archive_file.open("rb") as stream:
        while chunk:=stream.read(1024*1024): digest.update(chunk)
    sha=digest.hexdigest();assert sha==expected[name][1] and artifact["digest"]=="sha256:"+sha
    origin["artifacts"].append({"id":artifact["id"],"name":name,"zipSha256":sha,"bytes":archive_file.stat().st_size})
    found=0
    with zipfile.ZipFile(archive_file) as archive:
        for member in archive.namelist():
            if name=="open-office-studio-Linux" and member.endswith(".deb"): dest=out/Path(member).name
            elif name=="pakketcontrole-Linux" and Path(member).name=="pakketcontrole-Linux.json": dest=Path(".local/pakketcontrole-Linux.json")
            else: continue
            with archive.open(member) as src, dest.open("wb") as target: shutil.copyfileobj(src,target,length=1024*1024)
            found+=1
    assert found==1
Path(".local/native-recheck-origin.json").write_text(json.dumps(origin,indent=2)+"\n")
print(json.dumps(origin))
