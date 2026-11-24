"""Contract/oracle/driver mocks only. No app/build/native/network execution."""
from copy import deepcopy
from pathlib import Path
from datetime import datetime,timezone,timedelta
import json,os,tempfile,unittest,time,zipfile,types
from unittest.mock import patch
import contract as c
from trace_oracle import inspect
from ops import Commands

NOW=datetime(2026,11,24,15,tzinfo=timezone.utc)
H='a'*40;TREE='b'*40;D='c'*64


def approval():
    return {'approved':True,'stage':'build','allowBuild':True,'allowNative':False,'allowPublish':False,'allowMain':False,'allowRetry':False,
     'scopeSha256':c.SCOPE_SHA,'userConsent':'SYNTHETIC UNIT APPROVAL ONLY NOT REAL EXECUTION',
     'nonce':'d'*32,'issuedUTC':(NOW-timedelta(minutes=1)).isoformat(),'expiresUTC':(NOW+timedelta(minutes=60)).isoformat(),
     'producerCommit':H,'producerTree':TREE,'workflowSha256':D,'filesManifestSha256':D,'appCommit':'e'*40,'appTree':'f'*40,'baseCommit':c.BASE,'baseTree':c.BASE_TREE}


def environment():
    return {'GITHUB_ACTIONS':'true','GITHUB_REPOSITORY':c.REPO,'GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_RUN_ATTEMPT':'1',
     'GITHUB_ACTOR':'jungle-diff','GITHUB_REF':'refs/heads/'+c.BRANCH,'GITHUB_SHA':H,'GITHUB_WORKFLOW_SHA':H,
     'GITHUB_WORKFLOW_REF':c.REPO+'/'+c.WORKFLOW+'@refs/heads/'+c.BRANCH}


class ApprovalTests(unittest.TestCase):
    def check(self,a,env=None):
        p={'appCommit':'e'*40,'appTree':'f'*40}
        def git(root,*args):return {'HEAD':H,'HEAD^{tree}':TREE}.get(args[-1],'')
        with patch.object(c,'policy',return_value=p),patch.object(c,'git',side_effect=git),patch.object(c,'digest',return_value=D),patch.object(c,'verify_files'):
            return c.validate_approval(a,'build',Path('/not-executed'),env or environment(),NOW)

    def test_valid_synthetic_contract(self):self.check(approval())
    def test_disabled_template(self):
        with self.assertRaises(ValueError):self.check({'approved':False})
    def test_authority_and_pin_negatives(self):
        cases={'approved':False,'allowNative':True,'allowMain':True,'allowPublish':True,'allowRetry':True,
         'producerCommit':'0'*40,'producerTree':'0'*40,'appCommit':'0'*40,'appTree':'0'*40,'baseCommit':'0'*40,
         'workflowSha256':'0'*64,'scopeSha256':'0'*64,'nonce':'stale','userConsent':''}
        for name,value in cases.items():
            a=approval();a[name]=value
            with self.subTest(name=name),self.assertRaises(ValueError):self.check(a)
    def test_event_branch_actor_attempt_negatives(self):
        for name,value in {'GITHUB_REPOSITORY':'foreign/repo','GITHUB_ACTOR':'other','GITHUB_EVENT_NAME':'push','GITHUB_RUN_ATTEMPT':'2',
         'GITHUB_REF':'refs/heads/main','GITHUB_SHA':'0'*40,'GITHUB_WORKFLOW_SHA':'0'*40,'GITHUB_WORKFLOW_REF':'wrong'}.items():
            env=environment();env[name]=value
            with self.subTest(name=name),self.assertRaises(ValueError):self.check(approval(),env)
    def test_expiry_and_future_issuance(self):
        for issued,expires in [(NOW-timedelta(hours=3),NOW-timedelta(seconds=1)),(NOW+timedelta(seconds=1),NOW+timedelta(hours=1)),(NOW-timedelta(seconds=1),NOW+timedelta(hours=3))]:
            a=approval();a.update(issuedUTC=issued.isoformat(),expiresUTC=expires.isoformat())
            with self.assertRaises(ValueError):self.check(a)


def metadata():
    a=approval();a['package']={'runId':101,'attempt':1,'jobId':201,'artifactId':301,'zipBytes':1000,'zipSha256':D,'buildNonce':'e'*32,'buildRequestSha256':D}
    run={'id':101,'run_attempt':1,'head_sha':H,'head_branch':c.BRANCH,'event':'workflow_dispatch','path':c.WORKFLOW,
      'repository':{'full_name':c.REPO},'head_repository':{'full_name':c.REPO},'actor':{'login':'jungle-diff'},'status':'completed','conclusion':'success'}
    names=['Verify frozen source','Compile default and observer','Build signed research Suite','Verify derived package','Upload DERIVED research package']
    steps=[{'name':name,'status':'completed','conclusion':'success','completed_at':f'2026-11-24T14:{i:02d}:00Z'} for i,name in enumerate(names)]
    jobs=[{'id':201,'run_id':101,'run_attempt':1,'name':'Build derived research Suite','status':'completed','conclusion':'success','steps':steps,'completed_at':'2026-11-24T14:05:00Z'}]
    artifacts=[{'id':301,'name':c.ARTIFACT,'size_in_bytes':1000,'digest':'sha256:'+D,'expired':False,'created_at':'2026-11-24T14:03:10Z',
     'expires_at':'2026-12-08T14:03:10Z','workflow_run':{'id':101,'head_sha':H}}]
    return run,jobs,artifacts,a


class MetadataTests(unittest.TestCase):
    def test_valid_specific_attempt_gates(self):c.validate_package_metadata(*metadata(),now=NOW)
    def test_wrong_run_and_gates(self):
        mutations=[lambda r,j,x,a:r.update(head_sha='0'*40),lambda r,j,x,a:r.update(run_attempt=2),
         lambda r,j,x,a:j[0].update(run_attempt=2),lambda r,j,x,a:j[0]['steps'][2].update(conclusion='failure'),
         lambda r,j,x,a:j[0]['steps'].pop(3),lambda r,j,x,a:j[0].update(id=999),
         lambda r,j,x,a:x.append(deepcopy(x[0])),lambda r,j,x,a:x[0].update(size_in_bytes=999),
         lambda r,j,x,a:x[0].update(digest='sha256:'+'0'*64),lambda r,j,x,a:x[0].update(expired=True),
         lambda r,j,x,a:x[0].update(created_at='2026-11-24T14:02:59Z'),
         lambda r,j,x,a:x[0]['workflow_run'].update(head_sha='0'*40)]
        for i,change in enumerate(mutations):
            r,j,x,a=metadata();change(r,j,x,a)
            with self.subTest(i=i),self.assertRaises(ValueError):c.validate_package_metadata(r,j,x,a,now=NOW)


def ledger():
    rows=[];seq=0
    def add(point,values=None,digest=None,js=False):
        nonlocal seq
        if js:seq+=1
        rows.append({'schema':1,'pid':123,'session':'d'*32,'derived':'P5_OBSERVER_NOT_SIGNED_RELEASE','baseSource':c.BASE,
          'baseVersion':'2026.48.1','nativeSeq':len(rows)+1,'nativeLost':0,'jsSeq':seq if js else 0,
          'point':point,'values':values or [],'sha256':digest})
    add(90);add(91,js=True);add(10,[2,0,0,0,0,0,0,0,0,1],js=True);add(10,[1,1,0,1,0,0,0,0,0,1],js=True)
    for p in (17,20,22,31,32,55,56,57,58,33,35,50,54):add(p,js=True)
    for p,i in ((51,1),(36,2)):add(p,[i,100],js=True);add(p+1,[i,100],D,js=True)
    add(40,js=True);add(60,[3,100],js=True);add(61,[3,100],D,js=True)
    add(63,js=True)
    for p,values,d in ((69,[0],None),(70,[100],D),(72,[1,1,1],None),(74,[],None),(76,[5],None),(71,[5],None)):add(p,values,d)
    for p in (64,41,42,45,27,29):add(p,js=True)
    add(99,[seq,0,0]);rows[-1]['jsSeq']=seq
    return rows


class TraceTests(unittest.TestCase):
    def test_valid_join_is_not_semantic_q_claim(self):
        v=inspect(ledger(),123,'d'*32,D);self.assertTrue(v['complete']);self.assertTrue(v['semanticQRequiresIndependentDocxOracle'])
    def test_missing71_is_inconclusive_not_delivery_failure(self):
        rows=[r for r in ledger() if r['point']!=71]
        for i,r in enumerate(rows,1):r['nativeSeq']=i
        self.assertEqual(inspect(rows,123,'d'*32,D)['status'],'INCONCLUSIVE')
    def test_ownership_loss_multiple_and_byte_join_negatives(self):
        changes=[lambda r:r[0].update(pid=999),lambda r:r[0].update(nativeLost=1),lambda r:r[-1].update(values=[1,1,0]),
          lambda r:next(x for x in r if x['point']==72).update(values=[0,1,1]),
          lambda r:next(x for x in r if x['point']==70).update(sha256='0'*64),
          lambda r:next(x for x in r if x['point']==37).update(values=[999,100]),
          lambda r:next(x for x in r if x['point']==20).update(jsSeq=999),
          lambda r:r.insert(2,dict(r[0],point=69))]
        for i,f in enumerate(changes):
            rows=ledger();f(rows)
            with self.subTest(i=i):self.assertFalse(inspect(rows,123,'d'*32,D)['complete'])


class SafetyTests(unittest.TestCase):
    def test_exact_one_q_one_save_and_no_quit_replay(self):
        import native
        with tempfile.TemporaryDirectory() as td:
            n=native.Native.__new__(native.Native)
            n.out=Path(td);n.checkout=Path(td);n.identity_path=Path(td)/'identity.json';n.process=types.SimpleNamespace(pid=123)
            n.counter=n.q=n.s=n.quit_count=0;n.quit_pids=set();n.deadline=time.monotonic()+60
            n.budget=lambda:None;n.owned=lambda:True
            calls=[]
            def command(args,**kwargs):
                calls.append(args);Path(args[5]).write_text(json.dumps({'native':{'status':'input-sent'}}));return {},b'',b''
            n.commands=types.SimpleNamespace(run=command)
            n.action('type-test-character','Q')
            with self.assertRaises(ValueError):n.action('type-test-character','Q')
            n.action('chord','cmd-s')
            with self.assertRaises(ValueError):n.action('chord','cmd-s')
            with self.assertRaises(ValueError):n.action('chord','cmd-z')
            n.action('chord','cmd-q')
            with self.assertRaises(ValueError):n.action('chord','cmd-q')
            self.assertEqual(len(calls),3)
    def test_inner_witness_checked_before_member_emission(self):
        p=c.policy();a=approval();a['package']={'runId':101,'buildNonce':'e'*32,'buildRequestSha256':D}
        witness={k:a[k] for k in ('producerCommit','producerTree','workflowSha256','filesManifestSha256')}
        witness.update(appCommit=p['appCommit'],appTree=p['appTree'],baseCommit=c.BASE,baseTree=c.BASE_TREE,
            patchSha256=p['patchSha256'],overlaySha256=p['overlaySha256'],runId=101,attempt=1,job='build',derived=True,
            nonce='e'*32,requestSha256=D,identifier=c.QA_ID,version=c.QA_VERSION,nativeAccepted=False,
            dmgSha256=c.sha(b'SYNTHETIC NOT A DMG'),dmgBytes=19)
        for wrong in (None,'producerCommit','appTree','nonce','overlaySha256','requestSha256'):
            with self.subTest(wrong=wrong),tempfile.TemporaryDirectory() as td:
                w=deepcopy(witness)
                if wrong:w[wrong]='0'*40
                archive=Path(td)/'fake.zip'
                with zipfile.ZipFile(archive,'w') as z:
                    z.writestr('witness.json',json.dumps(w));z.writestr('research.dmg',b'SYNTHETIC NOT A DMG')
                a['package'].update(zipBytes=archive.stat().st_size,zipSha256=c.digest(archive))
                dest=Path(td)/'out'
                if wrong:
                    with self.assertRaises(ValueError):c.extract_package(archive,dest,a)
                    self.assertFalse((dest/'research.dmg').exists())
                else:c.extract_package(archive,dest,a)
    def test_owned_path_escape_and_root_refused(self):
        with tempfile.TemporaryDirectory() as td:
            for path in (Path(td),Path(td).parent/'foreign'):
                with self.assertRaises(ValueError):c.under(path,td)
    def test_command_receipts_do_not_retain_synthetic_secret(self):
        import sys
        with tempfile.TemporaryDirectory() as td:
            commands=Commands(Path(td)/'logs');env=dict(os.environ,APPLE_API_KEY_CONTENT='SYNTHETIC_SECRET_NEVER_RETAIN')
            row,out,err=commands.run([sys.executable,'-c','import os;print(os.environ["APPLE_API_KEY_CONTENT"])'],env=env)
            self.assertNotIn(b'SYNTHETIC_SECRET_NEVER_RETAIN',out)
            self.assertIn('APPLE_API_KEY_CONTENT',row['secretFieldsRedacted'])
    def test_manual_workflow_has_no_write_trigger_or_native_after_build(self):
        root=c.HERE.parents[2];workflow=(root/c.WORKFLOW).read_text(encoding='utf-8')
        self.assertIn('options: [disabled, build, native]',workflow)
        for forbidden in ('  push:','  pull_request:','  workflow_run:','contents: write','actions: write','gh release','gh api','git push'):
            self.assertNotIn(forbidden,workflow)
        self.assertIn("if: inputs.stage == 'native'",workflow);self.assertEqual(workflow.count('needs: gate'),2)
        self.assertIn('timeout-minutes: 20',workflow);self.assertIn('timeout-minutes: 90',workflow)


if __name__=='__main__':unittest.main()
