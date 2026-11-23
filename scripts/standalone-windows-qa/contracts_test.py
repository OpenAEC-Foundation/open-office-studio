"""Focused failure contracts for QA helpers; never final native app evidence."""
import email
from email.message import EmailMessage
import importlib.util
import imaplib
import json
from pathlib import Path
import smtplib
import subprocess
import sys
import tempfile
import time
import unittest
import zipfile

HERE=Path(__file__).resolve().parent
def module(name):
    spec=importlib.util.spec_from_file_location(name,HERE/(name+'.py')); value=importlib.util.module_from_spec(spec); spec.loader.exec_module(value); return value
oracle=module('oracle'); packages=module('packages')

class Contracts(unittest.TestCase):
    def test_frozen_plan_requires_real_source(self):
        with self.assertRaises((AssertionError,TypeError)): packages.validate(dict(schemaVersion=1,frozen=True,applicationCommit=None))

    def test_unfrozen_plan_does_not_require_fake_package_ids(self):
        packages.validate(dict(schemaVersion=1,frozen=False))

    def test_wrong_writer_content_cannot_pass(self):
        with tempfile.TemporaryDirectory(prefix='oos-standalone-contract-') as directory:
            path=Path(directory)/'saved.docx'
            with zipfile.ZipFile(path,'w') as z: z.writestr('word/document.xml','<document><p>WRONG DOCUMENT</p></document>')
            with self.assertRaises(AssertionError): oracle.inspect('writer',path)

    def test_native_writer_marker_and_no_external_link(self):
        with tempfile.TemporaryDirectory(prefix='oos-standalone-contract-') as directory:
            path=Path(directory)/'saved.docx'
            with zipfile.ZipFile(path,'w') as z: z.writestr('word/document.xml','<document><p>STANDALONE23 WRITER EDIT</p></document>')
            self.assertEqual(oracle.inspect('writer',path)['status'],'passed')
            with zipfile.ZipFile(path,'a') as z: z.writestr('word/_rels/document.xml.rels','<Relationships><Relationship TargetMode="External" Target="https://example.invalid"/></Relationships>')
            with self.assertRaises(AssertionError): oracle.inspect('writer',path)

    def test_spreadsheet_cached_result_and_formula_are_both_required(self):
        with tempfile.TemporaryDirectory(prefix='oos-standalone-contract-') as directory:
            path=Path(directory)/'saved.xlsx'
            for answer in (42,43):
                with zipfile.ZipFile(path,'w') as z:
                    z.writestr('xl/worksheets/sheet1.xml',f'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>STANDALONE23 CELL</t></is></c><c r="B1"><v>41</v></c><c r="C1"><f>B1+1</f><v>{answer}</v></c></row></sheetData></worksheet>')
                if answer==42: self.assertEqual(oracle.inspect('spreadsheet',path)['status'],'passed')
                else:
                    with self.assertRaises(AssertionError): oracle.inspect('spreadsheet',path)

    def test_loopback_real_imap_append_and_independent_mime(self):
        with tempfile.TemporaryDirectory(prefix='oos-standalone-mail-contract-') as directory:
            root=Path(directory)/'mail'
            child=subprocess.Popen([sys.executable,'-B',str(HERE/'loopback-mail.py'),str(root)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            try:
                deadline=time.monotonic()+10
                while not (root/'ports.json').exists() and time.monotonic()<deadline:
                    if child.poll() is not None: self.fail(child.stderr.read().decode())
                    time.sleep(.05)
                ports=json.loads((root/'ports.json').read_bytes()); self.assertEqual(ports['host'],'127.0.0.1')
                client=imaplib.IMAP4(ports['host'],ports['imap'],timeout=5)
                self.assertEqual(client.login('qa@localhost','synthetic-password')[0],'OK')
                self.assertEqual(client.list()[0],'OK'); self.assertEqual(client.select('INBOX')[0],'OK')
                self.assertEqual(client.uid('search',None,'ALL')[0],'OK')
                self.assertIn(b'STANDALONE23 LOCAL MESSAGE',client.uid('fetch','1','(UID FLAGS BODY.PEEK[HEADER])')[1][0][1])
                message=EmailMessage(); message['From']='qa@localhost'; message['To']='fixture@localhost'
                message['Subject']='STANDALONE23 LOCAL DRAFT'; message.set_content('STANDALONE23 DRAFT BODY')
                self.assertEqual(client.append('Drafts','\\Draft',None,message.as_bytes(policy=email.policy.SMTP))[0],'OK')
                self.assertEqual(oracle.inspect('email',root)['status'],'passed')
                self.assertEqual(client.select('Drafts')[0],'OK'); self.assertEqual(client.uid('search',None,'ALL')[1],[b'2'])
                client.logout()
                with smtplib.SMTP(ports['host'],ports['smtp'],timeout=5) as smtp: self.assertEqual(smtp.ehlo()[0],250)
            finally:
                stdout,stderr=child.communicate(timeout=10)
                self.assertEqual(child.returncode,0,stderr.decode())
            report=json.loads((root/'report.json').read_bytes())
            self.assertTrue(report['serversClosed']); self.assertEqual(report['appendCount'],1)
            self.assertEqual(oracle.inspect('email',root)['status'],'passed')

if __name__=='__main__': unittest.main(verbosity=2)
