"""Eigen bestaande bron met uitsluitend actieve beveiliging van het tweede blad."""
from pathlib import Path
from zipfile import ZipFile
map=Path(__file__).resolve().parent
with ZipFile(map/'spreadsheet.xlsx') as bron, ZipFile(map/'spreadsheet-beveiligd.xlsx','w') as uit:
    for info in bron.infolist():
        data=bron.read(info.filename)
        if info.filename=='xl/worksheets/sheet2.xml':
            data=data.replace(b'</sheetData>',b'</sheetData><sheetProtection sheet="1" objects="1" scenarios="1"/>',1)
        uit.writestr(info,data)
