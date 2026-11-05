"""Vergelijk bewaarde plakresultaten, met alleen aantoonbaar gelijke standaardmarges."""
import argparse
import hashlib
import json
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
W14 = 'http://schemas.microsoft.com/office/word/2010/wordml'
NS = {'w': W}


def lees(pad):
    with ZipFile(pad) as z:
        stijlen = z.read('word/styles.xml')
        body = ET.fromstring(z.read('word/document.xml')).find('w:body', NS)
    assert body is not None
    vluchtig = {f'{{{W14}}}{k}' for k in ['paraId', 'textId']}
    vluchtig.update(f'{{{W}}}{k}' for k in ['rsidR', 'rsidRDefault', 'rsidRPr', 'rsidP'])
    for el in body.iter():
        for k in list(el.attrib):
            if k in vluchtig:
                del el.attrib[k]
    return body, stijlen


def marges(el):
    return {d.tag: dict(d.attrib) for d in el} if el is not None else {}


def vergelijk(voor, na):
    a, stijlen_a = lees(voor)
    b, stijlen_b = lees(na)
    assert stijlen_a == stijlen_b, 'Stijlendefinities verschillen'
    stijlen = ET.fromstring(stijlen_a).findall('w:style', NS)
    per_id = {s.get(f'{{{W}}}styleId'): s for s in stijlen}
    standaard = next((s.get(f'{{{W}}}styleId') for s in stijlen if s.get(f'{{{W}}}type') == 'table' and s.get(f'{{{W}}}default') == '1'), None)

    def geerfd(sleutel, gezien=None):
        gezien = set() if gezien is None else gezien
        assert sleutel not in gezien, 'Cyclische tabelstijl'
        gezien.add(sleutel)
        stijl = per_id.get(sleutel)
        assert stijl is not None, 'Tabelstijl ontbreekt'
        ouder = stijl.find('w:basedOn', NS)
        uit = geerfd(ouder.get(f'{{{W}}}val'), gezien) if ouder is not None else {}
        uit.update(marges(stijl.find('w:tblPr/w:tblCellMar', NS)))
        return uit

    tabellen_a = list(a.iter(f'{{{W}}}tbl'))
    tabellen_b = list(b.iter(f'{{{W}}}tbl'))
    assert len(tabellen_a) == len(tabellen_b), 'Aantal tabellen verschilt'
    gelijkwaardige = 0
    for oud, nieuw in zip(tabellen_a, tabellen_b):
        oud_m = oud.find('w:tblPr/w:tblCellMar', NS)
        nieuw_m = nieuw.find('w:tblPr/w:tblCellMar', NS)
        if oud_m is not None or nieuw_m is None:
            continue
        stijl = oud.find('w:tblPr/w:tblStyle', NS)
        sleutel = stijl.get(f'{{{W}}}val') if stijl is not None else standaard
        assert sleutel is not None, 'Geen aantoonbare standaardtabelstijl'
        assert marges(nieuw_m) == geerfd(sleutel), 'Nieuwe tabelmarges verschillen van de geërfde marges'
        nieuw.find('w:tblPr', NS).remove(nieuw_m)
        gelijkwaardige += 1
    inhoud_a, inhoud_b = ET.tostring(a), ET.tostring(b)
    assert inhoud_a == inhoud_b, 'Documentinhoud, structuur of opmaak verschilt verder'
    return {'tabellen': len(tabellen_a), 'gelijke_geerfde_marges_expliciet': gelijkwaardige, 'genormaliseerde_body_sha256': hashlib.sha256(inhoud_a).hexdigest()}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--voor', type=Path, required=True)
    p.add_argument('--na', type=Path, required=True)
    p.add_argument('--uitvoer', type=Path, required=True)
    a = p.parse_args()
    rapport = {'geslaagd': False, 'voor_sha256': hashlib.sha256(a.voor.read_bytes()).hexdigest(), 'na_sha256': hashlib.sha256(a.na.read_bytes()).hexdigest()}
    try:
        rapport.update(vergelijk(a.voor, a.na))
        rapport['geslaagd'] = True
    except Exception as e:
        rapport['fout'] = str(e)
        raise
    finally:
        a.uitvoer.write_text(json.dumps(rapport, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
