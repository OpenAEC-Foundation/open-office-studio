"""Eigen minimale bronnen voor voetnoten en tekst buiten gewone alinea's."""
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from docx import Document

MAP = Path(__file__).parent

def basis(tekst):
    doc = Document()
    doc.core_properties.author = 'OpenAEC'
    doc.core_properties.last_modified_by = 'OpenAEC'
    doc.add_paragraph(tekst)
    b = BytesIO()
    doc.save(b)
    with ZipFile(BytesIO(b.getvalue())) as z:
        return {n:z.read(n) for n in z.namelist()}

def wijzig(delen, pad, oud, nieuw):
    s = delen[pad].decode('utf-8')
    assert oud in s, (pad, oud)
    delen[pad] = s.replace(oud, nieuw, 1).encode('utf-8')

def onderdeel(delen, naam, soort, relatie, inhoud):
    delen['word/'+naam] = inhoud.encode('utf-8')
    wijzig(delen, '[Content_Types].xml', '</Types>',
        f'<Override PartName="/word/{naam}" ContentType="{soort}"/></Types>')
    wijzig(delen, 'word/_rels/document.xml.rels', '</Relationships>', relatie+'</Relationships>')

def bewaar(naam, delen):
    with ZipFile(MAP/naam, 'w', ZIP_DEFLATED) as z:
        for pad, inhoud in delen.items():
            z.writestr(pad, inhoud)

noten = basis('Tekst met een voetnoot.')
wijzig(noten, 'word/document.xml', '</w:p>', '<w:r><w:footnoteReference w:id="1"/></w:r></w:p>')
onderdeel(noten, 'footnotes.xml',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml',
    '<Relationship Id="rIdVoetnoten" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>',
    '<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:footnote w:id="1"><w:p><w:r><w:t>Natieve voetnoot</w:t></w:r></w:p></w:footnote></w:footnotes>')
bewaar('writer-voetnoot.docx', noten)

grafiek = basis('')
tekening = '''<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="5486400" cy="3200400"/><wp:docPr id="1" name="Grafiek 1"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rIdGrafiek"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'''
wijzig(grafiek, 'word/document.xml', '<w:p/>', tekening)
wijzig(grafiek, 'word/fontTable.xml', '</w:fonts>', '<w:font w:name="Gelasio"/></w:fonts>')
chart = '''<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:rPr b="1" sz="1800"><a:latin typeface="+mn-lt"/></a:rPr><a:t>Kosten</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:plotArea><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>Reeks</c:v></c:tx><c:cat><c:strLit><c:ptCount val="3"/><c:pt idx="0"><c:v>A</c:v></c:pt><c:pt idx="1"><c:v>B</c:v></c:pt><c:pt idx="2"><c:v>C</c:v></c:pt></c:strLit></c:cat><c:val><c:numLit><c:ptCount val="3"/><c:pt idx="0"><c:v>2</c:v></c:pt><c:pt idx="1"><c:v>4</c:v></c:pt><c:pt idx="2"><c:v>3</c:v></c:pt></c:numLit></c:val></c:ser><c:axId val="1"/><c:axId val="2"/></c:barChart><c:catAx><c:axId val="1"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="b"/><c:crossAx val="2"/></c:catAx><c:valAx><c:axId val="2"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="l"/><c:crossAx val="1"/></c:valAx></c:plotArea><c:plotVisOnly val="1"/></c:chart></c:chartSpace>'''
chart = chart.replace('<c:plotVisOnly', '<c:legend><c:legendPos val="b"/><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1400"><a:latin typeface="+mn-lt"/></a:defRPr></a:pPr><a:endParaRPr/></a:p></c:txPr></c:legend><c:plotVisOnly')
onderdeel(grafiek, 'charts/chart1.xml',
    'application/vnd.openxmlformats-officedocument.drawingml.chart+xml',
    '<Relationship Id="rIdGrafiek" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="charts/chart1.xml"/>', chart)
bewaar('writer-grafiek.docx', grafiek)
