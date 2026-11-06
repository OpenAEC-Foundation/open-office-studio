/* Alleen de eigen proefbron: vergelijk volledige fontantwoorden en bewaar varianten. */
(async () => {
  const api = proefApi(), ed = api.getEditorRef(), s = ed.getYrsSession();
  const stand = () => JSON.stringify(Object.fromEntries(s.storyIds().sort().map(id => [id, s.storySegments(id)])));
  const begin = stand(), oud = Worker.prototype.postMessage;
  let laatste = null, fase = 'begin', variant = null, stapversie = null;
  const workers = new Map(), fouten = [], verzoeken = [];
  const meld = (soort, fout) => {
    if (fouten.length < 16) fouten.push({ soort, fase, variant, tekst: String(fout).slice(0, 4000) });
  };
  const vensterfout = e => meld(e.type, e.error?.stack ?? e.message ?? e.reason);
  const uit = window._officeLettertypeBewijs = { geslaagd: false, gevallen: [] };
  const teksten = s.paragraphs('body').map(p => p.text);
  uit.alinea_aantal = teksten.length;
  uit.tekst_sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(teksten))))].map(n => n.toString(16).padStart(2, '0')).join('');
  window.addEventListener('error', vensterfout);
  window.addEventListener('unhandledrejection', vensterfout);
  Worker.prototype.postMessage = function(b, ...rest) {
    if (!workers.has(this)) {
      const bericht = e => {
        if (e.data?.type === 'error' || e.data?.ok === false) meld('workerbericht', e.data.error ?? e.data.message ?? 'Workerantwoord afgekeurd');
      };
      const fout = e => meld('workerfout', e.message);
      this.addEventListener('message', bericht); this.addEventListener('error', fout);
      workers.set(this, { nummer: workers.size + 1, bericht, fout });
    }
    verzoeken.push({ worker: workers.get(this).nummer, type: b?.type, id: b?.id, fase, variant, bronversie_bij_stap: stapversie, expectedFrameEpoch: b?.expectedFrameEpoch, snapshotRevision: b?.snapshot?.layoutRevision });
    if (verzoeken.length > 32) verzoeken.shift();
    // Een fontbehoefte kan al in het native voorstel zijn berekend. In dat
    // geval verstuurt de renderer alleen de layoutbron, geen tweede preflight.
    // Gebruik uitsluitend de echte input van deze documentworker; de volledige
    // worker-/hostvergelijking, versiecontrole en DOCX-controle blijven verplicht.
    if (this === eigenWorker && b?.type === 'fontRequirements' && typeof b.layoutInput === 'string' && b.layoutInput.length)
      laatste = { input: b.layoutInput, versie: s.version(), herkomst: 'fontRequirements' };
    if (this === eigenWorker && b?.type === 'sync' && typeof b.snapshot?.layoutInput === 'string' && b.snapshot.layoutInput.length)
      laatste = { input: b.snapshot.layoutInput, versie: s.version(), herkomst: 'sync.snapshot.layoutInput',
        frameEpoch: b.expectedFrameEpoch, snapshotRevision: b.snapshot.layoutRevision };
    return oud.call(this, b, ...rest);
  };
  const client = () => {
    const el = document.querySelector('.office-tabpaneel:not([hidden]) .canvas-page');
    for (let f = el?.[Object.keys(el).find(k => k.startsWith('__reactFiber$'))]; f; f = f.return)
      for (let h = f.memoizedState, n = 0; h && n < 1500; n++, h = h.next) {
        const v = h.memoizedState?.current;
        if (v?.engine === s && typeof v.client?.fontRequirements === 'function') return v.client;
      }
    throw Error('Actieve eigen lettertypeworker niet gevonden');
  };
  const eigenWorker = client().worker;
  const controleerBron = () => {
    if (proefApi()?.getEditorRef()?.getYrsSession() !== s) throw Error('Actieve documentbron vervangen tijdens lettertypeproef');
    if (client().hasFailed()) throw Error('Lettertypeworker is uitgevallen');
    if (fouten.length) throw Error('Primaire fout tijdens lettertypeproef: ' + fouten[0].tekst);
    if (client().worker !== eigenWorker) throw Error('Lettertypeworker vervangen tijdens lettertypeproef');
  };
  const stap = naam => { fase = naam; controleerBron(); stapversie = s.version(); };
  try {
    for (const v of [
      { naam: 'caladea', opdracht: 'fontFamily', args: { family: 'Caladea' }, familie: 'Caladea' },
      { naam: 'carlito', opdracht: 'fontFamily', args: { family: 'Carlito' }, familie: 'Carlito' },
      { naam: 'vet', opdracht: 'bold', args: null, stijl: 'bold' },
      { naam: 'cursief', opdracht: 'italic', args: null, stijl: 'italic' },
    ]) {
      variant = v.naam; stap('selecteren');
      const p = s.paragraphs('body')[0], plek = offset => ed.yrsLocToDisplayPosition({ story: 'body', paraId: p.paraId, offset });
      ed.setSelection(plek(0), plek(p.text.length)); api.scrollToPage(1); api.focus();
      const voor = s.version(); laatste = null;
      stap('opmaak');
      await api.commands.execute(v.opdracht, v.args); await api.flushPendingInput();
      stap('lettertypevraag');
      const einde = performance.now() + 30000;
      while (!laatste || laatste.versie !== s.version() || s.version() === voor) {
        controleerBron();
        if (performance.now() > einde) throw Error('Geen actuele layoutbron voor ' + v.naam);
        await new Promise(r => setTimeout(r, 30));
      }
      stap('vergelijking');
      const vraagBron = laatste, input = vraagBron.input, versie = s.version();
      const worker = JSON.parse(await client().fontRequirements(input));
      const host = JSON.parse(s.layoutFontRequirementsJson(input));
      if (versie !== s.version()) throw Error('Bron verandert tijdens lettertypevergelijking');
      if (JSON.stringify(worker) !== JSON.stringify(host)) throw Error('Volledige lettertypebehoeften verschillen: ' + v.naam);
      if (v.familie && !worker.some(f => f.family.toLowerCase() === v.familie.toLowerCase())) throw Error('Nieuwe familie ontbreekt: ' + v.familie);
      if (v.stijl && !worker.some(f => f[v.stijl] === true)) throw Error('Nieuwe letterstijl ontbreekt: ' + v.stijl);
      stap('bewaren');
      const bewaard = await api.save();
      uit.export = { type: bewaard === null ? 'null' : typeof bewaard, bytes: bewaard?.byteLength ?? null };
      controleerBron();
      if (!(bewaard instanceof ArrayBuffer) || bewaard.byteLength === 0) {
        throw Error('Geen geldige DOCX-export voor ' + v.naam);
      }
      if (versie !== s.version()) throw Error('Bron verandert tijdens bewaren');
      const docx = Array.from(new Uint8Array(bewaard));
      uit.gevallen.push({ layoutbron: { herkomst: vraagBron.herkomst, frameEpoch: vraagBron.frameEpoch, snapshotRevision: vraagBron.snapshotRevision }, naam: v.naam, familie: v.familie, stijl: v.stijl, behoeften: worker, bronversie: versie, docx, exact: true });
      stap('undo');
      await api.commands.execute('undo', null); await api.flushPendingInput();
      controleerBron();
      if (stand() !== begin) throw Error('Undo herstelt niet alle verhalen en opmaak: ' + v.naam);
      uit.gevallen.at(-1).bron_hersteld = true;
    }
    uit.geslaagd = true;
    return uit;
  } catch (fout) {
    uit.fout = String(fout);
    uit.diagnose = { fase, variant, fouten, verzoeken, bron_actief: false };
    try {
      Object.assign(uit.diagnose, { bron_actief: proefApi()?.getEditorRef()?.getYrsSession() === s,
        bronversie: s.version(), worker_uitgevallen: client().hasFailed(), laatste_lettertypeversie: laatste?.versie ?? null });
    } catch (diagnosefout) { uit.diagnose.inspectiefout = String(diagnosefout); }
    return uit;
  } finally {
    Worker.prototype.postMessage = oud;
    window.removeEventListener('error', vensterfout);
    window.removeEventListener('unhandledrejection', vensterfout);
    for (const [worker, h] of workers) {
      worker.removeEventListener('message', h.bericht); worker.removeEventListener('error', h.fout);
    }
  }
})()
