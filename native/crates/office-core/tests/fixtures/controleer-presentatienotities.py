"""Nieuwe en bestaande notities via de widget onafhankelijk teruglezen."""
from pathlib import Path
from zipfile import ZipFile
from pptx import Presentation
import sys
import xml.etree.ElementTree as ET
map = Path(sys.argv[1])
def xmlboom(e):
    # XML-attribuutvolgorde heeft geen betekenis; waarden, tekst en kindvolgorde wel.
    return (e.tag,dict(e.attrib),e.text,e.tail,[xmlboom(k) for k in e])
def notities(dia):
    return dia.notes_slide.notes_text_frame.text if dia.has_notes_slide else ''
for geval,bron,aantal in [
    ('nieuw',Path(__file__).with_name('presentation.pptx'),2),
    ('bestaand',Path(__file__).resolve().parents[5]/'docs/voorbeelden/Ontwerpvisie.pptx',3),
]:
    nieuw = map/f'presentation-notities-widget-{geval}.pptx'
    a,b=Presentation(bron),Presentation(nieuw)
    assert len(a.slides)==len(b.slides)==aantal
    assert notities(b.slides[0]).strip()=='Nieuw café 🏠'
    for n,(links,rechts) in enumerate(zip(a.slides,b.slides)):
        if n: assert notities(links)==notities(rechts)
        assert [(v.shape_type,v.text if v.has_text_frame else '') for v in links.shapes]==[(v.shape_type,v.text if v.has_text_frame else '') for v in rechts.shapes]
    with ZipFile(bron) as links,ZipFile(nieuw) as rechts:
        origineel,uitvoer=set(links.namelist()),set(rechts.namelist())
        assert not origineel-uitvoer
        gewijzigd=sorted(n for n in origineel if links.read(n)!=rechts.read(n))
        if geval=='bestaand':
            assert origineel==uitvoer
            assert gewijzigd==['ppt/notesSlides/notesSlide1.xml'],gewijzigd
        else:
            assert uitvoer-origineel=={'ppt/notesSlides/notesSlide1.xml','ppt/notesSlides/_rels/notesSlide1.xml.rels'}
            assert gewijzigd==['[Content_Types].xml','ppt/slides/_rels/slide1.xml.rels'],gewijzigd
            ct='http://schemas.openxmlformats.org/package/2006/content-types'
            rel='http://schemas.openxmlformats.org/package/2006/relationships'
            for deel,tag,attrib,waarde in [('[Content_Types].xml',f'{{{ct}}}Override','PartName','/ppt/notesSlides/notesSlide1.xml'),('ppt/slides/_rels/slide1.xml.rels',f'{{{rel}}}Relationship','Type','http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide')]:
                oud,na=ET.fromstring(links.read(deel)),ET.fromstring(rechts.read(deel))
                extra=[n for n in na if n.tag==tag and n.attrib.get(attrib)==waarde]
                assert len(extra)==1
                if attrib=='Type': assert extra[0].attrib['Target']=='../notesSlides/notesSlide1.xml'
                else: assert extra[0].attrib['ContentType']=='application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml'
                na.remove(extra[0]);assert xmlboom(oud)==xmlboom(na)
            terug=ET.fromstring(rechts.read('ppt/notesSlides/_rels/notesSlide1.xml.rels'))
            assert len(terug)==1 and terug[0].attrib['Target']=='../slides/slide1.xml'
            assert terug[0].attrib['Type']=='http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide'
print('Presentation-notitiewidget: nieuwe en bestaande Unicode-notities onafhankelijk heropend; diatekst, overige notities en alle overige ZIP-inhoud behouden. Nieuwe notities voegen uitsluitend hun eigen twee delen, relatie en inhoudstype toe; de attribuutvolgorde in die twee metadatadelen wordt opnieuw geserialiseerd.')
