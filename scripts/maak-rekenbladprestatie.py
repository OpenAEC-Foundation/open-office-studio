"""Vaste referenties voor #74; schrijf de grote cel-XML stroomgewijs, zonder celbibliotheek."""
import hashlib
import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / '.local/prestatie/rekenbladen')
OUT.mkdir(parents=True, exist_ok=True)

def kolom(n):
    out = ''
    while n:
        n, rest = divmod(n - 1, 26)
        out = chr(65 + rest) + out
    return out

def maak(naam, rijen, kolommen, formules):
    pad = OUT / (naam + '.xlsx')
    with zipfile.ZipFile(ROOT / 'public/templates/nieuw.xlsx') as basis, zipfile.ZipFile(pad, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for n in sorted(basis.namelist()):
            if n == 'xl/worksheets/sheet1.xml':
                continue
            info = zipfile.ZipInfo(n, (2026, 1, 1, 0, 0, 0)); info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, basis.read(n))
        info = zipfile.ZipInfo('xl/worksheets/sheet1.xml', (2026, 1, 1, 0, 0, 0)); info.compress_type = zipfile.ZIP_DEFLATED
        with z.open(info, 'w') as xml:
            xml.write(f'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:{kolom(kolommen)}{rijen}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>'.encode())
            for row in range(1, rijen + 1):
                cells = []
                for col in range(1, kolommen + 1):
                    adres = f'{kolom(col)}{row}'
                    if col == kolommen and row <= formules:
                        cells.append(f'<c r="{adres}"><f>$A$1*2+{row}</f><v>{2+row}</v></c>')
                    else:
                        cells.append(f'<c r="{adres}"><v>{(row+col-1)%1000}</v></c>')
                xml.write((f'<row r="{row}">' + ''.join(cells) + '</row>').encode())
            xml.write(b'</sheetData><autoFilter ref="A1:'+f'{kolom(kolommen)}{rijen}'.encode()+b'"/></worksheet>')
    return dict(naam=naam, bestand=pad.name, rijen=rijen, kolommen=kolommen, cellen=rijen*kolommen, formules=formules, bytes=pad.stat().st_size, sha256=hashlib.sha256(pad.read_bytes()).hexdigest())

manifest = [maak('100k-rijen-30-kolommen', 100000, 30, 0), maak('50k-afhankelijke-formules', 50000, 2, 50000)]
(OUT/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf-8')
print(json.dumps(manifest))
