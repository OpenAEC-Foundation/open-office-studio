"""Fresh addon routing and strict reused-evidence boundaries; no native acceptance."""
import copy,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from followup import BASELINE,CORE_FLAGS,validate_followup,matrix,load_baseline,prepare_baseline
from contracts import expected_source_witness,source_witness_record
from test_dual_producer import dual_request
from sheet_formats import readable_grid_zoom,selected_workbook
from native import Unavailable


def request():
    q=dual_request();q.update(executeApps=['spreadsheet'],reuseTransfersFromRun=BASELINE['run'],
        spreadsheetFollowup={'formats':['gnm','gnumeric','xlsb'],'coreBaseline':copy.deepcopy(BASELINE)})
    return q


class FollowupTests(unittest.TestCase):
    def test_three_fresh_format_hosts_never_reexecute_the_other_apps(self):
        q=request();self.assertTrue(validate_followup(q))
        self.assertEqual(matrix(q),{'app':['spreadsheet'],'format':['gnm','gnumeric','xlsb']})
        self.assertEqual(len(q['packages']),6)

    def test_foreign_source_origin_baseline_app_or_duplicate_format_are_rejected(self):
        for section,key,value in [('source','tree','f'*40),('spreadsheetFollowup','formats',['gnm','gnm']),
                ('spreadsheetFollowup','formats',['stw']),('spreadsheetFollowup','formats',[{}]),
                ('spreadsheetFollowup','formats',[])]:
            q=request();q[section][key]=value
            with self.assertRaises(ValueError):validate_followup(q)
        for key,value in [('executeApps',['email']),('reuseTransfersFromRun',42)]:
            q=request();q[key]=value
            with self.assertRaises(ValueError):validate_followup(q)
        q=request();q['spreadsheetFollowup']['coreBaseline']['sha256']='f'*64
        with self.assertRaises(ValueError):validate_followup(q)

    def core(self,q):
        proof={'parentArtifact':copy.deepcopy(q['parentArtifact']),
            'producerWorkflow':copy.deepcopy(q['producerWorkflow']),
            'sourceWitness':source_witness_record(q,json.dumps(expected_source_witness(q)).encode()),
            'package':{'filename':'synthetic.dmg','bytes':123,'sha256':'d'*64}}
        return {'app':'spreadsheet','source':copy.deepcopy(q['source']),
                'provenance':copy.deepcopy(proof),**{k:True for k in CORE_FLAGS}},proof

    def test_changed_baseline_bytes_cannot_be_reused_even_with_good_result_flags(self):
        q=request();core,proof=self.core(q)
        with tempfile.TemporaryDirectory() as t:
            p=Path(t)/'core-baseline.json';p.write_text(json.dumps(core))
            with self.assertRaises(ValueError):load_baseline(q,proof,t)

    def test_baseline_never_invents_original_timeout_cleanup_or_current_host_flags(self):
        q=request();core,proof=self.core(q)
        with tempfile.TemporaryDirectory() as t,patch('followup.digest',return_value=BASELINE['sha256']):
            p=Path(t)/'core-baseline.json';p.write_text(json.dumps(core))
            result=load_baseline(q,proof,t)
            self.assertTrue(result['functionalCorePreviouslyVerified'])
            self.assertFalse(result['originalHostFinalCleanupVerified'])
            self.assertNotIn('cleanupPassed',result);self.assertNotIn('functionalCaseCompleted',result)
            for key in CORE_FLAGS:
                wrong=copy.deepcopy(core);wrong[key]=False;p.write_text(json.dumps(wrong))
                with self.subTest(key=key),self.assertRaises(ValueError):load_baseline(q,proof,t)
            for target,key,value in [('source','tree','f'*40),('provenance','package',{'sha256':'f'*64}),
                    ('provenance','parentArtifact',{})]:
                wrong=copy.deepcopy(core);wrong[target][key]=value;p.write_text(json.dumps(wrong))
                with self.assertRaises(ValueError):load_baseline(q,proof,t)

    def test_wrong_official_baseline_artifact_blocks_before_any_download(self):
        with patch('followup.subprocess.run') as download:
            with self.assertRaises(ValueError):prepare_baseline(request(),Path('unused'),lambda path:{})
            download.assert_not_called()

    def test_current_host_preflight_requires_the_selected_reopened_workbook(self):
        a={'AXRole':'AXRadioButton','AXRoleDescription':'tab','AXSelected':True,
           'AXTitle':'imported-original.xlsx Close imported-original.xlsx',
           'AXHelp':'imported-original.xlsx\nDrag outside for a separate window','frame':{'x':316,'y':196,'width':180,'height':24}}
        snap={'rawNodes':[{'attributes':a}]}
        self.assertEqual(selected_workbook(snap,'imported-original.xlsx'),a)
        with self.assertRaises(Unavailable):selected_workbook(snap,'some-other.xlsx')
        a['AXSelected']=False
        with self.assertRaises(Unavailable):selected_workbook(snap,'imported-original.xlsx')

    def zoom(self,values):
        class Own:
            def __init__(self):self.buttons=[];self.writes=[];self.s=self;self.reads=0
            def snapshot(self):
                value=values[min(self.reads,len(values)-1)];self.reads+=1
                return {'rawNodes':[{'attributes':{'AXRole':'AXButton','AXTitle':f'Zoom {value}%, back to 100%',
                    'frame':{'x':1501,'y':966,'width':45,'height':21}}}]}
            def button(self,name,**kwargs):self.buttons.append((name,kwargs))
            def write(self,*args):self.writes.append(args)
        return Own()

    def test_readability_uses_real_zoom_buttons_with_progress_and_unchanged_ocr_contract(self):
        own=self.zoom(list(range(100,201,10)));readable_grid_zoom(own)
        self.assertEqual(own.buttons,[('Zoom in',{'toolbar':'Zoom'})]*10)
        self.assertEqual(own.writes[0][1]['observedPercentages'][-1],200)

    def test_zoom_stall_or_overshoot_fails_without_input_replay_or_value_setter(self):
        own=self.zoom([100,100])
        with self.assertRaises(Unavailable):readable_grid_zoom(own)
        self.assertEqual(len(own.buttons),1)
        own=self.zoom([250])
        with self.assertRaises(Unavailable):readable_grid_zoom(own)
        self.assertEqual(own.buttons,[])


if __name__=='__main__':unittest.main()
