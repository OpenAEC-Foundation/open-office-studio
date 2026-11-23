"""A separate Suite transfer must never enter the six standalone execution hosts."""
import copy,json,tempfile,unittest,zipfile
from pathlib import Path
from contracts import APPS,VERSION,SEVEN_SPLIT_SCOPE,digest,validate_request,verify_package,verify_supporting_suite_package
from prepare import extract,rebind_transfer
from suite_support_descriptor import descriptor,verify_child_artifact
from test_contracts import request


def support_request():
    q=request();q['preparationScope']=SEVEN_SPLIT_SCOPE
    q['supportingSuitePackage']={'member':'dist-installers/office/dmg/Open Office Studio_'+VERSION+'_aarch64.dmg',
        'sha256':None,'hashBinding':'verified-parent-archive','purpose':'separate-suite-owner','executionApproved':False}
    return q


def prepare(root):
    q=support_request();archive=root/'parent.zip'
    with zipfile.ZipFile(archive,'w') as z:
        for app in APPS:
            raw=('synthetic '+app).encode();p=root/(app+'.bin');p.write_bytes(raw)
            q['packages'][app]['sha256']=digest(p);z.writestr(q['packages'][app]['member'],raw)
        z.writestr(q['supportingSuitePackage']['member'],b'synthetic Suite, never executed')
    q['parentArtifact']['sha256']=digest(archive);validate_request(q)
    matrix=extract(q,archive,root/'split');folder=root/'split/suite-support'
    proof=json.loads((folder/'provenance.json').read_text())
    return q,folder,proof,matrix


class SuiteSupportTests(unittest.TestCase):
    def test_explicit_seventh_product_is_split_but_never_native_matrix_member(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);q,folder,proof,matrix=prepare(root)
            self.assertEqual(matrix,{'app':list(APPS)});self.assertNotIn('office',matrix['app'])
            self.assertEqual(set(p.name for p in (root/'split').iterdir()),set(APPS)|{'suite-support'})
            self.assertFalse(proof['nativeExecutionApproved']);self.assertFalse(proof['nativeAccepted'])
            self.assertEqual(verify_supporting_suite_package(q,proof,folder).name,Path(proof['member']).name)
            with self.assertRaises(ValueError):verify_package(q,proof,folder,'office')
            for app in APPS:
                self.assertEqual(len(list((root/'split'/app).glob('*.dmg'))),1)
                self.assertFalse(any('Office Studio' in p.name for p in (root/'split'/app).iterdir()))

    def test_suite_support_requires_honest_scope_purpose_and_no_execution_authority(self):
        for key,bad in [('executionApproved',True),('purpose','native-six'),('member','../suite.dmg')]:
            q=support_request();q['supportingSuitePackage'][key]=bad
            with self.subTest(key=key),self.assertRaises(ValueError):validate_request(q)
        q=support_request();q.pop('preparationScope')
        with self.assertRaises(ValueError):validate_request(q)
        q=support_request();q.pop('supportingSuitePackage')
        with self.assertRaises(ValueError):validate_request(q)

    def test_suite_descriptor_binds_parent_dmg_and_official_child_digest_without_native_pass(self):
        with tempfile.TemporaryDirectory() as t:
            q,folder,proof,_=prepare(Path(t))
            value=descriptor(q,proof,folder,123,'sha256:'+'e'*64,456,'f'*40)
            self.assertEqual(value['officialParentArtifact'],q['parentArtifact'])
            self.assertEqual(value['suitePackage']['sha256'],proof['package']['sha256'])
            self.assertEqual(value['suiteTransferArtifact']['sha256'],'e'*64)
            self.assertFalse(value['suiteDeliveryToStandaloneHostsAuthorized'])
            self.assertFalse(value['nativeExecutionPerformed']);self.assertFalse(value['nativeAccepted'])
            self.assertEqual(value['expectedInstalledIdentity']['bundleIdentifier'],'org.openaec.office-studio')

    def test_tampered_suite_dmg_cannot_receive_descriptor(self):
        with tempfile.TemporaryDirectory() as t:
            q,folder,proof,_=prepare(Path(t));next(folder.glob('*.dmg')).write_bytes(b'changed')
            with self.assertRaises(ValueError):descriptor(q,proof,folder,123,'e'*64,456,'f'*40)

    def test_missing_child_digest_or_run_identity_blocks_suite_descriptor(self):
        with tempfile.TemporaryDirectory() as t:
            q,folder,proof,_=prepare(Path(t))
            for child,sha,run,commit in [(0,'e'*64,456,'f'*40),(123,'',456,'f'*40),(123,'e'*64,0,'f'*40),(123,'e'*64,456,'')]:
                with self.assertRaises(ValueError):descriptor(q,proof,folder,child,sha,run,commit)

    def test_official_child_api_digest_source_and_identity_are_independent_gates(self):
        good={'id':123,'name':'standalone-support-suite','expired':False,'digest':'sha256:'+'e'*64,
              'workflow_run':{'id':456,'head_sha':'f'*40}}
        verify_child_artifact(good,123,'e'*64,456,'f'*40)
        for changed in ({**good,'id':124},{**good,'name':'standalone-own-writer'},
                        {**good,'digest':'sha256:'+'d'*64},{**good,'expired':True},
                        {**good,'workflow_run':{'id':457,'head_sha':'f'*40}},
                        {**good,'workflow_run':{'id':456,'head_sha':'a'*40}}):
            with self.assertRaises(ValueError):verify_child_artifact(changed,123,'e'*64,456,'f'*40)

    def test_suite_retry_keeps_package_chain_and_separate_nonexecuting_scope(self):
        with tempfile.TemporaryDirectory() as t:
            q,folder,proof,_=prepare(Path(t));current=copy.deepcopy(q)
            current['reuseTransfersFromRun']=99;current['harnessFiles']={'scripts/standalone-macos/run.py':'f'*64}
            before=digest(next(folder.glob('*.dmg')));rebind_transfer(current,folder,'office',99)
            after=json.loads((folder/'provenance.json').read_text())
            self.assertEqual(before,after['package']['sha256']);self.assertFalse(after['nativeExecutionApproved'])
            self.assertTrue(after['qaRequestRebind']['packageBytesUnchanged'])


if __name__=='__main__':unittest.main()
