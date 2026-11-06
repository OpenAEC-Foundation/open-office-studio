"""Onafhankelijke formulecontrole voor de synthetische rekenbladfixtures.

Een kleine evaluator in Python-standaardbibliotheek voor precies de functies die de fixtures
gebruiken. Hij leest alleen de invoerwaarden en formuleteksten uit het XLSX-pakket; opgeslagen
formule-uitkomsten (<v> bij een formule) worden genegeerd en gelden niet als bewijs.
De afzonderlijke optie --opgeslagen leest uitsluitend gemeten exportwaarden
voor vergelijking met deze verwachting; die optie berekent niets.

Gebruik:
  python3 scripts/rekenblad_formules.py bestand.xlsx [--wijzig Blad!A1=20 ...]

Uitvoer (JSON): per formulecel {"soort": number|text|bool|error|empty, "waarde": ...}, in de
vorm van XlsxCellValue uit @betteroffice/xlsx zodat de Node-proef direct kan vergelijken.
Niet-ondersteunde functies geven #NAME?, zoals Excel bij een onbekende functienaam doet; voor
functies die Excel wel kent maar deze evaluator niet, stopt het programma met een foutmelding.
"""
import argparse
from decimal import Decimal, ROUND_HALF_UP
import json
import re
import sys
import zipfile
from xml.etree import ElementTree as ET

M = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
R_ID = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'
PKG = '{http://schemas.openxmlformats.org/package/2006/relationships}'
# Functies die Excel kent maar die hier bewust niet zijn nagebouwd: dan liever stoppen dan raden.
EXCEL_NIET_NAGEBOUWD = {'RAND', 'NOW', 'TODAY', 'INDIRECT', 'OFFSET'}
MAX_INHOUD = 100 * 1024 * 1024


class Fout:
    def __init__(self, code):
        self.code = code

    def __eq__(self, ander):
        return isinstance(ander, Fout) and ander.code == self.code

    def __repr__(self):
        return f'Fout({self.code})'


class NietNagebouwd(Exception):
    pass


def kolomnummer(letters):
    n = 0
    for teken in letters:
        n = n * 26 + ord(teken) - 64
    return n


def kolomnaam(n):
    naam = ''
    while n:
        n, rest = divmod(n - 1, 26)
        naam = chr(65 + rest) + naam
    return naam


def splits(ref):
    m = re.fullmatch(r'\$?([A-Z]{1,3})\$?(\d+)', ref)
    if not m:
        raise ValueError(f'Ongeldige celverwijzing: {ref}')
    return int(m.group(2)), kolomnummer(m.group(1))


def lees_werkboek(pad, met_opgeslagen_uitkomsten=False):
    """Geeft {'bladen': [...], 'cellen': {(blad, A1): waarde}, 'formules': {...}, 'namen': {...}}."""
    with zipfile.ZipFile(pad) as archief:
        if sum(i.file_size for i in archief.infolist()) > MAX_INHOUD:
            raise ValueError('Uitgepakte inhoud is groter dan 100 MiB.')
        lees = lambda deel: ET.fromstring(archief.read(deel))
        werkboek = lees('xl/workbook.xml')
        rels = {r.get('Id'): r.get('Target') for r in lees('xl/_rels/workbook.xml.rels').iter(PKG + 'Relationship')}
        gedeeld = []
        if 'xl/sharedStrings.xml' in archief.namelist():
            for si in lees('xl/sharedStrings.xml').iter(M + 'si'):
                gedeeld.append(''.join(t.text or '' for t in si.iter(M + 't')))
        bladen, cellen, formules = [], {}, {}
        for blad in werkboek.iter(M + 'sheet'):
            naam, doel = blad.get('name'), rels[blad.get(R_ID)]
            doel = doel.lstrip('/') if doel.startswith('/') else 'xl/' + doel
            bladen.append(naam)
            gedeelde_formules = {}
            for c in lees(doel).iter(M + 'c'):
                ref, soort = c.get('r'), c.get('t', 'n')
                f, v = c.find(M + 'f'), c.find(M + 'v')
                if f is not None:
                    tekst = f.text
                    if f.get('t') == 'shared':
                        if tekst:
                            gedeelde_formules[f.get('si')] = (ref, tekst)
                        elif not met_opgeslagen_uitkomsten:
                            raise NietNagebouwd('Gedeelde formules zonder eigen tekst worden niet ondersteund.')
                    formules[(naam, ref)] = tekst
                    if not met_opgeslagen_uitkomsten:
                        continue
                if soort == 'inlineStr':
                    cellen[(naam, ref)] = ''.join(t.text or '' for t in c.iter(M + 't'))
                elif v is None:
                    continue
                elif soort == 's':
                    cellen[(naam, ref)] = gedeeld[int(v.text)]
                elif soort == 'str':
                    cellen[(naam, ref)] = v.text or ''
                elif soort == 'b':
                    cellen[(naam, ref)] = v.text == '1'
                elif soort == 'e':
                    cellen[(naam, ref)] = Fout(v.text)
                else:
                    cellen[(naam, ref)] = float(v.text)
        namen = {}
        for d in werkboek.iter(M + 'definedName'):
            if d.get('localSheetId') is None:
                namen[d.get('name').upper()] = d.text
        return {'bladen': bladen, 'cellen': cellen, 'formules': formules, 'namen': namen}


TOKEN = re.compile(r'''
    (?P<spatie>\s+)
  | (?P<tekst>"(?:[^"]|"")*")
  | (?P<fout>\#DIV/0!|\#N/A|\#NAME\?|\#NULL!|\#NUM!|\#REF!|\#VALUE!)
  | (?P<ref>(?:(?P<blad>'(?:[^']|'')+'|[A-Za-z_][A-Za-z0-9_.]*)!)?(?P<a>\$?[A-Z]{1,3}\$?\d+)(?::(?P<b>\$?[A-Z]{1,3}\$?\d+))?(?![A-Za-z0-9_(]))
  | (?P<getal>\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\.\d+)
  | (?P<naam>[A-Za-z_][A-Za-z0-9_.]*)
  | (?P<op><>|<=|>=|[-+*/^&=<>%(),])
''', re.VERBOSE)


def tokens(formule):
    pos, uit = 0, []
    while pos < len(formule):
        m = TOKEN.match(formule, pos)
        if not m:
            raise ValueError(f'Onleesbare formule bij positie {pos}: {formule}')
        pos = m.end()
        soort = m.lastgroup if m.lastgroup not in ('blad', 'a', 'b') else 'ref'
        if m.group('ref'):
            soort = 'ref'
        if soort == 'spatie':
            continue
        uit.append((soort, m))
    return uit


class Parser:
    def __init__(self, formule):
        self.t, self.i = tokens(formule), 0

    def kijk(self, *waarden):
        if self.i < len(self.t) and self.t[self.i][0] == 'op' and self.t[self.i][1].group() in waarden:
            return self.t[self.i][1].group()
        return None

    def neem(self):
        self.i += 1
        return self.t[self.i - 1]

    def ontleed(self):
        boom = self.vergelijking()
        if self.i != len(self.t):
            raise ValueError('Onverwachte rest in formule.')
        return boom

    def vergelijking(self):
        links = self.samenvoeging()
        while op := self.kijk('=', '<>', '<', '>', '<=', '>='):
            self.neem()
            links = ('bin', op, links, self.samenvoeging())
        return links

    def samenvoeging(self):
        links = self.optelling()
        while self.kijk('&'):
            self.neem()
            links = ('bin', '&', links, self.optelling())
        return links

    def optelling(self):
        links = self.vermenigvuldiging()
        while op := self.kijk('+', '-'):
            self.neem()
            links = ('bin', op, links, self.vermenigvuldiging())
        return links

    def vermenigvuldiging(self):
        links = self.macht()
        while op := self.kijk('*', '/'):
            self.neem()
            links = ('bin', op, links, self.macht())
        return links

    def macht(self):
        links = self.procent()
        while self.kijk('^'):
            self.neem()
            links = ('bin', '^', links, self.procent())
        return links

    def procent(self):
        waarde = self.eenledig()
        while self.kijk('%'):
            self.neem()
            waarde = ('bin', '/', waarde, ('getal', 100.0))
        return waarde

    def eenledig(self):
        if op := self.kijk('-', '+'):
            self.neem()
            waarde = self.eenledig()
            return ('neg', waarde) if op == '-' else waarde
        return self.primair()

    def primair(self):
        soort, m = self.neem()
        if soort == 'getal':
            return ('getal', float(m.group()))
        if soort == 'tekst':
            return ('tekst', m.group()[1:-1].replace('""', '"'))
        if soort == 'fout':
            return ('fout', m.group())
        if soort == 'ref':
            blad = m.group('blad')
            if blad and blad.startswith("'"):
                blad = blad[1:-1].replace("''", "'")
            return ('ref', blad, m.group('a').replace('$', ''), (m.group('b') or '').replace('$', '') or None)
        if soort == 'naam':
            naam = m.group()
            if self.kijk('('):
                self.neem()
                argumenten = []
                if not self.kijk(')'):
                    argumenten.append(self.vergelijking())
                    while self.kijk(','):
                        self.neem()
                        argumenten.append(self.vergelijking())
                if not self.kijk(')'):
                    raise ValueError('Ontbrekend sluithaakje.')
                self.neem()
                return ('functie', naam, argumenten)
            if naam.upper() in ('TRUE', 'FALSE'):
                return ('bool', naam.upper() == 'TRUE')
            return ('naam', naam)
        if soort == 'op' and m.group() == '(':
            binnen = self.vergelijking()
            if not self.kijk(')'):
                raise ValueError('Ontbrekend sluithaakje.')
            self.neem()
            return binnen
        raise ValueError(f'Onverwacht teken: {m.group()}')


def excel_afronden(x, cijfers):
    """ROUND zoals Excel: eerst naar 15 significante cijfers, dan half van nul af."""
    d = Decimal(format(x, '.15g'))
    stap = Decimal(1).scaleb(-int(cijfers))
    return float(d.quantize(stap, rounding=ROUND_HALF_UP))


def als_getal(w):
    if isinstance(w, Fout):
        return w
    if w is None:
        return 0.0
    if isinstance(w, bool):
        return float(w)
    if isinstance(w, float):
        return w
    try:
        return float(w)
    except ValueError:
        return Fout('#VALUE!')


def als_tekst(w):
    if w is None:
        return ''
    if isinstance(w, bool):
        return 'TRUE' if w else 'FALSE'
    if isinstance(w, float):
        return str(int(w)) if w.is_integer() else format(w, '.15g')
    return w


def als_bool(w):
    if isinstance(w, Fout):
        return w
    if isinstance(w, str):
        if w.upper() in ('TRUE', 'FALSE'):
            return w.upper() == 'TRUE'
        return Fout('#VALUE!')
    return bool(als_getal(w))


class Bereken:
    def __init__(self, werkboek, wijzigingen=None):
        self.cellen = dict(werkboek['cellen'])
        self.formules = dict(werkboek['formules'])
        self.namen = werkboek['namen']
        for (blad, ref), invoer in (wijzigingen or {}).items():
            self.formules.pop((blad, ref), None)
            self.cellen[(blad, ref)] = invoer_waarde(invoer)
        self.klaar, self.bezig = {}, set()

    def cel(self, blad, ref):
        sleutel = (blad, ref)
        if sleutel in self.formules:
            if sleutel not in self.klaar:
                if sleutel in self.bezig:
                    raise NietNagebouwd(f'Kringverwijzing bij {blad}!{ref}')
                self.bezig.add(sleutel)
                self.klaar[sleutel] = self.evalueer(Parser(self.formules[sleutel]).ontleed(), blad)
                self.bezig.discard(sleutel)
            return self.klaar[sleutel]
        return self.cellen.get(sleutel)

    def bereik(self, blad, a, b):
        r1, k1 = splits(a)
        r2, k2 = splits(b)
        return [[self.cel(blad, f'{kolomnaam(k)}{r}') for k in range(min(k1, k2), max(k1, k2) + 1)]
                for r in range(min(r1, r2), max(r1, r2) + 1)]

    def evalueer(self, knoop, blad):
        soort = knoop[0]
        if soort in ('getal', 'tekst', 'bool'):
            return knoop[1]
        if soort == 'fout':
            return Fout(knoop[1])
        if soort == 'ref':
            doel = knoop[1] or blad
            return self.bereik(doel, knoop[2], knoop[3]) if knoop[3] else self.cel(doel, knoop[2])
        if soort == 'naam':
            definitie = self.namen.get(knoop[1].upper())
            if definitie is None:
                return Fout('#NAME?')
            return self.evalueer(Parser(definitie).ontleed(), blad)
        if soort == 'neg':
            w = als_getal(self.scalair(self.evalueer(knoop[1], blad)))
            return w if isinstance(w, Fout) else -w
        if soort == 'bin':
            return self.binair(knoop[1], self.scalair(self.evalueer(knoop[2], blad)),
                               self.scalair(self.evalueer(knoop[3], blad)))
        if soort == 'functie':
            return self.functie(knoop[1], knoop[2], blad)
        raise ValueError(soort)

    @staticmethod
    def scalair(w):
        if isinstance(w, list):
            return w[0][0] if len(w) == 1 and len(w[0]) == 1 else Fout('#VALUE!')
        return w

    @staticmethod
    def binair(op, a, b):
        for w in (a, b):
            if isinstance(w, Fout):
                return w
        if op == '&':
            return als_tekst(a) + als_tekst(b)
        if op in ('=', '<>', '<', '>', '<=', '>='):
            def sleutel(w):
                if w is None:
                    return (0, 0.0)
                if isinstance(w, bool):
                    return (2, w)
                if isinstance(w, str):
                    return (1, w.lower())
                return (0, w)
            x, y = sleutel(a), sleutel(b)
            return {'=': x == y, '<>': x != y, '<': x < y, '>': x > y, '<=': x <= y, '>=': x >= y}[op]
        x, y = als_getal(a), als_getal(b)
        for w in (x, y):
            if isinstance(w, Fout):
                return w
        if op == '+':
            return x + y
        if op == '-':
            return x - y
        if op == '*':
            return x * y
        if op == '/':
            return Fout('#DIV/0!') if y == 0 else x / y
        if op == '^':
            return x ** y
        raise ValueError(op)

    def waarden(self, argumenten, blad):
        """Getallen uit bereiken (tekst/leeg overgeslagen) en losse argumenten (omgezet)."""
        uit = []
        for arg in argumenten:
            w = self.evalueer(arg, blad)
            if isinstance(w, list):
                for rij in w:
                    for x in rij:
                        if isinstance(x, Fout):
                            return x
                        if isinstance(x, float):
                            uit.append(x)
            else:
                x = als_getal(w)
                if isinstance(x, Fout):
                    return x
                uit.append(x)
        return uit

    def functie(self, naam, argumenten, blad):
        naam = naam.upper()
        if naam.startswith('_XLUDF.'):
            return Fout('#NAME?')
        for voorvoegsel in ('_XLFN._XLWS.', '_XLFN.', '_XLWS.'):
            if naam.startswith(voorvoegsel):
                naam = naam[len(voorvoegsel):]
        ev = lambda i: self.evalueer(argumenten[i], blad)
        if naam in ('SUM', 'AVERAGE', 'MIN', 'MAX'):
            w = self.waarden(argumenten, blad)
            if isinstance(w, Fout):
                return w
            if naam == 'SUM':
                return float(sum(w))
            if naam == 'AVERAGE':
                return Fout('#DIV/0!') if not w else sum(w) / len(w)
            return (min(w) if naam == 'MIN' else max(w)) if w else 0.0
        if naam == 'COUNT':
            teller = 0
            for arg in argumenten:
                w = self.evalueer(arg, blad)
                cellen = [x for rij in w for x in rij] if isinstance(w, list) else [w]
                teller += sum(1 for x in cellen if isinstance(x, float) and not isinstance(x, bool))
            return float(teller)
        if naam == 'IF':
            voorwaarde = als_bool(self.scalair(ev(0)))
            if isinstance(voorwaarde, Fout):
                return voorwaarde
            if voorwaarde:
                return self.scalair(ev(1))
            return self.scalair(ev(2)) if len(argumenten) > 2 else False
        if naam == 'ROUND':
            x, n = als_getal(self.scalair(ev(0))), als_getal(self.scalair(ev(1)))
            for w in (x, n):
                if isinstance(w, Fout):
                    return w
            return excel_afronden(x, n)
        if naam == 'IFERROR':
            w = self.scalair(ev(0))
            return self.scalair(ev(1)) if isinstance(w, Fout) else w
        if naam == 'ISERROR':
            return isinstance(self.scalair(ev(0)), Fout)
        if naam == 'NA':
            return Fout('#N/A')
        if naam == 'FACT':
            x = als_getal(self.scalair(ev(0)))
            if isinstance(x, Fout):
                return x
            if x < 0:
                return Fout('#NUM!')
            uitkomst = 1.0
            for i in range(2, int(x) + 1):
                uitkomst *= i
            return uitkomst
        if naam == 'VLOOKUP':
            zoek, tabel, kolom = self.scalair(ev(0)), ev(1), als_getal(self.scalair(ev(2)))
            exact = len(argumenten) > 3 and not als_bool(self.scalair(ev(3)))
            if not exact:
                raise NietNagebouwd('VLOOKUP met benadering wordt niet nagebouwd.')
            for rij in tabel:
                if self.binair('=', rij[0], zoek) is True:
                    return rij[int(kolom) - 1]
            return Fout('#N/A')
        if naam == 'XLOOKUP':
            zoek, bron, doel = self.scalair(ev(0)), ev(1), ev(2)
            bron = [x for rij in bron for x in rij]
            doel = [x for rij in doel for x in rij]
            for i, x in enumerate(bron):
                if self.binair('=', x, zoek) is True:
                    return doel[i]
            return Fout('#N/A')
        if naam == 'TEXTJOIN':
            scheiding, leeg_overslaan = als_tekst(self.scalair(ev(0))), als_bool(self.scalair(ev(1)))
            delen = []
            for arg in argumenten[2:]:
                w = self.evalueer(arg, blad)
                for x in ([y for rij in w for y in rij] if isinstance(w, list) else [w]):
                    if isinstance(x, Fout):
                        return x
                    if leeg_overslaan and (x is None or x == ''):
                        continue
                    delen.append(als_tekst(x))
            return scheiding.join(delen)
        if naam in EXCEL_NIET_NAGEBOUWD:
            raise NietNagebouwd(f'{naam} is een bestaande Excel-functie die deze evaluator niet nabouwt.')
        return Fout('#NAME?')


def invoer_waarde(invoer):
    """Gebruikersinvoer zoals een Engelstalige rekenkern die leest: punt als decimaalteken."""
    if re.fullmatch(r'[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?', invoer.strip()):
        return float(invoer)
    if invoer.upper() in ('TRUE', 'FALSE'):
        return invoer.upper() == 'TRUE'
    return invoer


def als_json(w):
    if isinstance(w, list):
        w = Bereken.scalair(w)
    if isinstance(w, Fout):
        return {'soort': 'error', 'waarde': w.code}
    if w is None:
        return {'soort': 'empty', 'waarde': None}
    if isinstance(w, bool):
        return {'soort': 'bool', 'waarde': w}
    if isinstance(w, float):
        return {'soort': 'number', 'waarde': w}
    return {'soort': 'text', 'waarde': w}


def verwacht(pad, wijzigingen=None):
    """Bereken alle formulecellen; sleutel 'Blad!A1'."""
    werkboek = lees_werkboek(pad)
    rekenaar = Bereken(werkboek, wijzigingen)
    return {f'{blad}!{ref}': als_json(rekenaar.cel(blad, ref)) for (blad, ref) in sorted(rekenaar.formules, key=lambda s: (werkboek['bladen'].index(s[0]), splits(s[1])))}


def opgeslagen(pad):
    """Lees een engine-export ná herberekening; dit zijn gemeten uitkomsten, geen verwachtingen."""
    werkboek = lees_werkboek(pad, met_opgeslagen_uitkomsten=True)
    return {f'{blad}!{ref}': als_json(werkboek['cellen'].get((blad, ref)))
            for blad, ref in werkboek['formules']}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('bestand')
    parser.add_argument('--wijzig', action='append', default=[], metavar='BLAD!CEL=INVOER')
    parser.add_argument('--opgeslagen', action='store_true', help='Lees gemeten exportwaarden; rekent niet en bewijst geen juistheid.')
    args = parser.parse_args()
    wijzigingen = {}
    for item in args.wijzig:
        doel, invoer = item.split('=', 1)
        blad, ref = doel.rsplit('!', 1)
        wijzigingen[(blad, ref)] = invoer
    try:
        if args.opgeslagen and wijzigingen:
            raise ValueError('Opgeslagen waarden lezen kan niet met een rekenwijziging worden gecombineerd.')
        print(json.dumps(opgeslagen(args.bestand) if args.opgeslagen else verwacht(args.bestand, wijzigingen), ensure_ascii=False, indent=1))
    except (NietNagebouwd, ValueError, KeyError, zipfile.BadZipFile) as fout:
        print(json.dumps({'fout': str(fout)}, ensure_ascii=False), file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
