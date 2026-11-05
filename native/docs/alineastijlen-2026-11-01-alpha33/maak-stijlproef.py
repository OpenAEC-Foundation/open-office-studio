from pathlib import Path
from zipfile import ZipFile,ZipInfo,ZIP_DEFLATED
import sys,hashlib
assert len(sys.argv)==2,'Geef een nieuw uitvoerbestand op'
doel=Path(sys.argv[1]);assert not doel.exists()
bron=Path(__file__).resolve().parents[2]/'crates/office-core/tests/fixtures/writer-structuur.docx'
stijlen=b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Cambria" w:hAnsi="Cambria"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Standaard"/><w:qFormat/></w:style><w:style w:type="paragraph" w:styleId="EigenKop"><w:name w:val="Kop 1"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:rFonts w:ascii="Inter" w:hAnsi="Inter"/><w:sz w:val="40"/></w:rPr></w:style><w:style w:type="character" w:styleId="Tekenstijl"><w:name w:val="Nadruk"/><w:rPr><w:i/></w:rPr></w:style></w:styles>'
with ZipFile(bron) as z,ZipFile(doel,'w',ZIP_DEFLATED) as uit:
 for n in z.namelist():
  b=stijlen if n=='word/styles.xml' else z.read(n)
  info=ZipInfo(n,(2026,11,1,7,30,16));info.create_system=3;info.compress_type=ZIP_DEFLATED
  uit.writestr(info,b)
print(hashlib.sha256(doel.read_bytes()).hexdigest())
