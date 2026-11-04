"""Echte navigatie, zoom, vensterformaat en tabwissels met bronexacte spelling."""
import asyncio
import hashlib
import json
import subprocess
import time
from pathlib import Path


async def controleer(p, venster, display, toets, beeld, uitkomst=None):
    bron = Path(__file__).with_suffix('.js')
    await p.ev(bron.read_text())
    stappen = []
    cache = None
    resultaat = {'geslaagd': False, 'stappen': stappen, 'js_sha256': hashlib.sha256(bron.read_bytes()).hexdigest(), 'python_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), 'grens': 'Volledige foutencache en alle zichtbare golfposities tegen een lineaire referentie, met 0,05 px tolerantie. Geen volledige UI-pixelpariteit.'}
    if uitkomst is not None:
        uitkomst.update(resultaat)
        resultaat = uitkomst

    async def stand(naam, verborgen=False):
        nonlocal cache
        einde = time.monotonic() + 30
        while True:
            r = await p.run('return await _controleerSpellingWeergave();')
            if r.get('gereed') and r.get('verborgen') == verborgen and (r['getekend'] == 0 if verborgen else r['getekend'] == r['verwacht'] > 0):
                break
            assert time.monotonic() < einde, f'Spellingweergave {naam} niet actueel: {r}'
            await asyncio.sleep(.1)
        if cache is None:
            cache = (r['cache_aantal'], r['cache_sha256'])
            assert cache[0] > 0, 'Geen volledige spellingscache om te controleren'
        assert (r['cache_aantal'], r['cache_sha256']) == cache, 'Weergaveactie verandert de volledige foutencache'
        if not verborgen:
            assert r['getekend'] == r['verwacht'] > 0, 'Zichtbare fouten ontbreken'
        stappen.append({'naam': naam, **r})
        beeld('spelling-' + naam)

    async def klik(selector):
        xy = await p.ev('(()=>{const e=document.querySelector('+json.dumps(selector)+');if(!e)throw Error("Eigen tabblad ontbreekt");const r=e.getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()')
        subprocess.run(['xdotool', 'mousemove', '--window', str(venster.id), str(xy['x']), str(xy['y']), 'click', '1'], check=True)

    await stand('laatste-pagina')
    bronversie = stappen[-1]['bronversie']
    zoom = await p.ev('proefApi().getZoom()')
    formaat = venster.get_geometry()
    tab = await p.ev("document.querySelector('.office-tabbalk [role=tab][aria-selected=true]').id")
    await toets(p, 'ctrl+Home')
    await stand('eerste-pagina')
    await toets(p, 'ctrl+End')
    await p.ev('proefApi().setZoom(1.25)')
    await stand('zoom-125')
    venster.configure(width=1100, height=850)
    display.sync()
    await stand('kleiner-venster')
    await klik('#office-tabblad-start')
    await stand('verborgen', True)
    await klik('#' + tab)
    await stand('terug-in-document')
    venster.configure(width=formaat.width, height=formaat.height)
    display.sync()
    await p.ev('proefApi().setZoom('+json.dumps(zoom)+')')
    await p.ev('proefApi().getEditorRef().focus()')
    await toets(p, 'ctrl+End')
    await stand('hersteld-venster')
    assert all(s.get('bronversie', bronversie) == bronversie for s in stappen), 'Weergaveactie verandert de documentbron'
    resultaat['geslaagd'] = True
    return resultaat
