"""Open the group fixture saved by the browser in an isolated LibreOffice profile.

Run test-rekenblad-objecten-gui.mjs first. Set OPENAEC_CONVERSIE_PROGRAMMA to
soffice when LibreOffice is not on PATH. Uses the production converter profile.
"""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import zipfile
from lxml import etree as ET

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('formats', ROOT / 'scripts/test-rekenbladformaten.py')
formats = importlib.util.module_from_spec(spec)
spec.loader.exec_module(formats)
formats.OUT = ROOT / '.local/group-libreoffice'
formats.OUT.mkdir(exist_ok=True)
exe = os.environ.get('OPENAEC_CONVERSIE_PROGRAMMA') or shutil.which('soffice')
if not exe:
    raise RuntimeError('Set OPENAEC_CONVERSIE_PROGRAMMA to the LibreOffice executable')
source = ROOT / '.local/proef-rekenblad-objecten/group-moved.xlsx'
target, milliseconds = formats.convert(exe, source, 'xlsx', 'Calc MS Excel 2007 XML')
NS = {'x': 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing'}


def inspect(path):
    with zipfile.ZipFile(path) as package:
        drawing = next(n for n in package.namelist()
                       if n.startswith('xl/drawings/drawing') and n.endswith('.xml'))
        root = ET.fromstring(package.read(drawing), ET.XMLParser(resolve_entities=False, no_network=True))
        anchor = root[0]
        return {
            'anchor': ET.QName(anchor).localname,
            'from': {ET.QName(e).localname: int(e.text) for e in anchor.find('x:from', NS)},
            'groups': len(root.findall('.//x:grpSp', NS)),
            'names': [n.get('name') for n in root.findall('.//x:cNvPr', NS)],
        }


before, after = inspect(source), inspect(target)
assert before['from']['row'] == after['from']['row'] == 6, (before, after)
assert before['from']['col'] == after['from']['col'] == 4, (before, after)
assert before['groups'] == after['groups'] == 2, (before, after)
assert before['names'] == after['names'], (before, after)
report = {'pass': True, 'before': before, 'after': after, 'milliseconds': milliseconds, 'output': str(target)}
(formats.OUT / 'report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report))
