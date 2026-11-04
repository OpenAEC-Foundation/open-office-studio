"""Controleer echte lettertypevragen en onafhankelijke DOCX-opmaak na heropenen."""
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET


async def controleer(p, uitvoer, resultaat=None):
    bron = Path(__file__).with_suffix('.js')
    r = await p.run('return await ('+bron.read_text()+');', t=150)
    js_geslaagd = r['geslaagd']
    r['geslaagd'] = False
    if resultaat is not None:
        resultaat.update(r)
        r = resultaat
    r['script_sha256'] = hashlib.sha256(bron.read_bytes()).hexdigest()
    r['python_sha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    r['grens'] = 'Volledige worker-/hostantwoorden op dezelfde actuele bron; vier fontopmaakvarianten, onafhankelijk XML en bronexacte Undo. Na de invoermeting; geen snelheidsmeting.'
    ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    w = '{'+ns['w']+'}'
    for geval in r['gevallen']:
        data = bytes(geval.pop('docx'))
        pad = uitvoer/('Lettertype-'+geval['naam']+'.docx')
        pad.write_bytes(data)
        with ZipFile(pad) as z:
            xml = ET.fromstring(z.read('word/document.xml'))
        teksten = [''.join(t.text or '' for t in e.findall('.//w:t', ns)) for e in xml.findall('w:body/w:p', ns)]
        assert len(teksten) == r['alinea_aantal'], 'Lettertypevariant verliest documentalinea’s'
        som = hashlib.sha256(json.dumps(teksten, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
        assert som == r['tekst_sha256'], 'Lettertypevariant wijzigt de volledige documenttekst'
        eerste = xml.find('w:body/w:p', ns)
        tekstruns = [e for e in eerste.findall('.//w:r', ns) if any(t.text for t in e.findall('w:t', ns))]
        assert tekstruns, 'Lettertypevariant bevat geen tekst'
        if geval.get('familie'):
            for run in tekstruns:
                fonts = run.find('w:rPr/w:rFonts', ns)
                assert fonts is not None and fonts.get(w+'ascii') == geval['familie'], 'DOCX verliest gekozen lettertype'
        else:
            tag = 'b' if geval['stijl'] == 'bold' else 'i'
            for run in tekstruns:
                stijl = run.find('w:rPr/w:'+tag, ns)
                assert stijl is not None and stijl.get(w+'val') not in ['0', 'false', 'off'], 'DOCX verliest gekozen letterstijl'
        geval.update(bestand=pad.name, sha256=hashlib.sha256(data).hexdigest(), xml_exact=True, volledige_tekst_exact=True)
    assert js_geslaagd, r.get('fout', 'Lettertypeproef niet geslaagd')
    r['geslaagd'] = True
    return r
