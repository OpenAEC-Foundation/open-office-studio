"""Maak synthetische XLSX-fixtures voor de rekenbladproeven R1–R3 en aanvullende gevallen.

Uitsluitend Python-standaardbibliotheek. De bestanden bevatten geen praktijkinhoud en zijn
reproduceerbaar: vaste ZIP-tijdstempels en vaste volgorde. Cachewaarden (<v>) in de formules
zijn handmatig afgeleid en staan als commentaar bij de cel; de onafhankelijke controle in
`scripts/rekenblad_formules.py` rekent ze opnieuw na. Het geval `verouderde-cache` bevat
bewust onjuiste cachewaarden.

Gebruik: python3 scripts/maak-rekenbladfixtures.py [uitvoermap]   (standaard .local/matrix/rekenbladen)
"""
import json
import re
import sys
import zipfile
from datetime import date
from pathlib import Path
from xml.sax.saxutils import escape

NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
NS_PKG = 'http://schemas.openxmlformats.org/package/2006/relationships'
REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
CT_MAIN = 'application/vnd.openxmlformats-officedocument.spreadsheetml.'
DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
ZIPTIJD = (2026, 1, 1, 0, 0, 0)

# Celstijlen (index in cellXfs). numFmt 164+ zijn eigen notaties; OOXML bewaart notaties
# taalonafhankelijk (punt = decimaalteken, komma = duizendtal). [$-413] is de Nederlandse
# taalcode; de weergave met komma als decimaalteken is een taak van de weergavelaag.
NUMFMTS = {
    164: '#,##0.00',
    165: '0.0%',
    166: '[$€-413]\\ #,##0.00',
    167: 'd-m-yyyy',
    168: '[$-413]#,##0.00',
    169: '[$-413]d-m-yyyy',
}
STIJL = {'standaard': 0, 'getal2': 1, 'procent': 2, 'euro': 3, 'datum': 4, 'nl_getal': 5, 'nl_datum': 6, 'datum14': 7}
XF_NUMFMT = [0, 164, 165, 166, 167, 168, 169, 14]


def excel_serieel(d):
    """Serieel datumgetal in het 1900-systeem (vanaf 1-3-1900 gelijk aan dagen sinds 30-12-1899)."""
    return (d - date(1899, 12, 30)).days


def kolomnaam(index):
    naam = ''
    index += 1
    while index:
        index, rest = divmod(index - 1, 26)
        naam = chr(65 + rest) + naam
    return naam


def splits_ref(ref):
    m = re.fullmatch(r'([A-Z]+)(\d+)', ref)
    kolom = 0
    for teken in m.group(1):
        kolom = kolom * 26 + ord(teken) - 64
    return int(m.group(2)), kolom - 1


class Gedeeld:
    def __init__(self):
        self.lijst, self.index = [], {}

    def __call__(self, tekst):
        if tekst not in self.index:
            self.index[tekst] = len(self.lijst)
            self.lijst.append(tekst)
        return self.index[tekst]

    def xml(self):
        items = ''.join(f'<si><t xml:space="preserve">{escape(t)}</t></si>' for t in self.lijst)
        return f'{DECL}<sst xmlns="{NS_MAIN}" count="{len(self.lijst)}" uniqueCount="{len(self.lijst)}">{items}</sst>'


def cel_xml(ref, cel, gedeeld):
    """cel: getal, tekst, bool, ('f', formule, cache[, soort]) of ('e', '#N/A'); optioneel dict met stijl."""
    stijl = 0
    if isinstance(cel, dict):
        stijl, cel = STIJL[cel['stijl']], cel['w']
    s = f' s="{stijl}"' if stijl else ''
    if cel is None:
        return f'<c r="{ref}"{s}/>'
    if isinstance(cel, tuple) and cel[0] == 'f':
        _, formule, cache = cel[:3]
        f = f'<f>{escape(formule)}</f>'
        if cache is None:
            return f'<c r="{ref}"{s}>{f}</c>'
        if isinstance(cache, bool):
            return f'<c r="{ref}"{s} t="b">{f}<v>{int(cache)}</v></c>'
        if isinstance(cache, str) and cache.startswith('#'):
            return f'<c r="{ref}"{s} t="e">{f}<v>{escape(cache)}</v></c>'
        if isinstance(cache, str):
            return f'<c r="{ref}"{s} t="str">{f}<v>{escape(cache)}</v></c>'
        return f'<c r="{ref}"{s}>{f}<v>{getal(cache)}</v></c>'
    if isinstance(cel, tuple) and cel[0] == 'e':
        return f'<c r="{ref}"{s} t="e"><v>{escape(cel[1])}</v></c>'
    if isinstance(cel, bool):
        return f'<c r="{ref}"{s} t="b"><v>{int(cel)}</v></c>'
    if isinstance(cel, (int, float)):
        return f'<c r="{ref}"{s}><v>{getal(cel)}</v></c>'
    return f'<c r="{ref}"{s} t="s"><v>{gedeeld(cel)}</v></c>'


def getal(waarde):
    if isinstance(waarde, float) and waarde.is_integer():
        return str(int(waarde))
    return repr(waarde) if isinstance(waarde, float) else str(waarde)


def blad_xml(cellen, gedeeld, *, voor_data='', na_data='', kolommen=''):
    rijen = {}
    for ref, cel in cellen.items():
        rij, kolom = splits_ref(ref)
        rijen.setdefault(rij, []).append((kolom, ref, cel))
    delen = []
    for rij in sorted(rijen):
        inhoud = ''.join(cel_xml(ref, cel, gedeeld) for _, ref, cel in sorted(rijen[rij]))
        delen.append(f'<row r="{rij}">{inhoud}</row>')
    if cellen:
        r = [splits_ref(x) for x in cellen]
        dim = f'A1:{kolomnaam(max(k for _, k in r))}{max(x for x, _ in r)}'
    else:
        dim = 'A1'
    return (f'{DECL}<worksheet xmlns="{NS_MAIN}" xmlns:r="{NS_R}"><dimension ref="{dim}"/>'
            f'{voor_data}{kolommen}<sheetData>{"".join(delen)}</sheetData>{na_data}</worksheet>')


MARGES = '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>'


def stijlen_xml():
    fmts = ''.join(f'<numFmt numFmtId="{i}" formatCode="{escape(c, {chr(34): "&quot;"})}"/>' for i, c in NUMFMTS.items())
    xfs = ''.join(
        f'<xf numFmtId="{n}" fontId="0" fillId="0" borderId="0" xfId="0"{" applyNumberFormat=" + chr(34) + "1" + chr(34) if n else ""}/>'
        for n in XF_NUMFMT)
    return (f'{DECL}<styleSheet xmlns="{NS_MAIN}"><numFmts count="{len(NUMFMTS)}">{fmts}</numFmts>'
            '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>'
            '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
            '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
            '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
            f'<cellXfs count="{len(XF_NUMFMT)}">{xfs}</cellXfs>'
            '<cellStyles count="1"><cellStyle name="Standaard" xfId="0" builtinId="0"/></cellStyles>'
            '<dxfs count="1"><dxf><font><b/><color rgb="FF9C0006"/></font><fill><patternFill><bgColor rgb="FFFFC7CE"/></patternFill></fill></dxf></dxfs>'
            '</styleSheet>')


def rels_xml(relaties):
    items = ''.join(
        f'<Relationship Id="{i}" Type="{t}" Target="{escape(d)}"/>' for i, t, d in relaties)
    return f'{DECL}<Relationships xmlns="{NS_PKG}">{items}</Relationships>'


class Werkboek:
    """Bouw één XLSX-pakket. Extra onderdelen gaan als (pad, inhoud, inhoudstype)."""

    def __init__(self):
        self.gedeeld = Gedeeld()
        self.bladen = []  # (naam, xml, state, extra_rels)
        self.namen = []
        self.extra = []
        self.wb_rels = []
        self.wb_na_calc = ''
        self.calc_pr = '<calcPr calcId="191029"/>'

    def blad(self, naam, cellen, *, state=None, rels=(), **opties):
        self.bladen.append((naam, cellen, opties, state, list(rels)))

    def schrijf(self, pad):
        onderdelen = {}
        types = {
            'xl/workbook.xml': CT_MAIN + 'sheet.main+xml',
            'xl/styles.xml': CT_MAIN + 'styles+xml',
            'xl/sharedStrings.xml': CT_MAIN + 'sharedStrings+xml',
        }
        wb_rels, bladen = [], []
        for n, (naam, cellen, opties, state, rels) in enumerate(self.bladen, 1):
            deel = f'xl/worksheets/sheet{n}.xml'
            onderdelen[deel] = blad_xml(cellen, self.gedeeld, **opties)
            types[deel] = CT_MAIN + 'worksheet+xml'
            if rels:
                onderdelen[f'xl/worksheets/_rels/sheet{n}.xml.rels'] = rels_xml(rels)
            wb_rels.append((f'rId{n}', REL + 'worksheet', f'worksheets/sheet{n}.xml'))
            st = f' state="{state}"' if state else ''
            bladen.append(f'<sheet name="{escape(naam)}" sheetId="{n}"{st} r:id="rId{n}"/>')
        volgende = len(self.bladen) + 1
        wb_rels += [(f'rId{volgende}', REL + 'styles', 'styles.xml'),
                    (f'rId{volgende + 1}', REL + 'sharedStrings', 'sharedStrings.xml')]
        wb_rels += self.wb_rels
        namen = ''
        if self.namen:
            namen = '<definedNames>' + ''.join(
                f'<definedName name="{n}"{f" localSheetId={chr(34)}{l}{chr(34)}" if l is not None else ""}>{escape(f)}</definedName>'
                for n, f, l in self.namen) + '</definedNames>'
        onderdelen['xl/workbook.xml'] = (
            f'{DECL}<workbook xmlns="{NS_MAIN}" xmlns:r="{NS_R}"><workbookPr/>'
            f'<bookViews><workbookView activeTab="0"/></bookViews><sheets>{"".join(bladen)}</sheets>'
            f'{namen}{self.calc_pr}{self.wb_na_calc}</workbook>')
        onderdelen['xl/_rels/workbook.xml.rels'] = rels_xml(wb_rels)
        onderdelen['xl/styles.xml'] = stijlen_xml()
        onderdelen['xl/sharedStrings.xml'] = self.gedeeld.xml()
        onderdelen['_rels/.rels'] = rels_xml([('rId1', REL + 'officeDocument', 'xl/workbook.xml')])
        for deel, inhoud, soort in self.extra:
            onderdelen[deel] = inhoud
            if soort:
                types[deel] = soort
        overrides = ''.join(f'<Override PartName="/{d}" ContentType="{t}"/>' for d, t in sorted(types.items()))
        onderdelen['[Content_Types].xml'] = (
            f'{DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            f'<Default Extension="xml" ContentType="application/xml"/>{overrides}</Types>')
        volgorde = ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels']
        volgorde += sorted(d for d in onderdelen if d not in volgorde)
        with zipfile.ZipFile(pad, 'w', zipfile.ZIP_DEFLATED) as archief:
            for deel in volgorde:
                info = zipfile.ZipInfo(deel, ZIPTIJD)
                info.compress_type = zipfile.ZIP_DEFLATED
                archief.writestr(info, onderdelen[deel].encode('utf-8'))


def f(formule, cache):
    return ('f', formule, cache)


def r1():
    """Meerdere bladen, kruisverwijzingen, formules en getalopmaak."""
    wb = Werkboek()
    wb.blad('Invoer', {
        'A1': 'Aantal', 'B1': 10,
        'A2': 'Prijs', 'B2': {'stijl': 'euro', 'w': 2.5},
        'A3': 'Korting', 'B3': {'stijl': 'procent', 'w': 0.1},
    })
    wb.blad('Berekening', {
        'A1': 'Bruto', 'B1': {'stijl': 'getal2', 'w': f('Invoer!B1*Invoer!B2', 25)},       # 10*2,5
        'A2': 'Netto', 'B2': {'stijl': 'getal2', 'w': f('B1*(1-Invoer!B3)', 22.5)},        # 25*0,9
        'A3': 'Met btw', 'B3': {'stijl': 'euro', 'w': f('ROUND(B2*1.21,2)', 27.23)},       # 27,225 -> 27,23
    })
    wb.blad('Samenvatting', {
        'A1': 'Totaal', 'B1': {'stijl': 'getal2', 'w': f('SUM(Berekening!B1:B3)', 74.73)},  # 25+22,5+27,23
        'A2': 'Gemiddeld', 'B2': f('AVERAGE(Invoer!B1:B3)', 4.2),                          # (10+2,5+0,1)/3
        'A3': 'Oordeel', 'B3': f('IF(B1>50,"hoog","laag")', 'hoog'),
        'A4': 'Per stuk', 'B4': {'stijl': 'euro', 'w': f('Berekening!B2/Invoer!B1', 2.25)},
        'A5': 'Maximum', 'B5': f('MAX(Berekening!B1:B3)-MIN(Berekening!B1:B3)', 4.73),    # 27,23-22,5
    })
    return wb


def r2():
    """Grafiek, benoemd bereik, verborgen blad en afdrukinstellingen."""
    wb = Werkboek()
    wb.namen = [('Omzet', 'Gegevens!$B$2:$B$5', None),
                ('_xlnm.Print_Area', 'Gegevens!$A$1:$B$7', 0),
                ('_xlnm.Print_Titles', 'Gegevens!$1:$1', 0)]
    afdruk = ('<printOptions gridLines="1" horizontalCentered="1"/>' + MARGES +
              '<pageSetup paperSize="9" orientation="landscape" scale="85" fitToHeight="0"/>'
              '<headerFooter><oddFooter>&amp;P / &amp;N</oddFooter></headerFooter><drawing r:id="rId1"/>')
    wb.blad('Gegevens', {
        'A1': 'Regio', 'B1': 'Omzet',
        'A2': 'Noord', 'B2': 120, 'A3': 'Oost', 'B3': 80, 'A4': 'Zuid', 'B4': 150, 'A5': 'West', 'B5': 50,
        'A6': 'Totaal', 'B6': f('SUM(Omzet)', 400),                                       # 120+80+150+50
        'A7': 'Verborgen factor', 'B7': f('Verborgen!A1*2', 14),                          # 7*2
    }, na_data=afdruk, rels=[('rId1', REL + 'drawing', '../drawings/drawing1.xml')])
    wb.blad('Verborgen', {'A1': 7, 'A2': f('A1+SUM(Omzet)', 407)}, state='hidden')
    tekst = lambda f_, waarden: (
        f'<c:strRef><c:f>{f_}</c:f><c:strCache><c:ptCount val="{len(waarden)}"/>' +
        ''.join(f'<c:pt idx="{i}"><c:v>{w}</c:v></c:pt>' for i, w in enumerate(waarden)) + '</c:strCache></c:strRef>')
    grafiek = (
        f'{DECL}<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" '
        f'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="{NS_R}">'
        '<c:chart><c:autoTitleDeleted val="0"/><c:plotArea><c:layout/><c:barChart><c:barDir val="col"/>'
        '<c:grouping val="clustered"/><c:varyColors val="0"/><c:ser><c:idx val="0"/><c:order val="0"/>'
        f'<c:tx>{tekst("Gegevens!$B$1", ["Omzet"])}</c:tx>'
        f'<c:cat>{tekst("Gegevens!$A$2:$A$5", ["Noord", "Oost", "Zuid", "West"])}</c:cat>'
        '<c:val><c:numRef><c:f>Gegevens!$B$2:$B$5</c:f><c:numCache><c:formatCode>General</c:formatCode>'
        '<c:ptCount val="4"/><c:pt idx="0"><c:v>120</c:v></c:pt><c:pt idx="1"><c:v>80</c:v></c:pt>'
        '<c:pt idx="2"><c:v>150</c:v></c:pt><c:pt idx="3"><c:v>50</c:v></c:pt></c:numCache></c:numRef></c:val>'
        '</c:ser><c:axId val="101"/><c:axId val="102"/></c:barChart>'
        '<c:catAx><c:axId val="101"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/>'
        '<c:axPos val="b"/><c:crossAx val="102"/></c:catAx>'
        '<c:valAx><c:axId val="102"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/>'
        '<c:axPos val="l"/><c:crossAx val="101"/></c:valAx></c:plotArea><c:plotVisOnly val="1"/></c:chart></c:chartSpace>')
    tekening = (
        f'{DECL}<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" '
        'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:twoCellAnchor>'
        '<xdr:from><xdr:col>3</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>'
        '<xdr:to><xdr:col>9</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>16</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>'
        '<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Grafiek 1" descr="Omzet per regio"/>'
        '<xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>'
        '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">'
        f'<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="{NS_R}" r:id="rId1"/>'
        '</a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>')
    wb.extra += [
        ('xl/drawings/drawing1.xml', tekening, 'application/vnd.openxmlformats-officedocument.drawing+xml'),
        ('xl/drawings/_rels/drawing1.xml.rels', rels_xml([('rId1', REL + 'chart', '../charts/chart1.xml')]), None),
        ('xl/charts/chart1.xml', grafiek, 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml'),
    ]
    return wb


ONBEKEND_TYPE = 'http://schemas.openaec.org/relationships/onbekend-onderdeel'
ONBEKEND_CT = 'application/vnd.openaec.onbekend+xml'


def r3():
    """Gegevensvalidatie, voorwaardelijke opmaak, draaitabel en onbekend onderdeel."""
    wb = Werkboek()
    regels = [('Noord', 'A', 10), ('Zuid', 'A', 20), ('Noord', 'B', 30), ('Zuid', 'B', 40)]
    cellen = {'A1': 'Regio', 'B1': 'Product', 'C1': 'Bedrag', 'D1': 'Gecontroleerd'}
    for i, (regio, product, bedrag) in enumerate(regels, 2):
        cellen.update({f'A{i}': regio, f'B{i}': product, f'C{i}': bedrag, f'D{i}': 'Ja'})
    cellen['B6'] = 'Totaal'
    cellen['C6'] = f('SUM(C2:C5)', 100)                                                    # 10+20+30+40
    cellen['C7'] = f('COUNT(C2:C5)', 4)
    na = ('<conditionalFormatting sqref="C2:C5"><cfRule type="cellIs" dxfId="0" priority="1" operator="greaterThan">'
          '<formula>25</formula></cfRule></conditionalFormatting>'
          '<dataValidations count="2"><dataValidation type="decimal" operator="between" allowBlank="1" '
          'showErrorMessage="1" sqref="C2:C5"><formula1>0</formula1><formula2>1000</formula2></dataValidation>'
          '<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="D2:D5">'
          '<formula1>"Ja,Nee"</formula1></dataValidation></dataValidations>' + MARGES)
    wb.blad('Data', cellen, na_data=na)
    wb.blad('Draai', {
        'A3': 'Rijlabels', 'B3': 'Som van Bedrag',
        'A4': 'Noord', 'B4': 40, 'A5': 'Zuid', 'B5': 60, 'A6': 'Eindtotaal', 'B6': 100,
        'D1': 'Opmerking',
    }, na_data=MARGES, rels=[('rId1', REL + 'pivotTable', '../pivotTables/pivotTable1.xml')])
    nr = len(wb.bladen) + 3
    wb.wb_na_calc = f'<pivotCaches><pivotCache cacheId="1" r:id="rId{nr}"/></pivotCaches>'
    wb.wb_rels += [(f'rId{nr}', REL + 'pivotCacheDefinition', 'pivotCache/pivotCacheDefinition1.xml'),
                   (f'rId{nr + 1}', ONBEKEND_TYPE, 'openaec/onbekend-onderdeel.xml')]
    definitie = (
        f'{DECL}<pivotCacheDefinition xmlns="{NS_MAIN}" xmlns:r="{NS_R}" r:id="rId1" refreshOnLoad="0" '
        'createdVersion="6" refreshedVersion="6" minRefreshableVersion="3" recordCount="4">'
        '<cacheSource type="worksheet"><worksheetSource ref="A1:C5" sheet="Data"/></cacheSource>'
        '<cacheFields count="3"><cacheField name="Regio" numFmtId="0"><sharedItems count="2"><s v="Noord"/><s v="Zuid"/>'
        '</sharedItems></cacheField><cacheField name="Product" numFmtId="0"><sharedItems count="2"><s v="A"/><s v="B"/>'
        '</sharedItems></cacheField><cacheField name="Bedrag" numFmtId="0"><sharedItems containsSemiMixedTypes="0" '
        'containsString="0" containsNumber="1" containsInteger="1" minValue="10" maxValue="40"/></cacheField>'
        '</cacheFields></pivotCacheDefinition>')
    records = (
        f'{DECL}<pivotCacheRecords xmlns="{NS_MAIN}" xmlns:r="{NS_R}" count="4">'
        '<r><x v="0"/><x v="0"/><n v="10"/></r><r><x v="1"/><x v="0"/><n v="20"/></r>'
        '<r><x v="0"/><x v="1"/><n v="30"/></r><r><x v="1"/><x v="1"/><n v="40"/></r></pivotCacheRecords>')
    draaitabel = (
        f'{DECL}<pivotTableDefinition xmlns="{NS_MAIN}" name="Draaitabel1" cacheId="1" applyNumberFormats="0" '
        'applyBorderFormats="0" applyFontFormats="0" applyPatternFormats="0" applyAlignmentFormats="0" '
        'applyWidthHeightFormats="1" dataCaption="Waarden" updatedVersion="6" minRefreshableVersion="3" '
        'createdVersion="6" indent="0" outline="1" outlineData="1">'
        '<location ref="A3:B6" firstHeaderRow="1" firstDataRow="1" firstDataCol="1"/>'
        '<pivotFields count="3"><pivotField axis="axisRow" showAll="0"><items count="3"><item x="0"/><item x="1"/>'
        '<item t="default"/></items></pivotField><pivotField showAll="0"/><pivotField dataField="1" showAll="0"/>'
        '</pivotFields><rowFields count="1"><field x="0"/></rowFields><rowItems count="3"><i><x/></i><i><x v="1"/></i>'
        '<i t="grand"><x/></i></rowItems><colItems count="1"><i/></colItems>'
        '<dataFields count="1"><dataField name="Som van Bedrag" fld="2" baseField="0" baseItem="0"/></dataFields>'
        '</pivotTableDefinition>')
    onbekend = f'{DECL}<openaec:proef xmlns:openaec="urn:openaec:onbekend"><openaec:kenmerk waarde="behouden"/></openaec:proef>'
    wb.extra += [
        ('xl/pivotCache/pivotCacheDefinition1.xml', definitie, CT_MAIN + 'pivotCacheDefinition+xml'),
        ('xl/pivotCache/_rels/pivotCacheDefinition1.xml.rels',
         rels_xml([('rId1', REL + 'pivotCacheRecords', 'pivotCacheRecords1.xml')]), None),
        ('xl/pivotCache/pivotCacheRecords1.xml', records, CT_MAIN + 'pivotCacheRecords+xml'),
        ('xl/pivotTables/pivotTable1.xml', draaitabel, CT_MAIN + 'pivotTable+xml'),
        ('xl/pivotTables/_rels/pivotTable1.xml.rels',
         rels_xml([('rId1', REL + 'pivotCacheDefinition', '../pivotCache/pivotCacheDefinition1.xml')]), None),
        ('xl/openaec/onbekend-onderdeel.xml', onbekend, ONBEKEND_CT),
    ]
    return wb


def verouderde_cache():
    """Cachewaarden kloppen bewust niet met de formules; calcChain aanwezig, geen fullCalcOnLoad."""
    wb = Werkboek()
    wb.blad('Cache', {
        'A1': 2, 'A2': 3,
        'A3': f('A1+A2', 999),          # juist: 5
        'A4': f('A3*10', 0),            # juist: 50
        'A5': f('SUM(A1:A4)', 1),       # juist: 2+3+5+50 = 60
        'A6': f('A1*A2', 6),            # klopt: 6 (controle dat niet alles verouderd is)
        'B1': f('IF(A3=5,"ok","fout")', 'fout'),  # juist: "ok"
    })
    keten = ''.join(f'<c r="{r}" i="1"/>' for r in ('A3', 'A4', 'A5', 'A6', 'B1'))
    wb.extra.append(('xl/calcChain.xml', f'{DECL}<calcChain xmlns="{NS_MAIN}">{keten}</calcChain>',
                     CT_MAIN + 'calcChain+xml'))
    wb.wb_rels.append(('rId90', REL + 'calcChain', 'calcChain.xml'))
    return wb


def onbekende_functies():
    """Echte onbekende, gebruikersgedefinieerde en nieuwere (_xlfn) functies, met cachewaarden."""
    wb = Werkboek()
    wb.blad('Functies', {
        'A1': 1, 'A2': 2, 'A3': 3, 'B1': 'een', 'B2': 'twee', 'B3': 'drie',
        'C1': f('ONBEKENDEFUNCTIE(A1)', 5),                 # Excel: #NAME?
        'C2': f('_xludf.MIJNMACRO(A1)', 6),                 # gebruikersfunctie zonder macro: #NAME?
        'C3': f('_xlfn.XLOOKUP(2,A1:A3,B1:B3)', 'twee'),    # bestaande nieuwere functie
        'C4': f('_xlfn.TEXTJOIN("-",TRUE,A1:A3)', '1-2-3'),
        'C5': f('SUM(A1:A3)+1', 7),                         # gewone functie, ter vergelijking
        'C6': f('C1+1', 6),                                 # afhankelijk van onbekende functie: #NAME?
        # FACT is nu ondersteund: 1! = 1 en na bewerking 2! = 1×2 = 2; cache 99 is bewust fout.
        'C7': f('FACT(A1)', 99),
    })
    return wb


def foutwaarden():
    wb = Werkboek()
    wb.blad('Fouten', {
        'A1': 10, 'A2': 0, 'A3': 'tekst',
        'B1': f('A1/A2', '#DIV/0!'),
        'B2': f('#REF!+1', '#REF!'),
        'B3': f('NA()', '#N/A'),
        'B4': f('VLOOKUP(99,A1:A2,1,FALSE)', '#N/A'),
        'B5': f('IFERROR(A1/A2,-1)', -1),
        'B6': f('ISERROR(B1)', True),
        'B7': f('A1+A3', '#VALUE!'),
        'B8': f('B1+1', '#DIV/0!'),
        'B9': ('e', '#N/A'),                                # foutwaarde zonder formule
    })
    return wb


def nl_notatie():
    datum = excel_serieel(date(2026, 10, 26))                # 46321
    wb = Werkboek()
    wb.blad('Notatie', {
        'A1': {'stijl': 'nl_getal', 'w': 1234.5},
        'A2': {'stijl': 'getal2', 'w': 1234.5},
        'A3': {'stijl': 'nl_datum', 'w': datum},
        'A4': {'stijl': 'datum', 'w': datum},
        'A5': {'stijl': 'procent', 'w': 0.155},
        'A6': {'stijl': 'euro', 'w': 1234.5},
        'A7': {'stijl': 'datum14', 'w': datum},
        # lege, opgemaakte invoercellen voor de bewerkingsproef
        'B1': {'stijl': 'nl_getal', 'w': None},
        'B2': {'stijl': 'nl_datum', 'w': None},
        'B3': {'stijl': 'datum', 'w': None},
    })
    return wb, datum


def groot(rijen=6000, kolommen=19):
    """rijen × (kolommen + 1) cellen; elke rij eindigt met een SOM-formule; U1 telt alles op."""
    wb = Werkboek()
    cellen, totaal = {}, 0
    for r in range(1, rijen + 1):
        rijsom = 0
        for k in range(kolommen):
            w = (r * 7 + k * 13) % 1000
            cellen[f'{kolomnaam(k)}{r}'] = w
            rijsom += w
        cellen[f'{kolomnaam(kolommen)}{r}'] = f(f'SUM(A{r}:{kolomnaam(kolommen - 1)}{r})', rijsom)
        totaal += rijsom
    eind = kolomnaam(kolommen)
    cellen[f'{kolomnaam(kolommen + 1)}1'] = f(f'SUM({eind}1:{eind}{rijen})', totaal)
    wb.blad('Groot', cellen)
    return wb, rijen * (kolommen + 1) + 1


def main():
    uit = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / '.local' / 'matrix' / 'rekenbladen')
    uit.mkdir(parents=True, exist_ok=True)
    nl, datum = nl_notatie()
    grootboek, celaantal = groot()
    gevallen = [
        ('r1-kruisverwijzingen', r1(), {
            'matrix': 'R1', 'bewerking': {'blad': 'Invoer', 'cel': 'B1', 'invoer': '20'},
            'verwacht_gewijzigd': ['xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml'],
            'kenmerken': ['bladen>=3', 'kruisverwijzing', 'numFmt']}),
        ('r2-grafiek-namen', r2(), {
            'matrix': 'R2', 'bewerking': {'blad': 'Gegevens', 'cel': 'A2', 'invoer': 'Noordwest'},
            'verwacht_gewijzigd': ['xl/worksheets/sheet1.xml', 'xl/sharedStrings.xml'],
            'kenmerken': ['chart', 'definedName', 'hidden', 'pageSetup', 'printArea']}),
        ('r3-validatie-draaitabel', r3(), {
            'matrix': 'R3', 'bewerking': {'blad': 'Data', 'cel': 'C2', 'invoer': '15'},
            'verwacht_gewijzigd': ['xl/worksheets/sheet1.xml'],
            'kenmerken': ['dataValidations', 'conditionalFormatting', 'pivot', 'onbekend']}),
        ('verouderde-cache', verouderde_cache(), {
            'matrix': 'extra', 'bewerking': {'blad': 'Cache', 'cel': 'A1', 'invoer': '4'},
            'verwacht_gewijzigd': ['xl/worksheets/sheet1.xml', 'xl/calcChain.xml'], 'kenmerken': []}),
        ('onbekende-functies', onbekende_functies(), {
            'matrix': 'extra', 'bewerking': {'blad': 'Functies', 'cel': 'A2', 'invoer': '5'},
            'verwacht_gewijzigd': ['xl/worksheets/sheet1.xml'], 'kenmerken': []}),
        ('foutwaarden', foutwaarden(), {
            'matrix': 'extra', 'bewerking': {'blad': 'Fouten', 'cel': 'A2', 'invoer': '4'},
            'verwacht_gewijzigd': ['xl/worksheets/sheet1.xml'], 'kenmerken': []}),
        ('nl-notatie', nl, {
            'matrix': 'extra', 'bewerking': {'blad': 'Notatie', 'cel': 'B1', 'invoer': '1,5'},
            'verwacht_gewijzigd': ['xl/worksheets/sheet1.xml', 'xl/sharedStrings.xml'], 'kenmerken': [],
            'datum_serieel': datum}),
        ('groot-werkboek', grootboek, {
            'matrix': 'extra', 'bewerking': {'blad': 'Groot', 'cel': 'A1', 'invoer': '1000'},
            'verwacht_gewijzigd': ['xl/worksheets/sheet1.xml'], 'kenmerken': [], 'cellen': celaantal}),
    ]
    manifest = []
    for naam, wb, gegevens in gevallen:
        pad = uit / f'{naam}.xlsx'
        wb.schrijf(pad)
        manifest.append({'naam': naam, 'bestand': pad.name, **gegevens})
    (uit / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for item in manifest:
        print(f"{item['bestand']}: {(uit / item['bestand']).stat().st_size} bytes")


if __name__ == '__main__':
    main()
