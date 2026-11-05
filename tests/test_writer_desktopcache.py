"""De desktopproef bewaart bestaande bronnen en verdraagt eindigende meetprocessen."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]/'native/onderzoek/writer-desktopcache'
def laad(naam,pad):
    spec=importlib.util.spec_from_file_location(naam,pad);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
m=laad('desktopcachevoorbereiding',ROOT/'voorbereiden.py')
with patch.dict(sys.modules,{'voorbereiden':m}):g=laad('desktopcachegui',ROOT/'fysiek.py')

class WriterDesktopCache(unittest.TestCase):
    def test_bestaande_kandidaat_wordt_nooit_overschreven(self):
        with tempfile.TemporaryDirectory()as tmp:
            r=Path(tmp);l=r/'.local';bron=l/'bron';bron.mkdir(parents=True)
            p=bron/'eigen.rs';p.write_text('behouden bron');(r/'bron.json').write_text('{}')
            (l/'bronnen.json').write_text(json.dumps({'gewijzigd':{'eigen.rs':m.sha(p)}}))
            with patch.object(m,'ROOT',r),patch.object(m,'LOKAAL',l):
                m.bereid();p.write_text('andere behouden bron')
                with self.assertRaisesRegex(RuntimeError,'Bestaande kandidaat gewijzigd'):m.bereid()
                self.assertEqual(p.read_text(),'andere behouden bron')
    def test_onvolledige_kandidaat_blijft_behouden(self):
        with tempfile.TemporaryDirectory()as tmp:
            r=Path(tmp);l=r/'.local';l.mkdir();p=l/'eigen';p.write_text('eigen bestand');(r/'bron.json').write_text('{}')
            with patch.object(m,'ROOT',r),patch.object(m,'LOKAAL',l):
                with self.assertRaisesRegex(RuntimeError,'Onvolledige kandidaat behouden'):m.bereid()
            self.assertEqual(p.read_text(),'eigen bestand')
    def test_rss_meetboom_verdraagt_cycles_ontbrekende_waarden_en_geëindigde_kinderen(self):
        data={'/proc/10/task/10/children':'11 12 13','/proc/10/status':'Name: eigen\nVmRSS: 128 kB\n','/proc/11/task/11/children':'10','/proc/11/status':'Name: kind\nVmRSS: 256 kB\n','/proc/12/task/12/children':'','/proc/12/status':'Name: zombie\n'}
        class Bestand:
            def __init__(self,p):self.p=str(p)
            def __truediv__(self,n):return Bestand(self.p+'/'+str(n))
            def read_text(self):
                if self.p not in data:raise FileNotFoundError(self.p)
                return data[self.p]
            def resolve(self):return Path('/eigen/proef')
        with patch.object(g,'Path',Bestand):rij=g.procesboom(10)
        self.assertEqual({v['pid']for v in rij},{10,11,12})
        self.assertEqual(sum(v['rss_kib']for v in rij),384)
        with patch.object(g,'Path',Bestand):self.assertEqual(g.procesboom(99),[])
if __name__=='__main__':unittest.main()
