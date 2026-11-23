import copy
import importlib.util
import io
from pathlib import Path
import stat
import unittest
from unittest.mock import patch
from types import SimpleNamespace
import zipfile

spec = importlib.util.spec_from_file_location('candidate', Path(__file__).with_name('qa-candidate-packages-20261123.py'))
candidate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(candidate)


class Gates(unittest.TestCase):
    def archive(self, entries):
        stream = io.BytesIO()
        with zipfile.ZipFile(stream,'w') as z:
            for name,data in entries:
                if isinstance(name,str):
                    original = name
                    name = zipfile.ZipInfo(original)
                    # Python on Windows normalizes separators in the constructor;
                    # preserve adversarial raw member bytes in this fixture.
                    name.filename = name.orig_filename = original
                z.writestr(name,data)
        stream.seek(0)
        return zipfile.ZipFile(stream)

    def test_canonical_name_collision_is_rejected(self):
        with self.archive([('a/Open Writer.exe',b'a'),('b/Open.Writer.exe',b'b')]) as z:
            with self.assertRaisesRegex(ValueError,'Duplicate'): candidate.archive_members(z)

    def test_traversal_and_windows_separators_are_rejected(self):
        for path in ('../escape','/escape','a\\escape','C:/escape','dir:stream/escape'):
            with self.subTest(path=path), self.archive([(path,b'a')]) as z:
                with self.assertRaisesRegex(ValueError,'Unsafe'): candidate.archive_members(z)

    def test_symlink_is_rejected(self):
        entry = zipfile.ZipInfo('some-link')
        entry.external_attr = (stat.S_IFLNK | 0o777) << 16
        with self.archive([(entry,b'/elsewhere')]) as z:
            with self.assertRaisesRegex(ValueError,'symlinks'): candidate.archive_members(z)

    def test_valid_report_binds_actual_bytes_and_distinct_formats(self):
        studio = {'sleutel':'writer','naam':'Open Writer Studio','programma':'open-writer-studio'}
        name = 'Open.Writer.Studio_2026.48.1_x64-setup.exe'
        report = {'versie':'2026.48.1','programma':studio['programma'],'platform':'windows','pakketten':[{'naam':name,'bytes':12345,'sha256':'a'*64}]}
        actual = {name:{'bytes':12345,'sha256':'a'*64}}
        candidate.validate_report(report,studio,'Windows','2026.48.1',actual)
        wrong = copy.deepcopy(report); wrong['pakketten'][0]['sha256'] = 'b'*64
        with self.assertRaisesRegex(ValueError,'hash/size'): candidate.validate_report(wrong,studio,'Windows','2026.48.1',actual)
        wrong = copy.deepcopy(report); wrong['programma'] = 'open-office-studio'
        with self.assertRaisesRegex(ValueError,'app/version'): candidate.validate_report(wrong,studio,'Windows','2026.48.1',actual)

    def test_linux_duplicate_format_cannot_replace_appimage(self):
        studio = {'sleutel':'writer','naam':'Open Writer Studio','programma':'open-writer-studio'}
        name = 'Open.Writer.Studio_2026.48.1_amd64.deb'
        package = {'naam':name,'bytes':12345,'sha256':'a'*64}
        report = {'versie':'2026.48.1','programma':studio['programma'],'platform':'linux','pakketten':[package,package]}
        with self.assertRaisesRegex(ValueError,'duplicate'): candidate.validate_report(report,studio,'Linux','2026.48.1',{name:package})

    def test_green_unsigned_job_is_not_signing_acceptance(self):
        names = ['Pakket bouwen (Windows, ondertekend)','Authenticode controleren (installer, programma en uninstaller)']
        job = {'name':'Bouwen – Windows','status':'completed','conclusion':'success','steps':[{'name':n,'status':'completed','conclusion':'skipped'} for n in names]}
        with self.assertRaisesRegex(ValueError,'signature gate'): candidate.validate_platform_job(job,'Windows')
        for step in job['steps']: step['conclusion']='success'
        candidate.validate_platform_job(job,'Windows')

    def binding_fixture(self):
        names = ['Pakket bouwen (Windows, ondertekend)','Authenticode controleren (installer, programma en uninstaller)']
        producer = {'id':42,'run_attempt':2,'head_sha':'a'*40}
        job = {'id':43,'run_id':42,'run_attempt':1,'head_sha':'a'*40,'name':'Bouwen – Windows','status':'completed','conclusion':'success','started_at':'2026-11-23T09:00:00Z','completed_at':'2026-11-23T09:02:00Z','steps':[{'name':n,'status':'completed','conclusion':'success','completed_at':'2026-11-23T09:01:00Z'} for n in names]}
        artifact = {'workflow_run':{'id':42,'head_sha':'a'*40},'created_at':'2026-11-23T09:01:30Z'}
        return producer, {'runAttempt':1}, job, artifact

    def test_valid_earlier_platform_attempt_can_be_reused_explicitly(self):
        candidate.validate_artifact_binding(*self.binding_fixture(),'Windows')

    def test_old_artifact_cannot_borrow_newer_green_signing_job(self):
        producer,binding,job,artifact = self.binding_fixture()
        artifact['created_at']='2026-11-23T08:59:59Z'
        with self.assertRaisesRegex(ValueError,'producer job window'):
            candidate.validate_artifact_binding(producer,binding,job,artifact,'Windows')

    def test_artifact_must_follow_signature_gate_in_same_job(self):
        producer,binding,job,artifact = self.binding_fixture()
        artifact['created_at']='2026-11-23T09:00:30Z'
        with self.assertRaisesRegex(ValueError,'predates'):
            candidate.validate_artifact_binding(producer,binding,job,artifact,'Windows')

    def test_job_attempt_and_artifact_parent_are_pinned(self):
        producer,binding,job,artifact = self.binding_fixture()
        job['run_attempt']=2
        with self.assertRaisesRegex(ValueError,'attempt/source'):
            candidate.validate_artifact_binding(producer,binding,job,artifact,'Windows')
        job['run_attempt']=1; artifact['workflow_run']['head_sha']='b'*40
        with self.assertRaisesRegex(ValueError,'Artifact producer/source'):
            candidate.validate_artifact_binding(producer,binding,job,artifact,'Windows')

    def test_cleanup_failure_prevents_a_positive_receipt_after_both_attempts(self):
        results=[SimpleNamespace(returncode=1,stderr=b'synthetic stop failure'),SimpleNamespace(returncode=0,stderr=b'')]
        with patch.object(candidate.subprocess,'run',side_effect=results) as runner:
            with self.assertRaisesRegex(ValueError,'termination could not be confirmed'):
                candidate.stop_gpg_agents((Path('signing'),Path('public-only')))
            self.assertEqual(runner.call_count,2)

    def test_successful_scoped_cleanup_is_recorded(self):
        result=SimpleNamespace(returncode=0,stderr=b'')
        with patch.object(candidate.subprocess,'run',return_value=result):
            outcomes=candidate.stop_gpg_agents((Path('signing'),Path('public-only')))
        self.assertEqual([item['temporaryHomeRole'] for item in outcomes],['signing','public-only'])
        self.assertTrue(all(item['terminationReturnCode']==0 for item in outcomes))


if __name__ == '__main__': unittest.main()
