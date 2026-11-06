"""Maak lege, geldige kantoorbestanden voor de knop Nieuw (ontwikkelhulpmiddel)."""
import re
import zipfile
from pathlib import Path
from docx import Document
from docx.shared import Mm
from docx.oxml.ns import qn
from openpyxl import Workbook
from pptx import Presentation
from pptx.util import Inches
from writer_sjabloon import normaliseer_writer_voorbeeld
uitvoer = Path(__file__).resolve().parents[1] / 'public' / 'templates'
uitvoer.mkdir(parents=True, exist_ok=True)


def zet_toepassing(pad):
    """Zet de toepassingsnaam in docProps/app.xml op die van deze suite."""
    with zipfile.ZipFile(pad) as z:
        delen = [(info, z.read(info.filename)) for info in z.infolist()]
    with zipfile.ZipFile(pad, 'w') as z:
        for info, data in delen:
            if info.filename == 'docProps/app.xml':
                data = re.sub(rb'<Application>[^<]*</Application>', b'<Application>OpenAEC Office Studio</Application>', data)
            z.writestr(info, data)


d = Document()
d.sections[0].page_width = Mm(210)
d.sections[0].page_height = Mm(297)
d.core_properties.author = ''
d.core_properties.last_modified_by = ''
# Gebruik een Unicode-bolletje dat ook zonder een oud symboollettertype werkt.
for niveau in d.part.numbering_part.element.findall('.//' + qn('w:lvl')):
    notatie = niveau.find(qn('w:numFmt'))
    tekst = niveau.find(qn('w:lvlText'))
    if notatie is None or notatie.get(qn('w:val')) != 'bullet' or tekst is None:
        continue
    tekst.set(qn('w:val'), '•')
    fonts = niveau.find('.//' + qn('w:rFonts'))
    if fonts is not None:
        fonts.set(qn('w:ascii'), 'Arial')
        fonts.set(qn('w:hAnsi'), 'Arial')
d.add_paragraph('')
d.save(uitvoer / 'nieuw.docx')
tekstsjabloon = uitvoer / 'nieuw.docx'
tekstsjabloon.write_bytes(normaliseer_writer_voorbeeld(tekstsjabloon.read_bytes()))
w = Workbook()
w.active.title = 'Blad 1'
w.properties.creator = ''
w.save(uitvoer / 'nieuw.xlsx')
p = Presentation()
p.core_properties.author = ''
p.core_properties.last_modified_by = ''
p.slide_width = Inches(13.333333)
p.slide_height = Inches(7.5)
s = p.slides.add_slide(p.slide_layouts[0])
s.shapes.title.text = 'Titel van de presentatie'
s.placeholders[1].text = 'Voeg een ondertitel toe'
p.save(uitvoer / 'nieuw.pptx')
for naam in ('nieuw.docx', 'nieuw.xlsx', 'nieuw.pptx'):
    zet_toepassing(uitvoer / naam)
