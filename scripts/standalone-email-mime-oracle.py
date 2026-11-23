"""Independent MIME check of the actual synthetic native IMAP APPEND bytes."""
from email import policy
from email.parser import BytesParser
import hashlib
import json
from pathlib import Path
import sys

def verify(raw, expected_subject):
    message=BytesParser(policy=policy.default).parsebytes(raw)
    assert not any(part.defects for part in message.walk()), 'Malformed MIME'
    assert message['Subject']==expected_subject, 'Wrong saved subject'
    assert message.get_content_type()=='multipart/alternative', 'Missing plain/HTML native alternatives'
    plain=message.get_body(preferencelist=('plain',))
    assert plain is not None and plain.get_content_type()=='text/plain', 'Missing plain body'
    assert plain.get_content().strip()=='Synthetic local draft body, never sent.', 'Wrong persisted plain body'
    return dict(status='passed',rawSha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw),subject=message['Subject'],contentType=message.get_content_type(),plainBody=plain.get_content().strip(),defects=[])

if __name__=='__main__':
    print(json.dumps(verify(Path(sys.argv[1]).read_bytes(),sys.argv[2])))
