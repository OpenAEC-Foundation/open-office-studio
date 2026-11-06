"""Eigen appkandidaat, ongewijzigde SDK; eerst negatieve regressie op de oude bron."""
from pathlib import Path
import hashlib,io,json,os,shlex,subprocess,tarfile
REPO=Path(__file__).resolve().parents[3];ROOT=Path(__file__).resolve().parent
UIT=REPO/'.local/doorwerk-2026-11-06/autocorrectie-invoer'
COMMIT='903cdc8d'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    bron=UIT/'bron';assert not bron.exists()
    data=subprocess.run(['git','archive',COMMIT],cwd=REPO,check=True,capture_output=True).stdout
    with tarfile.open(fileobj=io.BytesIO(data))as t:t.extractall(bron,filter='data')
    modules=bron/'node_modules';modules.mkdir()
    for p in (REPO/'node_modules').iterdir():
        if p.name.startswith('.vite')or p.name=='.cache':continue
        (modules/p.name).symlink_to(p.resolve(),target_is_directory=p.is_dir())
    node=Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node'
    env=os.environ.copy();env['PATH']=str(node.parent)+':'+env['PATH']
    test='src/spelling/tekst/invoerrust.test.ts';(bron/test).write_bytes((ROOT/'invoerrust.template.ts').read_bytes())
    with (UIT/'regressie-oud.log').open('w')as log:p=subprocess.run([str(bron/'node_modules/.bin/vitest'),'run',test],cwd=bron,env=env,stdout=log,stderr=subprocess.STDOUT)
    oude_code=p.returncode
    assert oude_code!=0 and 'failed' in (UIT/'regressie-oud.log').read_text()
    (bron/'src/spelling/tekst/sessie.ts').write_bytes((ROOT/'sessie-kandidaat.ts').read_bytes())
    subprocess.run([str(node),'scripts/weekversie.mjs','2026-11-06','52'],cwd=bron,check=True)
    p=bron/'src-tauri/tauri.conf.json';m=json.loads(p.read_text());m['build']['beforeBuildCommand']='python3 '+shlex.quote(str(ROOT/'voorbouw.py'));p.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
    names=[test,'src/spelling/tekst/sessie.ts','package.json','versie.json','src-tauri/tauri.conf.json','src-tauri/Cargo.toml','src-tauri/Cargo.lock','apps/database-studio/src-tauri/tauri.conf.json','apps/database-studio/src-tauri/Cargo.toml','apps/database-studio/src-tauri/Cargo.lock']
    m={'commit':subprocess.check_output(['git','rev-parse',COMMIT],cwd=REPO,text=True).strip(),'bestanden':{n:sha(bron/n)for n in names},'sdk_sha256':sha(bron/'node_modules/@betteroffice/docx-react/dist/index.mjs'),'oude_regressie_code':oude_code}
    (UIT/'bronnen.json').write_text(json.dumps(m,indent=2)+'\n')
    print('Eigen appkandidaat 45.52 voorbereid, oude regressie afgekeurd.')
if __name__=='__main__':main()
