import copy
import importlib.util
import io
import hashlib
import json
import os
from pathlib import Path
import stat
import unittest
from unittest.mock import patch
from types import SimpleNamespace
import zipfile
import tempfile

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
        names = ['Pakket bouwen (Windows, ondertekend)','Authenticode controleren (installer, programma en uninstaller)', *candidate.RUNTIME_GATES]
        job = {'name':'Bouwen – Windows','status':'completed','conclusion':'success','steps':[{'name':n,'status':'completed','conclusion':'skipped'} for n in names]}
        with self.assertRaisesRegex(ValueError,'signature gate'): candidate.validate_platform_job(job,'Windows')
        for step in job['steps']: step['conclusion']='success'
        candidate.validate_platform_job(job,'Windows')

    def binding_fixture(self):
        names = ['Pakket bouwen (Windows, ondertekend)','Authenticode controleren (installer, programma en uninstaller)', *candidate.RUNTIME_GATES]
        producer = {'id':42,'run_attempt':2,'head_sha':'a'*40}
        job = {'id':43,'run_id':42,'run_attempt':1,'head_sha':'a'*40,'name':'Bouwen – Windows','status':'completed','conclusion':'success','started_at':'2026-11-23T09:00:00Z','completed_at':'2026-11-23T09:02:00Z','steps':[{'name':n,'status':'completed','conclusion':'success','completed_at':'2026-11-23T09:01:00Z'} for n in names]}
        artifact = {'workflow_run':{'id':42,'head_sha':'a'*40},'created_at':'2026-11-23T09:01:30Z'}
        return producer, {'runAttempt':1}, job, artifact

    def test_runtime_gate_failure_or_duplicate_prevents_package_acceptance(self):
        producer,binding,job,artifact = self.binding_fixture()
        for name in candidate.RUNTIME_GATES:
            wrong = copy.deepcopy(job)
            next(s for s in wrong['steps'] if s['name'] == name)['conclusion'] = 'skipped'
            with self.subTest(name=name), self.assertRaises(ValueError):
                candidate.validate_artifact_binding(producer,binding,wrong,artifact,'Windows')
        wrong = copy.deepcopy(job); wrong['steps'].append(copy.deepcopy(wrong['steps'][0]))
        with self.assertRaisesRegex(ValueError,'duplicated'):
            candidate.validate_artifact_binding(producer,binding,wrong,artifact,'Windows')

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


class SeparateMacProducer(unittest.TestCase):
    def setUp(self):
        self.request = dict(source=candidate.P5_SOURCE, tree=candidate.P5_TREE, version='2026.48.1', run=candidate.P5_RUN)
        self.witness = dict(appHead=candidate.P5_SOURCE, appTree=candidate.P5_TREE, appVersion='2026.48.1',
            producerHead=candidate.MAC_HEAD, producerWorkflowHead=candidate.MAC_HEAD, producerRef=candidate.MAC_REF,
            producerWorkflowRef=f'{candidate.REPO}/.github/workflows/release.yml@{candidate.MAC_REF}', event='workflow_dispatch',
            runId=str(candidate.MAC_RUN), attempt='1', job='bouwen',
            checkoutWorkflowSha256='620e90485493163b87163a8763ffbbfcc2f0af5f03251b592af577721c5a9c64',
            publiceren='false', nativeAccepted=False, scope='Build-only producer/source binding; no native operation or publication')
        self.raw = json.dumps(self.witness).encode()
        self.binding = dict(producerRun=candidate.MAC_RUN, producerCommit=candidate.MAC_HEAD, runAttempt=1,
            jobId=candidate.MAC_JOB, sourceWitnessSha256=hashlib.sha256(self.raw).hexdigest())

    def test_legacy_run_declaration_is_unchanged(self):
        self.assertEqual(candidate.producer_spec(dict(run=42,source='a'*40),'macOS',dict(runAttempt=1)),(42,'a'*40,False))

    def test_explicit_original_platforms_and_separate_mac_are_exact(self):
        self.assertEqual(candidate.producer_spec(self.request,'macOS',self.binding),(candidate.MAC_RUN,candidate.MAC_HEAD,True))
        for platform,job in [('Windows',137703365803),('Linux',137703365848)]:
            binding=dict(producerRun=candidate.P5_RUN,producerCommit=candidate.P5_SOURCE,runAttempt=1,jobId=job)
            self.assertEqual(candidate.producer_spec(self.request,platform,binding),(candidate.P5_RUN,candidate.P5_SOURCE,False))

    def test_wrong_producer_run_head_attempt_job_or_missing_frozen_witness_rejected(self):
        for key,value in [('producerRun',candidate.P5_RUN),('producerCommit','a'*40),('runAttempt',2),('jobId',137703365843),('sourceWitnessSha256',None)]:
            with self.subTest(key=key),self.assertRaises(ValueError):
                candidate.producer_spec(self.request,'macOS',{**self.binding,key:value})
        for platform in ('Windows','Linux'):
            with self.assertRaises(ValueError):candidate.producer_spec(self.request,platform,self.binding)

    def test_wrong_application_source_tree_or_version_never_gets_exception(self):
        for key,value in [('source','a'*40),('tree','b'*40),('version','2026.48.2'),('run',42)]:
            with self.subTest(key=key),self.assertRaises(ValueError):
                candidate.producer_spec({**self.request,key:value},'macOS',self.binding)

    def test_producer_origin_requires_exact_head_branch_event_repository(self):
        producer=dict(id=candidate.MAC_RUN,head_sha=candidate.MAC_HEAD,head_repository=dict(full_name=candidate.REPO),
            path='.github/workflows/release.yml',event='workflow_dispatch',head_branch=candidate.MAC_REF.removeprefix('refs/heads/'))
        candidate.validate_producer_origin(producer,candidate.MAC_RUN,candidate.MAC_HEAD,True)
        for key,value in [('id',candidate.P5_RUN),('head_sha',candidate.P5_SOURCE),('head_branch','main'),('event','push'),('path','other.yml'),('head_repository',dict(full_name='other/repo'))]:
            with self.subTest(key=key),self.assertRaises(ValueError):
                candidate.validate_producer_origin({**producer,key:value},candidate.MAC_RUN,candidate.MAC_HEAD,True)

    def test_every_witness_semantic_field_is_checked_even_with_recomputed_digest(self):
        candidate.validate_mac_witness(self.raw,self.binding)
        for key in self.witness:
            wrong={**self.witness,key:True if key=='nativeAccepted' else 'wrong'}
            raw=json.dumps(wrong).encode();binding={**self.binding,'sourceWitnessSha256':hashlib.sha256(raw).hexdigest()}
            with self.subTest(key=key),self.assertRaises(ValueError):candidate.validate_mac_witness(raw,binding)

    def test_witness_byte_mutation_missing_and_wrong_zip_path_rejected(self):
        with self.assertRaises(ValueError):candidate.validate_mac_witness(self.raw+b' ',self.binding)
        for entries in ([],[('other/macos-only-producer-source.json',self.raw)]):
            with Gates().archive(entries) as z,self.assertRaises(ValueError):candidate.read_mac_witness(z,candidate.archive_members(z),self.binding)
        with Gates().archive([(candidate.MAC_WITNESS,self.raw)]) as z:
            self.assertEqual(candidate.read_mac_witness(z,candidate.archive_members(z),self.binding)['witness'],self.witness)

    def test_original_source_witness_and_sign_required_steps_must_be_green(self):
        producer,binding,job,artifact=Gates().binding_fixture()
        job['name']='Bouwen – macOS'
        job['steps']=[dict(name=n,status='completed',conclusion='success',completed_at='2026-11-23T09:01:00Z') for n in (
            'Pakket bouwen (macOS, ondertekend en genotariseerd)','Handtekening en notarisatie controleren (macOS)',candidate.SOURCE_GATE,'Ondertekening beschikbaar',*candidate.RUNTIME_GATES)]
        candidate.validate_artifact_binding(producer,binding,job,artifact,'macOS',(candidate.SOURCE_GATE,'Ondertekening beschikbaar'))
        for index in (2,3):
            wrong=copy.deepcopy(job);wrong['steps'][index]['conclusion']='skipped'
            with self.assertRaises(ValueError):candidate.validate_artifact_binding(producer,binding,wrong,artifact,'macOS',(candidate.SOURCE_GATE,'Ondertekening beschikbaar'))

    def test_original_failed_run_artifact_cannot_borrow_separate_mac_success(self):
        producer,binding,job,artifact=Gates().binding_fixture()
        producer.update(id=candidate.MAC_RUN,head_sha=candidate.MAC_HEAD,run_attempt=1)
        job.update(id=candidate.MAC_JOB,run_id=candidate.MAC_RUN,head_sha=candidate.MAC_HEAD,name='Bouwen – macOS')
        for step,name in zip(job['steps'],('Pakket bouwen (macOS, ondertekend en genotariseerd)','Handtekening en notarisatie controleren (macOS)')):
            step['name']=name
        # It remains an artifact of the original P5 run, even if other fields look green.
        artifact['workflow_run']=dict(id=candidate.P5_RUN,head_sha=candidate.P5_SOURCE)
        with self.assertRaisesRegex(ValueError,'Artifact producer/source'):
            candidate.validate_artifact_binding(producer,binding,job,artifact,'macOS')

    def test_bad_witness_fails_before_any_key_import_and_uses_separate_run(self):
        stream=io.BytesIO()
        with zipfile.ZipFile(stream,'w') as z:z.writestr(candidate.MAC_WITNESS,self.raw+b' mutation')
        archive=stream.getvalue()
        request={**self.request,'frozen':True,'publication':False,'platforms':{}}
        jobs={};producers={};artifacts={}
        for platform,job_id in [('Windows',137703365803),('Linux',137703365848),('macOS',candidate.MAC_JOB)]:
            separate=platform=='macOS';run_id=candidate.MAC_RUN if separate else candidate.P5_RUN;head=candidate.MAC_HEAD if separate else candidate.P5_SOURCE
            b=dict(producerRun=run_id,producerCommit=head,runAttempt=1,jobId=job_id,artifactId=job_id,archiveSha256=hashlib.sha256(archive).hexdigest())
            if separate:b['sourceWitnessSha256']=self.binding['sourceWitnessSha256']
            request['platforms'][platform]=b
            producers[run_id]=dict(id=run_id,head_sha=head,head_repository=dict(full_name=candidate.REPO),path='.github/workflows/release.yml',run_attempt=1,event='workflow_dispatch',head_branch=candidate.MAC_REF.removeprefix('refs/heads/'),conclusion='success' if separate else 'failure')
            names={'Windows':['Pakket bouwen (Windows, ondertekend)','Authenticode controleren (installer, programma en uninstaller)'],'Linux':['Linux-installers werkelijk uitpakken en controleren'],'macOS':['Pakket bouwen (macOS, ondertekend en genotariseerd)','Handtekening en notarisatie controleren (macOS)',candidate.SOURCE_GATE,'Ondertekening beschikbaar']}[platform]
            names += list(candidate.RUNTIME_GATES)
            job=dict(id=job_id,run_id=run_id,run_attempt=1,head_sha=head,name='Bouwen – '+platform,status='completed',conclusion='success',started_at='2026-11-23T09:00:00Z',completed_at='2026-11-23T09:02:00Z',steps=[dict(name=n,status='completed',conclusion='success',completed_at='2026-11-23T09:01:00Z') for n in names])
            jobs.setdefault(run_id,[]).append(job)
            artifacts.setdefault(run_id,[]).append(dict(id=job_id,name='uitgave-'+platform,expired=False,workflow_run=dict(id=run_id,head_sha=head),created_at='2026-11-23T09:01:30Z',digest='sha256:'+b['archiveSha256'],size_in_bytes=len(archive)))
        jobs[candidate.P5_RUN].append(dict(id=137703365843,run_id=candidate.P5_RUN,run_attempt=1,head_sha=candidate.P5_SOURCE,status='completed',conclusion='failure',completed_at='2026-11-23T09:00:00Z',steps=[]))
        def api(route):
            parts=route.split('/');run_id=int(parts[2])
            if not route.endswith(('/jobs?per_page=100','/artifacts?per_page=100')):
                self.assertEqual(parts[3:], ['attempts','1'], 'Producer must use frozen attempt endpoint, never global latest')
            return {'jobs':jobs[run_id]} if route.endswith('/jobs?per_page=100') else {'artifacts':artifacts[run_id]} if route.endswith('/artifacts?per_page=100') else producers[run_id]
        def command(args,**kwargs):
            self.assertEqual(args[0],'gh','No gpg/signing command may run before witness validation')
            self.assertIn(str(candidate.MAC_JOB),args[-1]);kwargs['stdout'].write(archive)
        def git(args,**kwargs):return (candidate.P5_TREE if args[-1]=='HEAD^{tree}' else candidate.P5_SOURCE)+'\n'
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);app=root/'app';app.mkdir();(app/'assets').mkdir();(app/'src-tauri').mkdir()
            (app/'package.json').write_text(json.dumps(dict(version='2026.48.1')))
            (app/'assets/studios.json').write_text(json.dumps([dict(identifier=str(i)) for i in range(7)]))
            (app/'src-tauri/tauri.conf.json').write_text(json.dumps(dict(bundle=dict(createUpdaterArtifacts=False),plugins=dict(updater=dict(pubkey='')))))
            req=root/'request.json';req.write_text(json.dumps(request))
            with patch.object(candidate,'api',side_effect=api),patch.object(candidate.subprocess,'check_output',side_effect=git),patch.object(candidate.subprocess,'run',side_effect=command),patch.dict(os.environ,{'OPENAEC_GPG_PRIVATE_KEY':'synthetic-only'},clear=False),patch.object(candidate.shutil,'disk_usage',return_value=SimpleNamespace(free=10**12)):
                with self.assertRaisesRegex(ValueError,'witness bytes/digest'):candidate.run(req,app,root/'proof')
            self.assertFalse((root/'proof/verification-receipt.json').exists())


if __name__ == '__main__': unittest.main()
