"""Eigen minimale veldenbron: geneste verwijzingen en een veld over twee alinea's."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import re
map = Path(__file__).parent
body = '''<w:body>
<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> TOC </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>
<w:hyperlink w:anchor="hoofdstuk"><w:r><w:t>Inhoud café </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGEREF hoofdstuk </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>42 🏠</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:hyperlink></w:p>
<w:p><w:r><w:t>Einde inhoud</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>
<w:p><w:fldSimple w:instr=" REF hoofdstuk "><w:r><w:t>Verwijzing </w:t></w:r><w:fldSimple w:instr=" PAGE "><w:r><w:t>7</w:t></w:r></w:fldSimple></w:fldSimple></w:p>
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body>'''
with ZipFile(map/'writer.docx') as bron, ZipFile(map/'writer-velden.docx','w',ZIP_DEFLATED) as doel:
    for info in bron.infolist():
        data=bron.read(info.filename)
        if info.filename=='word/document.xml':
            data=re.sub(r'<w:body>.*</w:body>',lambda _:body,data.decode(),flags=re.S).encode()
        doel.writestr(info,data)

# Een diepe maar geldige veldboom; controleert ook de eigen native werkdraad.
diep=40
resultaat='<w:r><w:t>Diep resultaat café 🏠</w:t></w:r>'
opening='<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> REF hoofdstuk </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>'
sluiting='<w:r><w:fldChar w:fldCharType="end"/></w:r>'
diepe_body='<w:body><w:p>'+opening*diep+resultaat+sluiting*diep+'</w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body>'
with ZipFile(map/'writer.docx') as bron, ZipFile(map/'writer-diepe-velden.docx','w',ZIP_DEFLATED) as doel:
    for info in bron.infolist():
        data=bron.read(info.filename)
        if info.filename=='word/document.xml':
            data=re.sub(r'<w:body>.*</w:body>',lambda _:diepe_body,data.decode(),flags=re.S).encode()
        doel.writestr(info,data)
