"""Meet afzonderlijke topmethoden; zonder productprofiler of extra kernbouw."""
from pathlib import Path
import os
import subprocess
import json
from voorbereiden import bereid, ROOT, REFERENTIE, LOKAAL, sha

bereid()
env = os.environ.copy(); env['PATH'] = str(Path.home()/'.cargo/bin')+':'+str(Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin')+':'+env['PATH']
subprocess.run(['node',str(ROOT/'encoderfasen.mjs')],env=env,check=True)
p = REFERENTIE/'.local/gemeten/vendor/docx-edit/src/deterministic.rs'
s = p.read_text(); anker='#[cfg(test)]\nmod tests {'; assert s.count(anker)==1
s = s.split(anker)[0]
referentie = s+'\npub fn encodeer_proef(v: &yrs::Any) -> Vec<u8> { let mut uit=Vec::new(); encode_any(v, &mut uit); uit }\n'
pad = LOKAAL/'referentie-encoder.rs'
if pad.exists():
    assert pad.read_text() == referentie, 'Bestaande referentie-encoder gewijzigd'
else:
    pad.write_text(referentie)
knip = s.index('#[derive(Default)]\nstruct CountingEncoderV1')
voor, achter = s[:knip], s[knip:]
for naam, inhoud in [('any','        encode_any(any, self);'),('json','        self.write_string(&serde_json::to_string(&json_value(any)).unwrap());')]:
    assert voor.count(inhoud)==1
    voor=voor.replace(inhoud,'        let begin_proef=std::time::Instant::now();\n'+inhoud+'\n        let duur_proef=begin_proef.elapsed().as_nanos() as u64; noteer_proef('+('0'if naam=='any'else'9')+'+soort_proef(any),duur_proef);',1)
s=voor+achter
s+='''
thread_local! {static PROEF: std::cell::RefCell<[[u64;2];18]> = const {std::cell::RefCell::new([[0,0];18])};}
fn soort_proef(a:&Any)->usize {match a {Any::Map(_)=>0,Any::Array(_)=>1,Any::String(_)=>2,Any::Buffer(_)=>3,Any::Number(_)=>4,Any::Bool(_)=>5,Any::Null=>6,Any::Undefined=>7,Any::BigInt(_)=>8}}
fn noteer_proef(n:usize,ns:u64) {PROEF.with(|c| {let mut c=c.borrow_mut();c[n][0]+=1;c[n][1]+=ns;});}
pub fn reset_proef() {PROEF.with(|c| *c.borrow_mut()=[[0,0];18]);}
pub fn lees_proef()->[[u64;2];18] {PROEF.with(|c| *c.borrow())}
'''
(LOKAAL/'fasen-encoder.rs').write_text(s)
deps=LOKAAL/'target/release/deps'
args=['rustc','-O','--edition=2024',str(ROOT/'encoderfasen.rs'),'-L','dependency='+str(deps)]
for naam in ['yrs','serde_json','docx_edit']:
    libs=list(deps.glob('lib'+naam+'*.rlib'));assert len(libs)==1,'Geen unieke bibliotheek: '+naam
    args.extend(['--extern',naam+'='+str(libs[0])])
programma=LOKAAL/'encoderfasen';args.extend(['-o',str(programma)])
with (LOKAAL/'encoderfasen-bouw.log').open('w')as log:
    bouw=subprocess.run(args,env=env,stdout=log,stderr=subprocess.STDOUT)
r={'bouwcode':bouw.returncode,'oorspronkelijke_encoder_sha256':sha(p),'gemeten_encoder_sha256':sha(LOKAAL/'fasen-encoder.rs')}
if bouw.returncode==0:
    with (LOKAAL/'encoderfasen.jsonl').open('w')as log:proef=subprocess.run([str(programma),str(LOKAAL)],stdout=log,stderr=subprocess.STDOUT)
    r.update(exitcode=proef.returncode,programma_sha256=sha(programma))
(LOKAAL/'encoderfasen-uitkomst.json').write_text(json.dumps(r,indent=2)+'\n')
print(json.dumps(r),flush=True)
raise SystemExit(bouw.returncode or r['exitcode'])
