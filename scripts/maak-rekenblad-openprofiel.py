"""Small deterministic diagnostic inputs, bounded to 300,000 cells per file."""
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.local/openprofiel'
OUT.mkdir(parents=True, exist_ok=True)


def column(n):
    result = ''
    while n:
        n, r = divmod(n-1, 26)
        result = chr(65+r) + result
    return result


for rows in [1000, 4000, 10000]:
    with zipfile.ZipFile(ROOT / 'public/templates/nieuw.xlsx') as source, zipfile.ZipFile(OUT / f'{rows}.xlsx', 'w', compression=zipfile.ZIP_DEFLATED) as target:
        for name in source.namelist():
            if name != 'xl/worksheets/sheet1.xml':
                target.writestr(name, source.read(name))
        with target.open('xl/worksheets/sheet1.xml', 'w') as xml:
            xml.write(b'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>')
            for row in range(1, rows+1):
                xml.write((f'<row r="{row}">' + ''.join(f'<c r="{column(col)}{row}"><v>{(row+col-1)%1000}</v></c>' for col in range(1, 31)) + '</row>').encode())
            xml.write(b'</sheetData></worksheet>')
print('Created bounded 30k / 120k / 300k-cell inputs')
