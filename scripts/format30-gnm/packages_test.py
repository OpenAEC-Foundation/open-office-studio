"""Canonical source/package dependency gates; unrelated OS/native state stays separate."""
import copy
import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('gnm_packages',Path(__file__).with_name('packages.py'))
packages=importlib.util.module_from_spec(spec);spec.loader.exec_module(packages)

class Gates(unittest.TestCase):
    def setUp(self):
        self.plan=dict(applicationCommit=packages.APP,applicationTree=packages.TREE,desktopRun=packages.RUN,platforms=['Linux'],version='2026.48.1')
        self.run=dict(id=packages.RUN,head_sha=packages.APP,status='in_progress',conclusion=None)
        self.commit=dict(tree={'sha':packages.TREE})
        self.job=dict(id=packages.JOB,run_id=packages.RUN,status='in_progress',conclusion=None,steps=[
            dict(name=name,status='completed',conclusion='success')for name in ('Linux-pakket bouwen','Linux-installers werkelijk uitpakken en controleren')])
        self.artifact=dict(name='open-office-studio-Linux',expired=False,digest='sha256:'+'a'*64,workflow_run={'head_sha':packages.APP})
    def check(self):return packages.metadata(self.plan,self.run,self.commit,self.job,[self.artifact])
    def test_own_valid_packages_do_not_wait_for_other_os(self):self.assertIs(self.check(),self.artifact)
    def test_later_native_writer_failure_is_not_hidden_or_a_converter_dependency(self):
        self.job.update(status='completed',conclusion='failure');self.assertIs(self.check(),self.artifact)
    def test_wrong_application_rejected(self):
        self.run['head_sha']='a'*40
        with self.assertRaises(AssertionError):self.check()
    def test_wrong_tree_rejected(self):
        self.commit['tree']['sha']='b'*40
        with self.assertRaises(AssertionError):self.check()
    def test_unchecked_package_rejected(self):
        self.job['steps'][-1]['status']='in_progress'
        with self.assertRaises(AssertionError):self.check()
    def test_failed_package_build_rejected(self):
        self.job['steps'][0]['conclusion']='failure'
        with self.assertRaises(AssertionError):self.check()
    def test_expired_artifact_rejected(self):
        self.artifact['expired']=True
        with self.assertRaises(AssertionError):self.check()
    def test_wrong_artifact_source_rejected(self):
        self.artifact['workflow_run']['head_sha']='c'*40
        with self.assertRaises(AssertionError):self.check()
    def test_unknown_artifact_hash_rejected(self):
        self.artifact['digest']=None
        with self.assertRaises((AssertionError,TypeError)):self.check()

if __name__=='__main__':unittest.main(verbosity=2)
