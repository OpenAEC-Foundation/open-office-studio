"""Frozen DERIVED P5 experiment contracts. Import is read-only; no dispatch API."""
from pathlib import Path, PurePosixPath
from datetime import datetime, timezone
import hashlib, json, os, re, stat, subprocess, urllib.request, urllib.error, zipfile, time

HERE = Path(__file__).resolve().parent
REPO = "OpenAEC-Foundation/open-office-studio"
BASE = "b696ab86bd1c128729a079b68c0082e6df3d36a5"
BASE_TREE = "e30879fd772871e690847c061ef66e6b81808a05"
QA_ID = "org.openaec.office-studio.qa-save-trace"
QA_VERSION = "2026.48.101"
BRANCH = "codex/mac-save-trace-producer-20261124"
WORKFLOW = ".github/workflows/release.yml"
ARTIFACT = "derived-mac-save-trace-package"
SCOPE_SHA = "c55ef02d5a67002b28eb68849516f68f8f0c58fb2fcb9aaa0755d41b48400c54"
FIXTURE = "c28b963a6094108cdf6cc412bca58302e731a7810ee81772831a0c621748e52d"


def require(ok, message):
    if not ok: raise ValueError(message)


def sha(data): return hashlib.sha256(data).hexdigest()
def digest(path):
    h=hashlib.sha256()
    with Path(path).open("rb") as f:
        for b in iter(lambda:f.read(1024*1024),b""): h.update(b)
    return h.hexdigest()


def write_json(path, value):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    with path.open("xb") as f: f.write((json.dumps(value,ensure_ascii=False,indent=2)+"\n").encode())


def utc(value):
    require(isinstance(value,str),"Missing UTC timestamp")
    parsed=datetime.fromisoformat(value.replace("Z","+00:00"))
    require(parsed.utcoffset() is not None,"Timezone required")
    return parsed.astimezone(timezone.utc)


def git(root,*args):
    return subprocess.check_output(["git","-C",str(root),*args],text=True).strip()


def under(path, root):
    resolved=Path(path).resolve();base=Path(root).resolve()
    require(resolved!=base and resolved.is_relative_to(base),"Path escaped own root")
    return resolved


def policy(): return json.loads((HERE/"source-policy.json").read_bytes())


def verify_files(root, manifest_sha):
    raw=(HERE/"files.json").read_bytes()
    require(sha(raw)==manifest_sha,"Execution file manifest hash differs")
    data=json.loads(raw)
    for name, expected in data.items():
        path=under(Path(root)/name,root)
        require(path.is_file() and not path.is_symlink() and digest(path)==expected,"Execution file changed: "+name)
    require(WORKFLOW in data,"Workflow absent from reviewed file manifest")
    return data


def validate_approval(a, stage, root, env, now=None):
    now=now or datetime.now(timezone.utc);p=policy()
    allowed={'approved','stage','allowBuild','allowNative','allowPublish','allowMain','allowRetry','scopeSha256','userConsent','nonce','issuedUTC','expiresUTC',
        'producerCommit','producerTree','workflowSha256','filesManifestSha256','appCommit','appTree','baseCommit','baseTree','package'}
    require(isinstance(a,dict) and not set(a)-allowed,'Unknown approval field')
    require(stage in ("build","native") and a.get("stage")==stage,"Disabled or wrong stage")
    require(a.get("approved") is True and a.get("scopeSha256")==SCOPE_SHA,"Explicit frozen user scope approval required")
    require(a.get("allowBuild") is (stage=="build") and a.get("allowNative") is (stage=="native"),"One stage only")
    require(a.get("allowPublish") is False and a.get("allowMain") is False and a.get("allowRetry") is False,"Forbidden authority")
    require(a.get('package') is None if stage=='build' else isinstance(a.get('package'),dict),'Stage-specific actual package required')
    require(isinstance(a.get("userConsent"),str) and len(a["userConsent"].strip())>=20,"Retained literal user consent required")
    require(re.fullmatch(r"[a-f0-9]{32}",a.get("nonce","")) is not None,"Fresh nonce required")
    issued=utc(a.get("issuedUTC"));expires=utc(a.get("expiresUTC"))
    require(issued<=now<expires and 0<(expires-issued).total_seconds()<=7200,"Approval expired or excessive lifetime")
    require(env.get("GITHUB_ACTIONS")=="true" and env.get("GITHUB_REPOSITORY")==REPO,"Own GitHub CI only")
    require(env.get("GITHUB_EVENT_NAME")=="workflow_dispatch" and env.get("GITHUB_RUN_ATTEMPT")=="1","Dispatch attempt1 only")
    require(env.get("GITHUB_ACTOR")=="jungle-diff","Only the assigned integration account may dispatch")
    require(env.get("GITHUB_REF")=="refs/heads/"+BRANCH,"Frozen research producer ref only")
    require(env.get("GITHUB_WORKFLOW_REF")==REPO+"/"+WORKFLOW+"@refs/heads/"+BRANCH,"Wrong workflow path/ref")
    require(re.fullmatch(r"[a-f0-9]{40}",a.get("producerCommit","")) is not None,"Producer pin required")
    require(git(root,"rev-parse","HEAD")==a["producerCommit"]==env.get("GITHUB_SHA"),"Producer commit differs")
    require(git(root,"rev-parse","HEAD^{tree}")==a.get("producerTree"),"Producer tree differs")
    require(not git(root,"status","--porcelain","--untracked-files=no"),"Dirty producer checkout")
    require(digest(Path(root)/WORKFLOW)==a.get("workflowSha256"),"Workflow hash differs")
    if env.get("GITHUB_WORKFLOW_SHA"):
        require(env["GITHUB_WORKFLOW_SHA"]==a["producerCommit"],"Workflow definition commit differs")
    require(a.get("appCommit")==p["appCommit"] and a.get("appTree")==p["appTree"],"Derived app pin differs")
    require(a.get("baseCommit")==BASE and a.get("baseTree")==BASE_TREE,"Not exact P5 lineage")
    verify_files(root,a.get("filesManifestSha256"))
    return p


def validate_source(app, p):
    require(git(app,"rev-parse","HEAD")==p["appCommit"] and git(app,"rev-parse","HEAD^{tree}")==p["appTree"],"Wrong research source")
    require(not git(app,"status","--porcelain","--untracked-files=no"),"Dirty research source")
    require(git(app,"rev-parse",BASE+"^{tree}")==BASE_TREE,"Wrong P5 base")
    require(subprocess.run(["git","-C",str(app),"merge-base","--is-ancestor",BASE,p["appCommit"]],capture_output=True).returncode==0,"P5 ancestry missing")
    names=set(git(app,"diff","--name-only",BASE,p["appCommit"]).splitlines())
    require(names==set(p["derivedFiles"]),"Unexpected research source delta")
    for name, expected in p["derivedFiles"].items(): require(digest(Path(app)/name)==expected,"Derived bytes differ: "+name)


def api(path,token):
    require(path.startswith("repos/"+REPO+"/actions/"),"Only own read-only Actions endpoints")
    request=urllib.request.Request("https://api.github.com/"+path,headers={"Authorization":"Bearer "+token,
        "Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2026-03-10"})
    with urllib.request.urlopen(request,timeout=40) as response: return json.load(response)


def validate_run(run, a, run_id):
    require(run.get("id")==run_id and run.get("run_attempt")==1,"Wrong run/attempt")
    require(run.get("head_sha")==a["producerCommit"] and run.get("head_branch")==BRANCH,"Wrong producer source")
    require(run.get("event")=="workflow_dispatch" and run.get("path")==WORKFLOW,"Wrong producer event/workflow")
    require(run.get("repository",{}).get("full_name")==REPO and run.get("head_repository",{}).get("full_name")==REPO,"Foreign repository")
    require(run.get("actor",{}).get("login")=="jungle-diff","Foreign dispatcher")


def validate_package_metadata(run, jobs, artifacts, a, now=None):
    now=now or datetime.now(timezone.utc);b=a["package"]
    require(set(b)=={'runId','attempt','jobId','artifactId','zipBytes','zipSha256','buildNonce','buildRequestSha256'},'Exact original build/package contract required')
    require(re.fullmatch(r'[a-f0-9]{32}',b.get('buildNonce','')) is not None and re.fullmatch(r'[a-f0-9]{64}',b.get('buildRequestSha256','')) is not None,'Actual build request binding required')
    require(type(b.get("runId")) is int and b["runId"]>0 and b.get("attempt")==1,"Actual build run required")
    validate_run(run,a,b["runId"])
    require(run.get("status")=="completed" and run.get("conclusion")=="success","Build run not successful")
    matches=[j for j in jobs if j.get("id")==b.get("jobId") and j.get("name")=="Build derived research Suite"]
    require(len(matches)==1,"Unique own build job required");job=matches[0]
    require(job.get("run_id")==b["runId"] and job.get("run_attempt")==1 and job.get("status")=="completed" and job.get("conclusion")=="success","Wrong/failed build job")
    require('head_sha' not in job or job['head_sha']==a['producerCommit'],'Wrong job source')
    gates=[]
    for name in ("Verify frozen source","Compile default and observer","Build signed research Suite","Verify derived package","Upload DERIVED research package"):
        steps=[s for s in job.get("steps",[]) if s.get("name")==name]
        require(len(steps)==1 and steps[0].get("status")=="completed" and steps[0].get("conclusion")=="success","Missing successful gate: "+name)
        gates.append(steps[0])
    matches=[x for x in artifacts if x.get("name")==ARTIFACT]
    require(len(matches)==1,"Missing/duplicate official package artifact");artifact=matches[0]
    require(artifact.get("id")==b.get("artifactId") and artifact.get("size_in_bytes")==b.get("zipBytes"),"Artifact ID/size differs")
    require(artifact.get("digest")=="sha256:"+b.get("zipSha256","") and re.fullmatch(r"[a-f0-9]{64}",b.get("zipSha256","")) is not None,"Artifact digest differs")
    require(artifact.get("expired") is False and utc(artifact["expires_at"])>now,"Artifact expired")
    created=utc(artifact["created_at"])
    require(created>=max(utc(g["completed_at"]) for g in gates[:-1]),"Artifact predates package gates")
    require(created<=utc(gates[-1]["completed_at"])<=utc(job["completed_at"]),"Artifact upload/job time differs")
    require(artifact.get("workflow_run",{}).get("id")==b["runId"] and artifact["workflow_run"].get("head_sha")==a["producerCommit"],"Artifact source differs")
    return {"run":run,"job":job,"artifact":artifact,"attempt":1}


def download_package(a, token, target):
    b=a["package"];base="repos/"+REPO+"/actions/runs/"+str(b["runId"])
    run=api(base+"/attempts/1",token)
    jobs=api(base+"/attempts/1/jobs?per_page=100",token)
    artifacts=api(base+"/artifacts?per_page=100",token)
    require(jobs["total_count"]<=100 and artifacts["total_count"]<=100,"Ambiguous paginated provenance")
    metadata=validate_package_metadata(run,jobs["jobs"],artifacts["artifacts"],a)
    request=urllib.request.Request("https://api.github.com/repos/"+REPO+"/actions/artifacts/"+str(b["artifactId"])+"/zip",
        headers={"Authorization":"Bearer "+token,"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2026-03-10"})
    # urllib strips sensitive headers neither generally nor on redirects: use gh
    # for the authenticated redirect response, then a separate header-free GET.
    opener=urllib.request.build_opener(NoRedirect)
    try: opener.open(request,timeout=40);raise ValueError("Expected Actions302 archive redirect")
    except urllib.error.HTTPError as error:
        require(error.code==302,"Actions archive did not redirect")
        location=error.headers.get("Location","")
    require(location.startswith("https://") and "/" in location[8:] and "@" not in location.split("/",3)[2],"Unsafe archive redirect")
    count=0
    with urllib.request.urlopen(urllib.request.Request(location),timeout=120) as response,Path(target).open("xb") as output:
        for block in iter(lambda:response.read(1024*1024),b""):
            require(time.time()<float(os.environ.get('OOS_WORK_UNTIL','inf')),'Own download budget exhausted')
            count+=len(block);require(count<=b["zipBytes"],"Artifact exceeds official size");output.write(block)
    require(count==b["zipBytes"] and digest(target)==b["zipSha256"],"Whole artifact ZIP hash/size differs")
    return metadata


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args): return None


def extract_package(path,out,a):
    require(Path(path).stat().st_size==a['package']['zipBytes'] and digest(path)==a['package']['zipSha256'],'Parent ZIP must be authenticated before any member emission')
    out=Path(out);out.mkdir(exist_ok=False)
    with zipfile.ZipFile(path) as z:
        rows=z.infolist();names=[r.filename for r in rows]
        require(len(names)==len(set(names))==2 and set(names)=={"research.dmg","witness.json"},"Exactly DMG+witness required")
        require(all(not r.is_dir() and stat.S_IFMT(r.external_attr>>16) not in (stat.S_IFLNK,) and r.file_size<3*1024**3 for r in rows),"Unsafe ZIP member")
        require(z.getinfo('witness.json').file_size<8*1024*1024,'Witness exceeds bounded metadata size')
        raw=z.read("witness.json");w=json.loads(raw);p=policy()
        require(w["appCommit"]==p["appCommit"] and w["appTree"]==p["appTree"] and w["baseCommit"]==BASE and w["baseTree"]==BASE_TREE,"Wrong app witness")
        for key in ("producerCommit","producerTree","workflowSha256","filesManifestSha256"):
            require(w[key]==a[key],"Wrong producer witness: "+key)
        require(w["runId"]==a["package"]["runId"] and w["attempt"]==1 and w["job"]=="build" and w["derived"] is True,"Wrong run/job/derived witness")
        require(w['patchSha256']==p['patchSha256'] and w['overlaySha256']==p['overlaySha256'],'Wrong patch/identity-overlay witness')
        require(w['nonce']==a['package']['buildNonce'] and w['requestSha256']==a['package']['buildRequestSha256'],'Wrong original live build approval witness')
        require(w["identifier"]==QA_ID and w["version"]==QA_VERSION and w["nativeAccepted"] is False,"Wrong package identity")
        for name in names:
            with z.open(name) as src,(out/name).open("xb") as dst:
                import shutil;shutil.copyfileobj(src,dst)
        require(digest(out/"research.dmg")==w["dmgSha256"] and (out/"research.dmg").stat().st_size==w["dmgBytes"],"Inner DMG differs")
    return w
