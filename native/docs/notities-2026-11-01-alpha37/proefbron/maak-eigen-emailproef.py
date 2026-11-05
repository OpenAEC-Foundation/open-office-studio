from pathlib import Path
from email.message import EmailMessage
from email.policy import SMTP
m=EmailMessage(policy=SMTP)
m['From']='OpenAEC <voorbeeld@example.invalid>'
m['To']='lokaal@example.invalid'
m['Subject']='Eigen e-mailproef 9'
m['Date']='Sun, 01 Nov 2026 09:00:00 +0000'
m['Message-ID']='<eigen-emailproef9@example.invalid>'
m.set_content('Dit is een lokale e-mailproef.\nUnicode: ideeën en 🏠.\nDe eigen bijlage blijft bewaard.\n')
m.add_alternative('<p>Dit is een lokale e-mailproef.</p><p>Unicode: ideeën en 🏠.</p>',subtype='html')
m.add_attachment(b'Eigen bijlage9\r\n',maintype='text',subtype='plain',filename='Eigen-bijlage.txt')
m.set_boundary('openaec-eigen-emailproef9')
m.get_payload()[0].set_boundary('openaec-eigen-emailproef9-alternatief')
p=Path(__file__).with_name('eigen-emailproef.eml');assert not p.exists();p.write_bytes(m.as_bytes())
