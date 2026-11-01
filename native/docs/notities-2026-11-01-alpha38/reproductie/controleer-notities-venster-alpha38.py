"""Lees opgeslagen bronmomenten onafhankelijk terug; geen volledige GUI-goedkeuring."""
from pathlib import Path
from PIL import Image
import copy, hashlib, json, sys
from datetime import datetime

map = Path(sys.argv[1])
rapport = json.loads((map/'rapport.json').read_text())
assert rapport['expliciet_gestopt'] and rapport['programma_eindcode'] in (0, -15)
assert 'panicked' not in (map/'programma.log').read_text()
stappen = {s.get('beeldnaam'): s for s in rapport['stappen']}
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
for s in rapport['stappen']:
    b = map/s['beeld']['bestand']
    assert sha(b) == s['beeld']['sha256']
    assert Image.open(b).size == (1440, 900)

def bytes_bij(naam):
    h = stappen[naam]['bron_sha256']
    p = map/('bron-'+h+'.openaec-notities')
    assert sha(p) == h
    return p.read_bytes()

def bij(naam): return json.loads(bytes_bij(naam))
def vak(d): return d['boeken'][0]['secties'][0]['paginas'][0]['vakken'][0]

def vergelijk(werkelijk, verwacht, pagina):
    # Alleen de daadwerkelijk bewerkte pagina krijgt haar gedocumenteerde
    # bijgewerkt-tijd. Alle overige bronvelden blijven exact gecontroleerd.
    a, b = werkelijk, verwacht
    for sleutel in pagina:
        a, b = a[sleutel], b[sleutel]
    oud = datetime.fromisoformat(b['bijgewerkt'].replace('Z', '+00:00'))
    nieuw = datetime.fromisoformat(a['bijgewerkt'].replace('Z', '+00:00'))
    assert nieuw.tzinfo is not None and nieuw >= oud
    b['bijgewerkt'] = a['bijgewerkt']
    assert werkelijk == verwacht

eerste_pagina = ['boeken', 0, 'secties', 0, 'paginas', 0]

origineel = (map/('bron-'+rapport['begindata_sha256']+'.openaec-notities')).read_bytes()
o = json.loads(origineel)
teksten = bij('notities-twee-vakken-bewaarantwoord')
verwacht = copy.deepcopy(o)
vakken = verwacht['boeken'][0]['secties'][0]['paginas'][0]['vakken']
vakken[0]['blokken'][0]['tekst'] = '9'+vakken[0]['blokken'][0]['tekst']
vakken[1]['blokken'][0]['tekst'] = '8'+vakken[1]['blokken'][0]['tekst']
vergelijk(teksten, verwacht, eerste_pagina)
groter = copy.deepcopy(teksten)
vak(groter).update(breedte=620, hoogte=218)
vergelijk(bij('notities-zichtbare-greep-bewaard'), groter, eerste_pagina)
assert bytes_bij('notities-greep-undo-bewaard') == bytes_bij('notities-twee-vakken-bewaarantwoord')
verplaatst = copy.deepcopy(teksten)
vak(verplaatst).update(x=160, y=96)
vergelijk(bij('notities-header-bewaard'), verplaatst, eerste_pagina)
assert bytes_bij('notities-verplaatsen-undo-bewaard') == bytes_bij('notities-twee-vakken-bewaarantwoord')
assert bytes_bij('notities-oorspronkelijk-hersteld') == origineel

md = bij('notities-markdownkopie-bewaard')
secties = md['boeken'][0]['secties']
assert len(secties) == 3 and secties[:2] == o['boeken'][0]['secties']
assert secties[2]['soort'] == 'markdown'
assert secties[2]['paginas'][0]['markdown'] == 'Een vrij tekstvak\n\nEen idee op een andere plek\n'
canvas = bij('notities-canvaskopie-bewaard')
secties = canvas['boeken'][0]['secties']
assert len(secties) == 4 and secties[:3] == md['boeken'][0]['secties']
assert secties[3]['soort'] == 'canvas'
assert secties[3]['paginas'][0]['vakken'][0]['blokken'][0]['tekst'] == md['boeken'][0]['secties'][2]['paginas'][0]['markdown']
for naam in ['notities-markdown-navigatie-volledig', 'notities-markdown-concept-zichtbaar', 'notities-markdown-concept-undo-zichtbaar']:
    assert bytes_bij(naam) == bytes_bij('notities-canvaskopie-bewaard')
assert bytes_bij('notities-canvaskopie-undo-bewaard') == bytes_bij('notities-markdownkopie-bewaard')
assert bytes_bij('notities-alle-kopieen-ongedaan-bewaard') == origineel

pagina = bij('notities-nieuwe-pagina-bewaard')
secties = pagina['boeken'][0]['secties']
assert len(secties) == 2 and secties[1] == o['boeken'][0]['secties'][1]
assert secties[0]['paginas'][:1] == o['boeken'][0]['secties'][0]['paginas']
assert len(secties[0]['paginas']) == 2 and secties[0]['paginas'][1]['titel'] == 'Nieuwe pagina'
hernoemd = copy.deepcopy(pagina)
hernoemd['boeken'][0]['secties'][0]['paginas'][1]['titel'] = 'Eigen notitiepagina9'
vergelijk(bij('notities-nieuwe-pagina-titel-bewaard'), hernoemd, ['boeken', 0, 'secties', 0, 'paginas', 1])
assert bytes_bij('notities-paginatitel-undo-bewaard') == bytes_bij('notities-nieuwe-pagina-bewaard')
assert bytes_bij('notities-nieuwe-pagina-undo-bewaard') == origineel
sectie = bij('notities-nieuwe-sectie-bewaard')['boeken'][0]['secties']
assert len(sectie) == 3 and sectie[:2] == o['boeken'][0]['secties']
assert sectie[2]['naam'] == 'Nieuwe sectie' and sectie[2]['paginas'][0]['titel'] == 'Nieuwe pagina'
assert bytes_bij('notities-nieuwe-sectie-undo-bewaard') == origineel
boeken = bij('notities-nieuw-boek-bewaard')['boeken']
assert len(boeken) == 2 and boeken[:1] == o['boeken']
assert boeken[1]['naam'] == 'Nieuw notitieboek' and boeken[1]['secties'][0]['paginas'][0]['titel'] == 'Nieuwe pagina'
assert bytes_bij('notities-nieuw-boek-undo-bewaard') == origineel
assert (map/'Eigen-notities.openaec-notities').read_bytes() == origineel

uit = {'geslaagd': True, 'broncommit': rapport['broncommit'], 'programma_sha256': rapport['programma_sha256'],
       'omvang': 'Alleen de benoemde Linux-Notities-vensteracties en hun opgeslagen bronmomenten; preview-inhoud vraagt afzonderlijke visuele beoordeling. Geen volledige functie-, platform- of pixelpariteit.',
       'geregistreerde_stappen': len(rapport['stappen']), 'volledige_beelden_gecontroleerd': len(rapport['stappen']),
       'twee_tekstvelden_in_een_transactie': True, 'zichtbare_greep_620_bij_218': True,
       'verplaatsen_160_96': True, 'sectiekopieen_brongetrouw': True, 'handmatige_paginawissel_zonder_crash': True,
       'concept_en_undo_veranderen_de_opgeslagen_bron_niet': True, 'aanmaken_en_paginatitel_op_eigen_doel': True,
       'alle_ongedaan_maken_bronexact': True, 'eindbron_sha256': sha(map/'Eigen-notities.openaec-notities')}
(map/'broncontrole.json').write_text(json.dumps(uit, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(uit, ensure_ascii=False))
