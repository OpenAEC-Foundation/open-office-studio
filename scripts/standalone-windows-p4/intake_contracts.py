"""Critical immutable input gates; no app, GUI, network or startup-as-pass."""
import copy
from pathlib import Path
import json
import unittest
from intake import APP,TREE,RUN,JOB,validate,validate_source

class IntakeContracts(unittest.TestCase):
    def setUp(self):
        self.plan=json.loads(Path('.github/standalone-windows-p4.json').read_bytes())
        self.plan.update(ready=True,officialMetadataGo=True,superseded=False,artifactId=123,archiveSha256='a'*64)
        self.run=dict(id=RUN,head_sha=APP,run_attempt=1,status='in_progress',conclusion=None)
        self.job=dict(id=JOB,run_id=RUN,run_attempt=1,status='completed',conclusion='success')
        self.commit=dict(sha=APP,tree=dict(sha=TREE))
        self.artifact=dict(id=123,name='uitgave-Windows',expired=False,digest='sha256:'+'a'*64,workflow_run=dict(id=RUN,head_sha=APP))
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
    def test_failed_own_job_rejected(self):
        self.job['conclusion']='failure'
        with self.assertRaises(AssertionError):self.check()
    def test_wrong_official_archive_digest_rejected(self):
        self.artifact['digest']='sha256:'+'b'*64
        with self.assertRaises(AssertionError):self.check()
    def test_missing_official_go_rejected(self):
        self.plan['officialMetadataGo']=False
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
