"""Only authentic late-visibility evidence can enter the read-only completion route."""
import copy,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from readback import READBACK,verify_policy,selected_a15,prepare_readback,load_readback
from followup import validate_followup,matrix
from test_followup import request


def readback_request():
    q=request();q['reuseTransfersFromRun']=READBACK['run']
    q['spreadsheetFollowup'].update(formats=['xlsb'],readback=copy.deepcopy(READBACK))
    return q


class ReadbackTests(unittest.TestCase):
    def test_only_exact_saved_output_source_proof_routes_one_xlsb_readback_host(self):
        q=readback_request();self.assertTrue(validate_followup(q))
        self.assertEqual(matrix(q),{'app':['spreadsheet'],'format':['xlsb']})
        for target,key,value in [('request','reuseTransfersFromRun',45351696628),
                ('route','formats',['gnm']),('proof','archiveSHA256','f'*64)]:
            wrong=copy.deepcopy(q);obj=wrong if target=='request' else wrong['spreadsheetFollowup']
            if target=='proof':obj=obj['readback']
            obj[key]=value
            with self.assertRaises(ValueError):validate_followup(wrong)

    def policy(self):
        source={'sha256':READBACK['members']['shared_formula.xlsb']['sha256'],'bytes':7651,'mtimeNs':123}
        before={'AXTitle':'shared_formula.xlsx, unsaved changes','AXSelected':True}
        route={'sourceBytesUnchanged':True,'unsavedWorkingCopyPreserved':True,
            'sourceFingerprintAfterCancel':source,'afterWorkingCopy':before,
            'proposal':{'selectedFormat':{'AXValue':1},'filename':{'AXTitle':'File name .xlsx','AXValue':'shared_formula'}}}
        return {'status':'functional-evidence-collected-review-pending','sourceFingerprint':source,
            'beforeWorkingCopy':before,'routes':{'command-s':copy.deepcopy(route),'ordinary-save':copy.deepcopy(route)}}

    def test_original_policy_needs_both_real_routes_and_identical_cancel_fingerprints(self):
        p=self.policy();verify_policy(p)
        for route in ('command-s','ordinary-save'):
            for key,bad in [('sourceBytesUnchanged',False),('unsavedWorkingCopyPreserved',False),
                            ('sourceFingerprintAfterCancel',{}),('afterWorkingCopy',{})]:
                wrong=copy.deepcopy(p);wrong['routes'][route][key]=bad
                with self.assertRaises(ValueError):verify_policy(wrong)
        p['routes'].pop('ordinary-save')
        with self.assertRaises(ValueError):verify_policy(p)

    def snapshot(self):
        return {'focused':{'AXRole':'AXCell','AXSelected':True,'AXFocused':True,'AXDescription':'A15, 42, selected',
            'frame':{'x':278,'y':540,'width':64,'height':20}},'rawNodes':[{'attributes':{
                'AXRole':'AXTextField','AXDescription':'Enter a value or formula','AXValue':'=40+2',
                'frame':{'x':407,'y':238,'width':1200,'height':26}}}]}

    def test_readback_requires_real_selected_a15_and_the_visible_matching_formula(self):
        good=self.snapshot();self.assertTrue(selected_a15(good))
        for change in ({'AXDescription':'A14, 42, selected'},{'AXSelected':False},{'AXFocused':False},{'frame':None}):
            wrong=copy.deepcopy(good);wrong['focused'].update(change);self.assertFalse(selected_a15(wrong))
        for change in ({'AXValue':'=1+2'},{'frame':None}):
            wrong=copy.deepcopy(good);wrong['rawNodes'][0]['attributes'].update(change);self.assertFalse(selected_a15(wrong))

    def test_wrong_original_artifact_blocks_before_any_download(self):
        with patch('readback.subprocess.run') as download:
            with self.assertRaises(ValueError):prepare_readback(readback_request(),Path('unused'),lambda path:{})
            download.assert_not_called()

    def test_absent_or_changed_saved_member_never_reaches_native_input(self):
        with tempfile.TemporaryDirectory() as t:
            folder=Path(t)/'readback';folder.mkdir();(folder/'edited-native.xlsx').write_bytes(b'not the verified output')
            with self.assertRaises(ValueError):load_readback(readback_request(),{},t)


if __name__=='__main__':unittest.main()
