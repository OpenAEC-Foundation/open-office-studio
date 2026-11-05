"""Bewaar de primaire fout terwijl de eigen proefpagina nog verbonden is."""
import asyncio
from contextlib import asynccontextmanager
import json


@asynccontextmanager
async def bewaak(p, uitvoer, beeld):
    # Deze test maakt uitsluitend zijn eigen document. Alleen de bewaar-/
    # geschiedenistoetsen volgen; geen getypte tekst of documentinhoud opnemen.
    await p.ev('''(() => {
      window._lijstToetsen = [];
      window.addEventListener('keydown', e => {
        if (!(e.ctrlKey || e.metaKey) || !['s','z','y'].includes(e.key.toLowerCase())) return;
        const b = {toets:e.key,ctrl:e.ctrlKey,meta:e.metaKey,shift:e.shiftKey,doel:e.target?.tagName};
        _lijstToetsen.push(b); if (_lijstToetsen.length > 16) _lijstToetsen.shift();
        queueMicrotask(() => {b.afgevangen=e.defaultPrevented});
      }, true);
      return true;
    })()''')
    try:
        yield
    except Exception as oorspronkelijk:
        uit = {'oorspronkelijke_fout': repr(oorspronkelijk), 'console_reeds_ontvangen': p.consoleberichten.copy()}
        for naam, taak in [
            ('fouten', p.fouten),
            ('toestand', lambda: p.ev('''(() => {
              const a = proefApi(), s = a?.getEditorRef()?.getYrsSession();
              const el = document.querySelector('.office-tabpaneel:not([hidden]) .canvas-page');
              const workers = [];
              for (let f = el?.[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))]; f; f=f.return)
                for (let h=f.memoizedState,n=0;h&&n<1500;n++,h=h.next) {
                  const v=h.memoizedState?.current;
                  if (v?.engine===s && typeof v.client?.hasFailed==='function') workers.push({uitgevallen:v.client.hasFailed()});
                }
              return {documentfocus:document.hasFocus(),actief_element:document.activeElement?.tagName,
                bronversie:s?.version(),toetsen:window._lijstToetsen,workers};
            })()''')),
        ]:
            try:
                uit[naam] = await asyncio.wait_for(taak(), timeout=5)
            except Exception as fout:
                uit[naam+'_inspectiefout'] = repr(fout)
        try:
            beeld('afgekeurd')
        except Exception as fout:
            uit['beeld_inspectiefout'] = repr(fout)
        try:
            (uitvoer/'afkeuring-lijsten.json').write_text(json.dumps(uit, ensure_ascii=False, indent=2)+'\n')
        except Exception as fout:
            p.opruimfouten.append('Afkeuringsdiagnose niet geschreven: '+repr(fout))
        # Ook een verbroken inspectie of volle schijf mag de oorspronkelijke
        # afkeuring niet vervangen. Nooit een mislukte proef groen maken.
        raise
