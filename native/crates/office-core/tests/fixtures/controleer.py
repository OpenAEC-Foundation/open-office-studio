"""Lees native uitvoer met drie onafhankelijke documentbibliotheken."""
import sys
from pathlib import Path
from docx import Document
from openpyxl import load_workbook
from pptx import Presentation
map = Path(sys.argv[1])
doc = Document(map/'writer.docx')
assert any(p.text == 'Nieuwe tekst met café en 🏠' for p in doc.paragraphs)
assert doc.tables[0].cell(1,0).text == 'Tabel inhoud'
assert doc.paragraphs[2].runs[0].bold
assert doc.paragraphs[2].runs[1].italic
rijk = Document(map/'writer-rijk.docx')
assert rijk.paragraphs[2].text == 'Behoud deze cursieve tekst.\nTweede regel met 🏠'
assert rijk.paragraphs[2].runs[0].bold
assert any(r.italic for r in rijk.paragraphs[2].runs if 'cursieve' in r.text)
wb = load_workbook(map/'spreadsheet.xlsx', data_only=False)
assert wb['Begroting']['B2'].value == 4
assert wb['Begroting']['D2'].value == '=B2*C2'
assert wb['Begroting']['D4'].value == '=SUM(D2:D3)'
assert wb['Begroting']['D4'].number_format == '0.00'
assert wb['Begroting']['A1'].font.bold
assert wb['Tweede blad']['A1'].value == 'Bewaar ook dit blad'
waarden = load_workbook(map/'spreadsheet.xlsx', data_only=True)
assert waarden['Begroting']['D2'].value == 50
assert waarden['Begroting']['D4'].value == 80
ppt = Presentation(map/'presentation.pptx')
assert len(ppt.slides) == 2
assert any(s.has_text_frame and s.text == 'Gewijzigde diatekst' for s in ppt.slides[0].shapes)
assert 'Sprekersnotities' in ppt.slides[0].notes_slide.notes_text_frame.text
assert any(s.has_text_frame and s.text == 'Tweede dia blijft bewaard' for s in ppt.slides[1].shapes)
rijk = Presentation(map/'presentation-rijk.pptx')
p = rijk.slides[0].shapes[0].text_frame.paragraphs[0]
assert p.text == 'Native laatste 🏠 tekst'
assert p.runs[0].text == 'Native ' and p.runs[0].font.bold
print('Native DOCX/XLSX/PPTX: inhoud, stijlen, formules, rekenwaarden, tabellen, notities en tweede blad/dia onafhankelijk goedgekeurd.')

opmaak = Document(map/'writer-opmaak.docx')
p = next(p for p in opmaak.paragraphs if p.text == 'Behoud deze cursieve tekst.')
assert p.runs[0].text == 'Behoud ' and p.runs[0].bold
assert next(r for r in p.runs if r.text == 'deze').underline
assert next(r for r in p.runs if r.text == 'deze').italic
assert int(p.alignment) == 1
letter = Document(map/'writer-lettergrootte.docx')
p = next(p for p in letter.paragraphs if p.text == 'Bewerkbare oorspronkelijke alinea.')
assert p.runs[0].font.size.pt == 10.5
structuur = load_workbook(map/'spreadsheet-structuur.xlsx', data_only=False)
s = structuur['Begroting']
assert s['D3'].value == '=B3*C3'
assert s['B3'].font.bold and s['C4'].font.bold
assert s['B3'].fill.fgColor.rgb.upper().endswith('FFF2CC')
assert structuur['Tweede blad']['A1'].value == 'Bewaar ook dit blad'
print('Native uitbreidingen: tekstbereikopmaak, halve punten en celstijl/rij-invoeging onafhankelijk goedgekeurd.')
