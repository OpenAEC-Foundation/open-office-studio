"""Eigen zesbladige bron, met de kop-/voettekstvarianten uit de bestaande proef."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

map = Path(__file__).parent
with ZipFile(map/'writer-kopvoet.docx') as z:
    delen = {naam: z.read(naam) for naam in z.namelist()}
tekst = delen['word/document.xml'].decode('utf-8')
begin = tekst.index('<w:body>')
eind = tekst.index('</w:body>') + len('</w:body>')
sectiebegin = tekst.rindex('<w:sectPr')
sectieeind = tekst.index('</w:sectPr>', sectiebegin) + len('</w:sectPr>')
body = '<w:body>'
for i in range(6):
    einde = '<w:pageBreakBefore/>' if i else ''
    body += f'<w:p><w:pPr>{einde}</w:pPr><w:r><w:t>Eigen cachepagina {i} met café en 🏠.</w:t></w:r></w:p>'
body += tekst[sectiebegin:sectieeind] + '</w:body>'
delen['word/document.xml'] = (tekst[:begin] + body + tekst[eind:]).encode('utf-8')
with ZipFile(map/'writer-cachepaginas.docx', 'w', compression=ZIP_DEFLATED) as z:
    for naam, inhoud in sorted(delen.items()):
        info = ZipInfo(naam, date_time=(2026, 10, 31, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        z.writestr(info, inhoud)
