// Alleen voor de eigen native GUI-proef, na de invoermeting. Geen productcode.
(() => {
  if (window._officeFramebasis) return true;
  const grens = 2 * 1024 * 1024;
  const stand = window._officeFramebasis = {
    schema: 1, gebeurtenissen: [], bytes: 0, paginaMetadata: 0, volgnummer: 0,
    fout: null, instrumentatiefouten: [],
  };
  const ids = new WeakMap(), handlers = new WeakMap();
  let volgend = 1;
  const identiteit = v => {
    if (!ids.has(v)) ids.set(v, volgend++);
    return ids.get(v);
  };
  const instrumentatiefout = e => {
    if (stand.instrumentatiefouten.length < 16) stand.instrumentatiefouten.push(String(e));
  };
  function frames() {
    const uit = [], gezien = new Set();
    const el = document.querySelector('.office-tabpaneel:not([hidden]) .office-tekst');
    if (!el) return uit;
    for (let f = el[Object.keys(el).find(k => k.startsWith('__reactFiber$'))]; f; f = f.return) {
      for (let s = f.memoizedState, n = 0; s && n < 1500; s = s.next, n++) {
        for (const v of [s.memoizedState, s.memoizedState?.current]) {
          const r = v?.frame;
          if (!r?.pages || typeof r.frameEpoch !== 'number' || gezien.has(r)) continue;
          gezien.add(r);
          uit.push({
            id: identiteit(r), docEpoch: r.docEpoch, layoutEpoch: r.layoutEpoch, frameEpoch: r.frameEpoch,
            paginaAantal: r.pages.length, afgekapt: r.pages.length > 2000,
            paginas: r.pages.slice(0, 2000).map(p => ({
              id: String(p.pageId), fingerprint: String(p.fingerprint), index: p.pageIndex,
              span: p.page.positionSpan?.slice() ?? null,
              primitieven: p.page.primitives?.length, ongebouwd: p.page.unbuilt ?? false,
            })),
          });
          if (uit.length === 2) return uit;
        }
      }
    }
    return uit;
  }
  function registreer(gebeurtenis) {
    if (stand.fout) return;
    gebeurtenis.volgnummer = ++stand.volgnummer;
    gebeurtenis.paginaMetadata = gebeurtenis.frames?.reduce((n, f) => n + f.paginas.length, 0) ?? 0;
    stand.gebeurtenissen.push(gebeurtenis);
    stand.bytes += gebeurtenis.bytes ?? 0;
    stand.paginaMetadata += gebeurtenis.paginaMetadata;
    while (stand.gebeurtenissen.length > 24 || stand.bytes > grens || stand.paginaMetadata > 8000) {
      const oud = stand.gebeurtenissen.shift();
      stand.bytes -= oud.bytes ?? 0;
      stand.paginaMetadata -= oud.paginaMetadata;
    }
  }
  function buffers(data) {
    let bytes = 0;
    const uit = [];
    // Alleen rendererframes; nooit snapshots, fontdata of bronupdates opnemen.
    for (const [pad, bron] of [
      ['frame', data.frame],
      ...(Array.isArray(data.pageFrames) ? data.pageFrames.slice(0, 12).map((b, i) => [`pageFrames.${i}`, b]) : []),
    ]) {
      const b = bron instanceof ArrayBuffer ? new Uint8Array(bron)
        : ArrayBuffer.isView(bron) ? new Uint8Array(bron.buffer, bron.byteOffset, bron.byteLength) : null;
      if (!b) continue;
      if (b.length + bytes > grens) { uit.push({ pad, overgeslagenBytes: b.length }); continue; }
      let tekst = '';
      for (let i = 0; i < b.length; i += 16384) tekst += String.fromCharCode(...b.subarray(i, i + 16384));
      uit.push({ pad, bytes: b.length, base64: btoa(tekst) });
      bytes += b.length;
    }
    return { buffers: uit, bytes };
  }
  function bevries(args) {
    if (stand.fout) return;
    const tekst = args.map(a => a?.message ?? String(a)).join(' ');
    if (!/FrameDelta|Document worker|Building display pages/.test(tekst)) return;
    stand.fout = {
      tekst: tekst.slice(0, 16384), frames: frames(),
      stacks: args.filter(a => typeof a?.stack === 'string').map(a => a.stack.slice(0, 65536)),
    };
  }
  function volg(worker) {
    const oud = worker.onmessage;
    if (handlers.get(worker) === oud || typeof oud !== 'function') return;
    const handler = function(e) {
      try {
        if (!stand.fout && e.data?.frame) registreer({
          soort: 'antwoord', worker: identiteit(worker), id: e.data.id,
          layoutRevision: e.data.layoutRevision, documentVersion: e.data.documentVersion?.slice(0, 200),
          frames: frames(), ...buffers(e.data),
        });
      } catch (fout) { instrumentatiefout(fout); }
      try { return oud.call(this, e); }
      catch (fout) {
        try { bevries([fout]); } catch (e) { instrumentatiefout(e); }
        throw fout;
      }
    };
    handlers.set(worker, handler);
    worker.onmessage = handler;
  }
  const typen = new Set(['bootstrap', 'sync', 'buildFrame', 'buildPages', 'releasePages', 'applyInput', 'applyDelete', 'applyUpdate']);
  const post = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function(data, ...rest) {
    try {
      if (!stand.fout && typen.has(data?.type) && typeof data.id === 'number') {
        volg(this);
        registreer({ soort: 'verzoek', worker: identiteit(this), id: data.id, type: data.type,
          expectedFrameEpoch: data.expectedFrameEpoch,
          snapshotRevision: data.snapshot?.layoutRevision, frames: frames() });
      }
    } catch (fout) { instrumentatiefout(fout); }
    return post.call(this, data, ...rest);
  };
  const error = console.error;
  console.error = function(...args) {
    try { bevries(args); } catch (fout) { instrumentatiefout(fout); }
    return error.apply(this, args);
  };
  return true;
})()
