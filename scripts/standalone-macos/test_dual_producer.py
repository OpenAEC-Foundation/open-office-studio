"""Exact one-off separate producer binding; synthetic archives are not native proof."""
import copy,json,tempfile,unittest,warnings,zipfile
from unittest.mock import patch
from pathlib import Path
from contracts import (APPS,APPROVED_MAC_PRODUCER,P5_APP_SOURCE,SOURCE_WITNESS_STEP,
    MAC_PRODUCER_GATES,digest,validate_request,validate_producer,expected_source_witness,
    source_witness_record,verify_package)
from prepare import extract,verify_frozen_sources
from suite_support_descriptor import descriptor
from test_contracts import producer
from test_suite_support import support_request


def dual_request():
    q=support_request();q['source']=copy.deepcopy(P5_APP_SOURCE)
    q['producerWorkflow']=copy.deepcopy(APPROVED_MAC_PRODUCER)
    q['parentArtifact'].update(run=APPROVED_MAC_PRODUCER['run'],attempt=1,
                              producerJobId=APPROVED_MAC_PRODUCER['job'])
    for package in q['packages'].values():package.update(sha256=None,hashBinding='verified-parent-archive')
    return q


def dual_state(q):
    run,a,j=producer();p=q['producerWorkflow'];parent=q['parentArtifact']
    run.update(id=p['run'],head_sha=p['commit'],head_branch=p['branch'],path=p['path'],event=p['event'])
    a.update(workflow_run={'id':p['run'],'head_sha':p['commit']},digest='sha256:'+parent['sha256'])
    j.update(id=p['job'],run_id=p['run'])
    j['steps'][0]['started_at']='2026-11-23T09:00:00Z'
    j['steps'].append({'name':SOURCE_WITNESS_STEP,'status':'completed','conclusion':'success',
                       'completed_at':'2026-11-23T08:59:00Z'})
    return run,a,j


def archive(root,*,mode='valid',change=None):
    q=dual_request();zpath=root/'parent.zip';witness=expected_source_witness(q)
    if change:change(witness)
    raw=(json.dumps(witness,indent=2)+'\n').encode()
    with zipfile.ZipFile(zpath,'w') as z:
        for key,p in [*q['packages'].items(),('office',q['supportingSuitePackage'])]:
            z.writestr(p['member'],('synthetic '+key).encode())
        member=q['producerWorkflow']['witnessMember']
        if mode!='missing':
            entry=zipfile.ZipInfo(member)
            if mode=='symlink':entry.external_attr=0o120777<<16
            z.writestr(entry,raw if mode!='oversize' else b'x'*16385)
        if mode=='duplicate':
            with warnings.catch_warnings():
                warnings.simplefilter('ignore');z.writestr(member,raw)
    q['parentArtifact']['sha256']=digest(zpath)
    return q,zpath,raw


class DualProducerTests(unittest.TestCase):
    def test_git_api_binds_both_source_trees_and_both_original_workflow_blobs(self):
        import base64,hashlib
        q=dual_request();p=q['producerWorkflow'];raw=b'synthetic workflow'
        # Only mock response bytes/hash here; production still requires the hard-pinned values.
        payload={}
        for binding in (q['source'],p):
            payload['/git/commits/'+binding['commit']]={'sha':binding['commit'],'tree':{'sha':binding['tree']}}
            payload['/contents/'+p['path']+'?ref='+binding['commit']]={
                'path':p['path'],'encoding':'base64','content':base64.b64encode(raw).decode()}
        with patch('prepare.api',side_effect=lambda path:payload[path]):
            with self.assertRaises(ValueError):verify_frozen_sources(q)
        payload['/git/commits/'+p['commit']]['tree']['sha']='f'*40
        with patch('prepare.api',side_effect=lambda path:payload[path]):
            with self.assertRaisesRegex(ValueError,'commit/tree'):verify_frozen_sources(q)

    def test_only_exact_frozen_producer_app_tree_run_job_attempt_are_authorized(self):
        q=dual_request();validate_request(q)
        for section,key,bad in [('producerWorkflow','commit','f'*40),('producerWorkflow','tree','f'*40),
                ('source','commit','f'*40),('source','tree','f'*40),('parentArtifact','run',42),
                ('parentArtifact','attempt',2),('parentArtifact','producerJobId',42)]:
            badq=copy.deepcopy(q);badq[section][key]=bad
            with self.subTest(section=section,key=key),self.assertRaises(ValueError):validate_request(badq)

    def test_exact_dual_source_run_keeps_all_four_gates_and_stale_artifact_rejection(self):
        q=dual_request();r,a,j=dual_state(q);validate_producer(q,r,a,j,[a])
        for key in ('head_sha','head_branch','path','event'):
            bad=copy.deepcopy(r);bad[key]='wrong'
            with self.subTest(key=key),self.assertRaises(ValueError):validate_producer(q,bad,a,j,[a])
        for name in MAC_PRODUCER_GATES+(SOURCE_WITNESS_STEP,):
            bad=copy.deepcopy(j);next(s for s in bad['steps'] if s['name']==name)['conclusion']='skipped'
            with self.subTest(name=name),self.assertRaises(PermissionError):validate_producer(q,r,a,bad,[a])
        with self.assertRaises(ValueError):validate_producer(q,r,{**a,'created_at':'2026-11-23T08:00:00Z'},j,[a])
        with self.assertRaises(ValueError):validate_producer(q,r,a,{**j,'run_attempt':2},[a])

    def test_general_head_mismatch_and_producer_labelled_as_app_remain_forbidden(self):
        q=dual_request();r,a,j=dual_state(q);q.pop('producerWorkflow')
        with self.assertRaises(ValueError):validate_producer(q,r,a,j,[a])
        q['source']['commit']=APPROVED_MAC_PRODUCER['commit']
        with self.assertRaises(ValueError):validate_request(q)

    def test_source_step_must_precede_signed_build(self):
        q=dual_request();r,a,j=dual_state(q)
        j['steps'][-1]['completed_at']='2026-11-23T09:01:00Z'
        with self.assertRaises(ValueError):validate_producer(q,r,a,j,[a])

    def test_original_witness_is_embedded_in_all_seven_proofs_and_separate_suite_descriptor(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);q,z,raw=archive(root);out=root/'split'
            self.assertEqual(extract(q,z,out),{'app':list(APPS)})
            record=source_witness_record(q,raw)
            for app in [*APPS,'suite-support']:
                folder=out/app;proof=json.loads((folder/'provenance.json').read_text())
                self.assertEqual(proof['sourceWitness'],record)
                self.assertEqual(proof['producerWorkflow'],APPROVED_MAC_PRODUCER)
                if app in APPS:verify_package(q,proof,folder,app)
                else:
                    value=descriptor(q,proof,folder,123,'e'*64,456,'f'*40)
                    self.assertEqual(value['sourceWitness'],record)
                    self.assertFalse(value['nativeAccepted'])
            self.assertFalse(any('Office Studio' in p.name for app in APPS for p in (out/app).iterdir()))

    def test_missing_duplicate_symlink_oversize_witness_blocks_before_any_child(self):
        for mode in ('missing','duplicate','symlink','oversize'):
            with self.subTest(mode=mode),tempfile.TemporaryDirectory() as t:
                root=Path(t);q,z,_=archive(root,mode=mode)
                with self.assertRaises(ValueError):extract(q,z,root/'split')
                self.assertFalse((root/'split').exists())

    def test_wrong_original_app_producer_tree_run_attempt_or_workflow_hash_blocks_before_child(self):
        for key in ('appHead','appTree','appVersion','producerHead','producerWorkflowHead','runId',
                    'attempt','checkoutWorkflowSha256','publiceren','nativeAccepted'):
            with self.subTest(key=key),tempfile.TemporaryDirectory() as t:
                root=Path(t);q,z,_=archive(root,change=lambda w:w.update({key:'wrong'}))
                with self.assertRaises(ValueError):extract(q,z,root/'split')
                self.assertFalse((root/'split').exists())

    def test_duplicate_json_fields_or_wrong_scalar_types_are_not_witnesses(self):
        q=dual_request();value=expected_source_witness(q)
        raw=json.dumps(value).encode().replace(b'{',b'{"nativeAccepted": false,',1)
        with self.assertRaises(ValueError):source_witness_record(q,raw)
        value['nativeAccepted']=0
        with self.assertRaises(ValueError):source_witness_record(q,json.dumps(value).encode())

    def test_app_host_rechecks_original_witness_bytes_hash_and_exact_producer(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);q,z,_=archive(root);extract(q,z,root/'split');folder=root/'split/writer'
            proof=json.loads((folder/'provenance.json').read_text())
            for key,bad in [('sha256','f'*64),('rawBase64','e30='),('bytes',0)]:
                changed=copy.deepcopy(proof);changed['sourceWitness'][key]=bad
                with self.subTest(key=key),self.assertRaises(ValueError):verify_package(q,changed,folder,'writer')
            changed=copy.deepcopy(proof);changed.pop('sourceWitness')
            with self.assertRaises(ValueError):verify_package(q,changed,folder,'writer')
            changed=copy.deepcopy(proof);changed['producerWorkflow']['tree']='f'*40
            with self.assertRaises(ValueError):verify_package(q,changed,folder,'writer')


if __name__=='__main__':unittest.main()
