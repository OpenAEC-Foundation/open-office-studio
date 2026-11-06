"""Onafhankelijke kenmerk- en inhoudscontrole voor de testmatrix (D1–D3, P1–P3).

Alleen Python-standaardbibliotheek. Leest OOXML-onderdelen en relaties en gaat
per kenmerk na of het nog aanwezig is. Rapporten bevatten alleen
onderdeelnamen, aantallen, hashes en de eigen synthetische testzinnen uit
scripts/maak-matrixfixtures.py; geen inhoud van praktijkdocumenten.

Gebruik:
  python3 scripts/matrix_kenmerken.py kenmerken BESTAND
  python3 scripts/matrix_kenmerken.py rapport [.local/matrix/documenten]
"""
import hashlib
import importlib.util
import json
from pathlib import Path, PurePosixPath
import posixpath
import sys
import xml.etree.ElementTree as ET
import zipfile

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
A = '{http://schemas.openxmlformats.org/drawingml/2006/main}'
P = '{http://schemas.openxmlformats.org/presentationml/2006/main}'
C = '{http://schemas.openxmlformats.org/drawingml/2006/chart}'
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
PR = '{http://schemas.openxmlformats.org/package/2006/relationships}'
CTN = '{http://schemas.openxmlformats.org/package/2006/content-types}'
OPENAEC = '{urn:openaec:matrix}'
REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/'

_spec = importlib.util.spec_from_file_location('vergelijk_pakketten', Path(__file__).with_name('vergelijk_pakketten.py'))
pakketten = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pakketten)


class Pakket:
    def __init__(self, pad):
        self.pad = Path(pad)
        pakketten.lees_pakket(self.pad)  # zelfde grenzen en padcontroles als de pakketvergelijking
        with zipfile.ZipFile(self.pad) as z:
            self.delen = {i.filename: z.read(i) for i in z.infolist() if not i.is_dir()}
        self._xml = {}

    def xml(self, naam):
        if naam not in self.delen:
            return None
        if naam not in self._xml:
            self._xml[naam] = ET.fromstring(self.delen[naam])
        return self._xml[naam]

    def relaties(self, deel):
        """[(id, type, doelpad)] voor een onderdeel; doelen opgelost binnen het pakket."""
        map_, naam = posixpath.split(deel)
        rels = self.xml(posixpath.join(map_, '_rels', naam + '.rels'))
        if rels is None:
            return []
        uit = []
        for r in rels.iter(PR + 'Relationship'):
            doel = r.get('Target', '')
            if r.get('TargetMode') == 'External':
                uit.append((r.get('Id'), r.get('Type'), None))
                continue
            pad = doel.lstrip('/') if doel.startswith('/') else posixpath.normpath(posixpath.join(map_, doel))
            uit.append((r.get('Id'), r.get('Type'), pad))
        return uit

    def rel_doelen(self, deel, soort):
        return [d for _, t, d in self.relaties(deel) if t == REL + soort and d in self.delen]

    def inhoudstype(self, deel):
        typen = self.xml('[Content_Types].xml')
        for o in typen.iter(CTN + 'Override'):
            if o.get('PartName', '').lstrip('/') == deel:
                return o.get('ContentType')
        ext = PurePosixPath(deel).suffix.lstrip('.').lower()
        for d in typen.iter(CTN + 'Default'):
            if d.get('Extension', '').lower() == ext:
                return d.get('ContentType')
        return None


def _hoofd(pakket):
    for deel in ('word/document.xml', 'ppt/presentation.xml'):
        if deel in pakket.delen:
            return deel
    raise ValueError('Geen DOCX- of PPTX-hoofdonderdeel.')


def docx_kenmerken(pk):
    doc = 'word/document.xml'
    body = pk.xml(doc)
    koppen = [d for d in pk.rel_doelen(doc, 'header')]
    voeten = [d for d in pk.rel_doelen(doc, 'footer')]
    sectprs = list(body.iter(W + 'sectPr'))
    stijlen = pk.xml('word/styles.xml')
    kopstijlen = {s.get(W + 'styleId') for s in stijlen.iter(W + 'style')
                  if s.find(f'{W}pPr/{W}outlineLvl') is not None} if stijlen is not None else set()
    gebruikte_koppen = [p for p in body.iter(W + 'pStyle') if p.get(W + 'val') in kopstijlen]

    def veld(deel, woord):
        x = pk.xml(deel)
        instr = [f.get(W + 'instr', '') for f in x.iter(W + 'fldSimple')] + [t.text or '' for t in x.iter(W + 'instrText')]
        return any(woord in i.split() for i in instr)

    def blip_bestaat(deel):
        x = pk.xml(deel)
        rels = {i: d for i, t, d in pk.relaties(deel) if t == REL + 'image'}
        return any(rels.get(b.get(R + 'embed')) in pk.delen for b in x.iter(A + 'blip'))

    liggend = any((s.find(W + 'pgSz') is not None and s.find(W + 'pgSz').get(W + 'orient') == 'landscape'
                   and int(s.find(W + 'pgSz').get(W + 'w', 0)) > int(s.find(W + 'pgSz').get(W + 'h', 0))) for s in sectprs)
    opm = pk.rel_doelen(doc, 'comments')
    noten = pk.rel_doelen(doc, 'footnotes')
    cx = pk.rel_doelen(doc, 'customXml')
    onbekend = [d for _, t, d in pk.relaties(doc) if t and not t.startswith(REL) and d in pk.delen]
    voetnoot_ids = {f.get(W + 'id') for f in pk.xml(noten[0]).iter(W + 'footnote')} if noten else set()
    return {
        'koppen': len(gebruikte_koppen) > 0,
        'koptekst_relatie': bool(koppen) and any(s.find(W + 'headerReference') is not None for s in sectprs),
        'voettekst_relatie': bool(voeten) and any(s.find(W + 'footerReference') is not None for s in sectprs),
        'briefpapier_logo_in_koptekst': any(blip_bestaat(k) for k in koppen),
        'paginanummerveld': any(veld(v, 'PAGE') for v in voeten),
        'tabellen': sum(1 for _ in body.iter(W + 'tbl')),
        'afbeelding_in_hoofdtekst': blip_bestaat(doc),
        'secties': len(sectprs),
        'liggende_sectie': liggend,
        'opmerkingen': bool(opm) and any(True for _ in pk.xml(opm[0]).iter(W + 'comment')) and any(True for _ in body.iter(W + 'commentReference')),
        'revisie_invoeging': sum(1 for _ in body.iter(W + 'ins')),
        'revisie_verwijdering': sum(1 for _ in body.iter(W + 'del')),
        'voetnoten': bool(noten) and any(i not in ('-1', '0') for i in voetnoot_ids) and any(True for _ in body.iter(W + 'footnoteReference')),
        'custom_xml_onderdeel': bool(cx),
        'custom_xml_eigenschappen': any(pk.rel_doelen(c, 'customXmlProps') for c in cx),
        'onbekend_onderdeel_met_relatie': bool(onbekend),
        'onbekend_onderdeel_inhoudstype': any(pk.inhoudstype(d) == 'application/vnd.openaec.matrix+xml' for d in onbekend),
        'onbekend_element_in_hoofdtekst': sum(1 for _ in body.iter(OPENAEC + 'markering')),
    }


def pptx_kenmerken(pk):
    pres = 'ppt/presentation.xml'
    masters = pk.rel_doelen(pres, 'slideMaster')
    dias = pk.rel_doelen(pres, 'slide')
    lay_outs = [l for m in masters for l in pk.rel_doelen(m, 'slideLayout')]
    themas = [t for m in masters for t in pk.rel_doelen(m, 'theme')]
    thema = pk.xml(themas[0]) if themas else None
    lettertypen = sorted({l.get('typeface') for l in thema.iter(A + 'latin')}) if thema is not None else []
    uit = {'masters': len(masters), 'lay_outs': len(lay_outs), 'thema': bool(themas),
           'thema_lettertypen': ','.join(lettertypen), 'dia_lettertype_expliciet': False,
           'afbeelding': False, 'grafiek': False, 'tabel': False, 'sprekersnotities': False,
           'notitiemaster': bool(pk.rel_doelen(pres, 'notesMaster')), 'animatie': False, 'overgang': False,
           'ingebed_object': False, 'ole_verwijzing': False, 'onbekende_extensie_op_dia': 0,
           'onbekend_onderdeel_met_relatie': any(t and not t.startswith(REL) and d in pk.delen for _, t, d in pk.relaties(pres)),
           'onbekend_onderdeel_inhoudstype': any(pk.inhoudstype(d) == 'application/vnd.openaec.matrix+xml'
                                                 for _, t, d in pk.relaties(pres) if t and not t.startswith(REL))}
    for dia in dias:
        x = pk.xml(dia)
        rels = {i: (t, d) for i, t, d in pk.relaties(dia)}
        uit['dia_lettertype_expliciet'] |= any(l.get('typeface') == 'Georgia' for l in x.iter(A + 'latin'))
        uit['afbeelding'] |= any(rels.get(b.get(R + 'embed'), (None, None))[1] in pk.delen for b in x.iter(A + 'blip'))
        uit['grafiek'] |= any(rels.get(c.get(R + 'id'), (None, None))[1] in pk.delen
                              and pk.xml(rels[c.get(R + 'id')][1]).find(f'.//{C}barChart') is not None for c in x.iter(C + 'chart'))
        uit['tabel'] |= x.find(f'.//{A}tbl') is not None
        notities = pk.rel_doelen(dia, 'notesSlide')
        uit['sprekersnotities'] |= any('sprekersnotitie' in ''.join(t.text or '' for t in pk.xml(n).iter(A + 't')) for n in notities)
        timing = x.find(P + 'timing')
        ids = {c.get('id') for c in x.iter(P + 'cNvPr')}
        uit['animatie'] |= timing is not None and any(s.get('spid') in ids for s in timing.iter(P + 'spTgt'))
        uit['overgang'] |= x.find(P + 'transition') is not None
        ole = list(x.iter(P + 'oleObj'))
        uit['ole_verwijzing'] |= bool(ole)
        uit['ingebed_object'] |= any(rels.get(o.get(R + 'id'), (None, None))[1] in pk.delen for o in ole)
        uit['onbekende_extensie_op_dia'] += sum(1 for _ in x.iter(OPENAEC + 'markering'))
    return uit


def kenmerken(pad):
    pk = Pakket(pad)
    return docx_kenmerken(pk) if _hoofd(pk) == 'word/document.xml' else pptx_kenmerken(pk)


def alineateksten(pad):
    """{onderdeel: [alineatekst]} voor tekstonderdelen; w:delText telt mee."""
    pk = Pakket(pad)
    uit = {}
    for naam in sorted(pk.delen):
        if not naam.endswith('.xml') or naam.startswith('customXml/'):
            continue
        if naam.startswith('word/'):
            x = pk.xml(naam)
            ps = [''.join(t.text or '' for t in p.iter() if t.tag in (W + 't', W + 'delText')) for p in x.iter(W + 'p')]
        elif naam.startswith(('ppt/slides/', 'ppt/notesSlides/', 'ppt/charts/')):
            x = pk.xml(naam)
            ps = [''.join(t.text or '' for t in p.iter(A + 't')) for p in x.iter(A + 'p')] + [v.text or '' for v in x.iter(C + 'v')]
        else:
            continue
        if any(ps):
            uit[naam] = ps
    return uit


def tekstcontrole(bron, resultaat, bewerking=None):
    """Controleer dat alleen het bedoelde fragment wijzigde (alineaniveau)."""
    voor, na = alineateksten(bron), alineateksten(resultaat)
    afwijkend, verdwenen = [], []
    for deel, alineas in voor.items():
        verwacht = alineas
        if bewerking and deel == bewerking['onderdeel']:
            verwacht = [a.replace(bewerking['oud'], bewerking['nieuw']) for a in alineas]
        if deel not in na:
            verdwenen.append(deel)
        elif [a for a in na[deel] if a] != [a for a in verwacht if a]:
            afwijkend.append(deel)
    toegevoegd = sorted(set(na) - set(voor))
    hernoemd = {}
    for deel in list(verdwenen):
        # Een suite kan kop-/voetteksten onder een andere naam wegschrijven.
        inhoud = [a for a in voor[deel] if a]
        kandidaat = next((t for t in toegevoegd if t not in hernoemd.values() and [a for a in na[t] if a] == inhoud), None)
        if kandidaat:
            hernoemd[deel] = kandidaat
            verdwenen.remove(deel)
    alles = '\n'.join('\n'.join(v) for v in na.values())
    uit = {'onderdelen_met_afwijkende_tekst': afwijkend, 'tekstonderdelen_verdwenen': verdwenen,
           'tekstonderdelen_hernoemd': hernoemd,
           'tekstonderdelen_toegevoegd': [t for t in toegevoegd if t not in hernoemd.values()]}
    if bewerking:
        uit['wijziging_aanwezig'] = alles.count(bewerking['nieuw']) == 1
        uit['oude_fragment_verdwenen'] = bewerking['oud'] not in alles
    uit['overige_tekst_ongewijzigd'] = not afwijkend and not verdwenen
    return uit


def _structuur(element):
    return (element.tag, tuple(sorted(element.attrib.items())), (element.text or '').strip(),
            tuple(_structuur(k) for k in element), (element.tail or '').strip())


def structureel_gelijk(bron, resultaat, bewerking=None):
    """Gewijzigde XML-onderdelen die na parsen gelijk zijn (alleen herschreven:
    attribuutvolgorde, naamruimtedeclaraties, witruimte). Bij het bewerkte
    onderdeel wordt eerst de verwachte vervanging op de bron toegepast."""
    a, b = Pakket(bron), Pakket(resultaat)
    uit = {}
    for deel in sorted(set(a.delen) & set(b.delen)):
        if a.delen[deel] == b.delen[deel] or not deel.endswith(('.xml', '.rels')):
            continue
        tekst = a.delen[deel].decode('utf-8')
        if bewerking and deel == bewerking['onderdeel']:
            tekst = tekst.replace(bewerking['oud'], bewerking['nieuw'])
        try:
            uit[deel] = _structuur(ET.fromstring(tekst.encode('utf-8'))) == _structuur(b.xml(deel))
        except ET.ParseError:
            uit[deel] = False
    return uit


def nootverwijzingen_opmaak(pad):
    """Vergelijk echte verwijzingen met hun runopmaak, ook binnen revisies.

    Alleen aanwezigheid van een noot is onvoldoende: de engine kan het id
    bewaren en toch de tekenstijl, kleur of directe opmaak laten vallen.
    De onderdeelnaam, nootsoort, id en volgorde onderscheiden verwijzingen.
    """
    pk = Pakket(pad)
    uit = {}
    for deel in sorted(pk.delen):
        if not deel.startswith('word/') or not deel.endswith('.xml'):
            continue
        for run in pk.xml(deel).iter(W + 'r'):
            for ref in run:
                if ref.tag not in (W + 'footnoteReference', W + 'endnoteReference'):
                    continue
                sleutel = f"{deel}:{ref.tag[len(W):]}:{ref.get(W + 'id')}"
                opmaak = run.find(W + 'rPr')
                uit.setdefault(sleutel, []).append(_structuur(opmaak) if opmaak is not None else None)
    return uit


def verloren(voor, na):
    """Kenmerken die in de bron aanwezig waren en in het resultaat ontbreken of afnemen."""
    uit = []
    for k, v in voor.items():
        w = na.get(k)
        if isinstance(v, bool) and v and not w:
            uit.append(k)
        elif isinstance(v, int) and not isinstance(v, bool) and v > (w or 0):
            uit.append(k)
        elif isinstance(v, str) and v and v != w:
            uit.append(k)
    return uit


def sha(pad):
    return hashlib.sha256(Path(pad).read_bytes()).hexdigest()


def beoordeel(bron, resultaat, bewerking=None):
    verwacht = [bewerking['onderdeel']] if bewerking else []
    pakket = pakketten.vergelijk(bron, resultaat, verwacht)
    kv, kn = kenmerken(bron), kenmerken(resultaat)
    nv, nn = nootverwijzingen_opmaak(bron), nootverwijzingen_opmaak(resultaat)
    nootafwijkingen = sorted(k for k in nv.keys() | nn.keys() if nv.get(k) != nn.get(k))
    return {'bronhash': sha(bron), 'resulthash': sha(resultaat), 'pakket': pakket,
            'kenmerken_bron': kv, 'kenmerken_resultaat': kn, 'kenmerken_verloren': verloren(kv, kn),
            'nootverwijzingen_opmaak': {'bewaard': not nootafwijkingen, 'afwijkingen': nootafwijkingen},
            'tekst': tekstcontrole(bron, resultaat, bewerking),
            'xml_structureel_gelijk': structureel_gelijk(bron, resultaat, bewerking)}


def rapport(map_):
    map_ = Path(map_)
    resultaten = json.loads((map_ / 'resultaten.json').read_text(encoding='utf-8'))
    manifest = json.loads((map_ / 'bron' / 'manifest.json').read_text(encoding='utf-8'))
    vis_pad = map_ / 'visueel.json'
    visueel = json.loads(vis_pad.read_text(encoding='utf-8')) if vis_pad.exists() else {'status': 'niet gemeten'}
    vis = {(v['geval'], v['route'], v['actie']): v for v in visueel.get('regels', [])}
    uit = []
    for r in resultaten:
        bron = map_ / 'bron' / manifest[r['geval']]['bestand']
        regel = dict(r)
        if r.get('uitvoer'):
            bewerking = manifest[r['geval']]['bewerking'] if r['actie'] == 'bewerking' else None
            regel['beoordeling'] = beoordeel(bron, map_ / r['uitvoer'], bewerking)
            v = vis.get((r['geval'], r['route'], r['actie']))
            regel['visueel'] = ({k: v[k] for k in ('paginas_bron', 'paginas_resultaat', 'verschil_per_pagina', 'fout') if k in v}
                                if v else {'status': visueel.get('status', 'niet gemeten')})
        uit.append(regel)
    (map_ / 'rapport.json').write_text(json.dumps(uit, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return uit


def samenvatting(regels):
    kop = '| Geval | Route | Actie | Pakket | Verdwenen | Toegevoegd | Onverwacht gewijzigd | Verloren kenmerken | Nootopmaak | Tekst | Visueel (max. pixelaandeel) |'
    print(kop)
    print('|---' * (kop.count('|') - 1) + '|')
    for r in regels:
        b = r.get('beoordeling')
        if not b:
            print(f"| {r['geval']} | {r['route']} | {r['actie']} | fout: {r.get('fout', '?')} | | | | | | | |")
            continue
        t = b['tekst']
        tekst = 'ok' if t['overige_tekst_ongewijzigd'] and t.get('wijziging_aanwezig', True) and t.get('oude_fragment_verdwenen', True) else 'afwijking'
        p = b['pakket']
        v = r.get('visueel', {})
        if 'verschil_per_pagina' in v:
            waarden = [x for x in v['verschil_per_pagina'] if x is not None]
            visueel = f"{v['paginas_bron']}→{v['paginas_resultaat']} p., {max(waarden, default=0):.4%}"
        else:
            visueel = v.get('fout') or v.get('status', 'niet gemeten')
        print(f"| {r['geval']} | {r['route']} | {r['actie']} | {p['pakketcontrole']} | {len(p['verwijderd'])} | {len(p['toegevoegd'])} | "
              f"{len(p['onverwacht_gewijzigd'])} | {', '.join(b['kenmerken_verloren']) or '—'} | "
              f"{'ok' if b['nootverwijzingen_opmaak']['bewaard'] else 'afwijking'} | {tekst} | {visueel} |")


def main(argv):
    if len(argv) >= 2 and argv[0] == 'kenmerken':
        print(json.dumps(kenmerken(argv[1]), ensure_ascii=False, indent=2))
        return 0
    if argv and argv[0] == 'rapport':
        regels = rapport(argv[1] if len(argv) > 1 else Path(__file__).resolve().parents[1] / '.local' / 'matrix' / 'documenten')
        samenvatting(regels)
        return 0
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
