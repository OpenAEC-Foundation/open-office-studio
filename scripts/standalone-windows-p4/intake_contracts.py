"""Critical immutable input gates; no app, GUI, network or startup-as-pass."""
import copy
from pathlib import Path
import json
import unittest
from intake import APP,TREE,RUN,JOB,WINDOWS_GATES,validate,validate_source,attempt_source

class IntakeContracts(unittest.TestCase):
    def setUp(self):
        self.plan=json.loads(Path('.github/standalone-windows-p4.json').read_bytes())
        self.plan.update(ready=True,officialMetadataGo=True,superseded=False,artifactId=123,archiveSha256='a'*64,archiveBytes=1234)
        self.run=dict(id=RUN,head_sha=APP,run_attempt=1,status='in_progress',conclusion=None,created_at='2026-11-23T12:00:00Z')
        steps=[dict(name=name,status='completed',conclusion='success') for name in WINDOWS_GATES]
        steps.append(dict(name='Pakket bouwen (onondertekend)',status='completed',conclusion='skipped'))
        self.job=dict(id=JOB,run_id=RUN,run_attempt=1,head_sha=APP,status='completed',conclusion='success',started_at='2026-11-23T12:01:00Z',completed_at='2026-11-23T13:01:00Z',steps=steps)
        self.commit=dict(sha=APP,tree=dict(sha=TREE))
        self.artifact=dict(id=123,name='uitgave-Windows',expired=False,digest='sha256:'+'a'*64,size_in_bytes=1234,created_at='2026-11-23T13:00:00Z',updated_at='2026-11-23T13:00:30Z',workflow_run=dict(id=RUN,head_sha=APP))
    def check(self):validate_source(self.plan,self.run,self.job,self.commit,self.artifact)
    def test_unfrozen_preparation_is_not_acceptance(self):
        p=copy.deepcopy(self.plan);p.update(ready=False,officialMetadataGo=False,artifactId=None,archiveSha256=None);validate(p)
        with self.assertRaises(AssertionError):validate_source(p,self.run,self.job,self.commit,self.artifact)
    def test_waits_only_for_own_successful_windows_job(self):self.check()
    def test_wrong_commit_rejected(self):
        self.run['head_sha']='b'*40
        with self.assertRaises(AssertionError):self.check()
    def test_wrong_tree_rejected(self):
        self.commit['tree']['sha']='b'*40
        with self.assertRaises(AssertionError):self.check()
    def test_second_attempt_rejected(self):
        self.run['run_attempt']=2
        with self.assertRaises(AssertionError):self.check()
    def attempt_check(self,latest,original_jobs):
        calls=[]
        responses={f'actions/runs/{RUN}':latest,
                   f'actions/runs/{RUN}/attempts/1':self.run,
                   f'actions/runs/{RUN}/attempts/1/jobs?per_page=100':dict(total_count=len(original_jobs),jobs=original_jobs)}
        def api(endpoint):
            calls.append(endpoint)
            return responses[endpoint]
        run,job,_=attempt_source(self.plan,api)
        self.assertEqual(calls,[f'actions/runs/{RUN}/attempts/1',f'actions/runs/{RUN}/attempts/1/jobs?per_page=100'])
        validate_source(self.plan,run,job,self.commit,self.artifact)
    def test_latest_attempt2_does_not_invalidate_bound_successful_windows_attempt1(self):
        latest={**self.run,'run_attempt':2,'status':'in_progress'}
        self.run.update(status='completed',conclusion='failure') # failed Mac, successful own Windows
        self.attempt_check(latest,[self.job])
    def test_successful_attempt2_cannot_rescue_failed_original_job_with_old_artifact(self):
        latest={**self.run,'run_attempt':2,'status':'completed','conclusion':'success'}
        self.job['conclusion']='failure'
        with self.assertRaises(AssertionError):self.attempt_check(latest,[self.job])
    def test_attempt2_job_cannot_replace_pinned_original_job(self):
        latest={**self.run,'run_attempt':2,'status':'completed','conclusion':'success'}
        replacement={**self.job,'id':JOB+1,'run_attempt':2}
        with self.assertRaises(AssertionError):self.attempt_check(latest,[replacement])
    def test_attempt2_artifact_time_cannot_be_borrowed_by_original_job(self):
        latest={**self.run,'run_attempt':2,'status':'completed','conclusion':'success'}
        self.artifact.update(created_at='2026-11-23T14:00:00Z',updated_at='2026-11-23T14:01:00Z')
        with self.assertRaises(AssertionError):self.attempt_check(latest,[self.job])
    def test_failed_own_job_rejected(self):
        self.job['conclusion']='failure'
        with self.assertRaises(AssertionError):self.check()
    def test_wrong_official_archive_digest_rejected(self):
        self.artifact['digest']='sha256:'+'b'*64
        with self.assertRaises(AssertionError):self.check()
    def test_missing_official_go_rejected(self):
        self.plan['officialMetadataGo']=False
        with self.assertRaises(AssertionError):self.check()
    def test_skipped_runtime_probe_is_not_successful_native_input(self):
        self.job['steps'][4]['conclusion']='skipped'
        with self.assertRaises(AssertionError):self.check()
    def test_wrong_official_archive_size_rejected(self):
        self.artifact['size_in_bytes']+=1
        with self.assertRaises(AssertionError):self.check()
    def test_archive_created_outside_own_job_rejected(self):
        self.artifact['created_at']='2026-11-23T11:59:00Z'
        with self.assertRaises(AssertionError):self.check()
    def test_superseded_candidate_cannot_be_reactivated_by_old_artifact_metadata(self):
        self.plan['superseded']=True
        with self.assertRaises(AssertionError):self.check()
    def test_cancelled_P4_product_bytes_cannot_become_P5(self):
        self.run.update(id=45172070275,head_sha='04fa6cd43b84e3f59fb9d5055bb2d00dde351a47')
        self.job.update(id=137683944804,run_id=45172070275)
        self.commit.update(sha=self.run['head_sha'],tree=dict(sha='94fa38c20b51a73e4912964f37f0e1a659b0fb1b'))
        with self.assertRaises(AssertionError):self.check()

if __name__=='__main__':unittest.main()
