import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('oracle',Path(__file__).with_name('standalone-email-mime-oracle.py'))
oracle=importlib.util.module_from_spec(spec);spec.loader.exec_module(oracle)

class Mime(unittest.TestCase):
    def fixture(self,subject='SYNTHETIC',body='Synthetic local draft body, never sent.'):
        return ('MIME-Version: 1.0\r\nSubject: '+subject+'\r\nContent-Type: multipart/alternative; boundary="qa"\r\n\r\n--qa\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n'+body+'\r\n--qa\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>'+body+'</p>\r\n--qa--\r\n').encode()
    def test_accepts_actual_synthetic_content(self):self.assertEqual(oracle.verify(self.fixture(),'SYNTHETIC')['status'],'passed')
    def test_rejects_wrong_subject(self):
        with self.assertRaises(AssertionError):oracle.verify(self.fixture('WRONG'),'SYNTHETIC')
    def test_rejects_missing_persisted_body(self):
        with self.assertRaises(AssertionError):oracle.verify(self.fixture(body=''),'SYNTHETIC')
    def test_rejects_broken_multipart(self):
        with self.assertRaises(AssertionError):oracle.verify(self.fixture().replace(b'--qa--',b'broken'),'SYNTHETIC')

if __name__=='__main__':unittest.main()
