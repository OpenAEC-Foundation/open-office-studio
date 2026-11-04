/* Alleen de eigen proefbron: vergelijk volledige fontantwoorden en bewaar varianten. */
(async () => {
  const api = proefApi(), ed = api.getEditorRef(), s = ed.getYrsSession();
  const stand = () => JSON.stringify(Object.fromEntries(s.storyIds().sort().map(id => [id, s.storySegments(id)])));
  const begin = stand(), oud = Worker.prototype.postMessage;
  let laatste = null;
  const uit = window._officeLettertypeBewijs = { geslaagd: false, gevallen: [] };
  const teksten = s.paragraphs('body').map(p => p.text);
  uit.alinea_aantal = teksten.length;
  uit.tekst_sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(teksten))))].map(n => n.toString(16).padStart(2, '0')).join('');
  Worker.prototype.postMessage = function(b, ...rest) {
    if (b?.type === 'fontRequirements') laatste = { input: b.layoutInput, versie: s.version() };
    return oud.call(this, b, ...rest);
  };
  const client = () => {
    const el = document.querySelector('.office-tabpaneel:not([hidden]) .canvas-page');
    for (let f = el?.[Object.keys(el).find(k => k.startsWith('__reactFiber$'))]; f; f = f.return)
      for (let h = f.memoizedState, n = 0; h && n < 1500; n++, h = h.next) {
        const v = h.memoizedState?.current;
        if (v?.engine === s && typeof v.client?.fontRequirements === 'function' && !v.client.hasFailed()) return v.client;
      }
    throw Error('Actieve eigen lettertypeworker niet gevonden');
  };
  try {
    for (const v of [
      { naam: 'caladea', opdracht: 'fontFamily', args: { family: 'Caladea' }, familie: 'Caladea' },
      { naam: 'carlito', opdracht: 'fontFamily', args: { family: 'Carlito' }, familie: 'Carlito' },
      { naam: 'vet', opdracht: 'bold', args: null, stijl: 'bold' },
      { naam: 'cursief', opdracht: 'italic', args: null, stijl: 'italic' },
    ]) {
      const p = s.paragraphs('body')[0], plek = offset => ed.yrsLocToDisplayPosition({ story: 'body', paraId: p.paraId, offset });
      ed.setSelection(plek(0), plek(p.text.length)); api.scrollToPage(1); api.focus();
      const voor = s.version(); laatste = null;
      await api.commands.execute(v.opdracht, v.args); await api.flushPendingInput();
      const einde = performance.now() + 30000;
      while (!laatste || laatste.versie !== s.version() || s.version() === voor) {
        if (performance.now() > einde) throw Error('Geen actuele lettertypevraag voor ' + v.naam);
        await new Promise(r => setTimeout(r, 30));
      }
      const input = laatste.input, versie = s.version();
      const worker = JSON.parse(await client().fontRequirements(input));
      const host = JSON.parse(s.layoutFontRequirementsJson(input));
      if (versie !== s.version()) throw Error('Bron verandert tijdens lettertypevergelijking');
      if (JSON.stringify(worker) !== JSON.stringify(host)) throw Error('Volledige lettertypebehoeften verschillen: ' + v.naam);
      if (v.familie && !worker.some(f => f.family.toLowerCase() === v.familie.toLowerCase())) throw Error('Nieuwe familie ontbreekt: ' + v.familie);
      if (v.stijl && !worker.some(f => f[v.stijl] === true)) throw Error('Nieuwe letterstijl ontbreekt: ' + v.stijl);
      const docx = Array.from(new Uint8Array(await api.save()));
      uit.gevallen.push({ naam: v.naam, familie: v.familie, stijl: v.stijl, behoeften: worker, bronversie: versie, docx, exact: true });
      await api.commands.execute('undo', null); await api.flushPendingInput();
      if (stand() !== begin) throw Error('Undo herstelt niet alle verhalen en opmaak: ' + v.naam);
      uit.gevallen.at(-1).bron_hersteld = true;
    }
    uit.geslaagd = true;
    return uit;
  } catch (fout) {
    uit.fout = String(fout);
    return uit;
  } finally {
    Worker.prototype.postMessage = oud;
  }
})()
