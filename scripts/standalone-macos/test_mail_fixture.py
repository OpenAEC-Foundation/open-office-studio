"""Exercise real stdlib protocol clients against the isolated mail fixture."""
from pathlib import Path
import imaplib
import smtplib
import tempfile
import unittest
from mail_fixture_server import Fixture,USER,PASSWORD


class MailFixtureTests(unittest.TestCase):
    def test_real_imap_draft_roundtrip_and_smtp_no_relay(self):
        with tempfile.TemporaryDirectory(prefix="standalone-mail-") as t:
            root=Path(t);seed=root/"seed.eml";raw=b"From: qa@example.invalid\r\nSubject: synthetic\r\n\r\nlocal only\r\n";seed.write_bytes(raw)
            with Fixture(root/"server",seed) as server:
                with imaplib.IMAP4("127.0.0.1",server.imap_port,timeout=5) as client:
                    with self.assertRaises(imaplib.IMAP4.error):client.login(USER,"wrong")
                    client.login(USER,PASSWORD);self.assertEqual(client.list()[0],"OK")
                    client.select("INBOX");self.assertIn(b"1",client.uid("search",None,"ALL")[1])
                    self.assertIn(raw,client.uid("fetch","1","(BODY.PEEK[])")[1][0])
                    self.assertEqual(client.append("Drafts","(\\Draft)",None,raw)[0],"OK")
                    client.select("Drafts");self.assertIn(raw,client.uid("fetch","2","(BODY.PEEK[])")[1][0])
                with smtplib.SMTP("127.0.0.1",server.smtp_port,timeout=5) as client:
                    client.ehlo();self.assertEqual(client.docmd("DATA")[0],554)
                receipt=server.receipt();self.assertEqual(receipt["smtpDataAttempts"],1)
                self.assertEqual(receipt["relayedMessages"],0)
                self.assertEqual((root/"server/draft-2.eml").read_bytes(),raw)
                self.assertNotIn(PASSWORD,str(receipt))


if __name__=="__main__":unittest.main()
