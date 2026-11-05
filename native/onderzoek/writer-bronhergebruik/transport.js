/* Alleen in een eigen GUI-proef: maximaal 1024 metadataregels, geen inhoud. */
function plaatsBronmeting(w) {
  const oud = w.fetch, ipc = w.__TAURI_INTERNALS__;
  const doel = ipc.convertFileSrc('writer_tekst_voorbereiden', 'ipc');
  const vergeten = ipc.convertFileSrc('writer_bron_vergeten', 'ipc');
  const regels = []; let vorig = null, gemist = 0, actief = true;
  const bytes = s => typeof s === 'string' ? s.length * 3 / 4 - (s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0) : 0;
  function voeg(r) { if (!actief) return; if (regels.length < 1024) regels.push(r); else { gemist++; vorig = null; } }
  async function fetchmeting(url, args, ...rest) {
    if (String(url) === vergeten) { vorig = null; voeg({ soort: 'vergeten' }); }
    if (!actief || String(url) !== doel) return oud.call(this, url, args, ...rest);
    const a = JSON.parse(args.body).aanvraag;
    const v = vorig;
    const r = { soort: 'tekst', schema: a.schema, incrementeel: typeof a.basis === 'string',
      bronbytes: bytes(a.snapshot), vorig: !!v, documentGelijk: !!v && a.documentId === v.documentId,
      clientGelijk: !!v && a.clientId === v.clientId, basisGelijk: !!v && a.basis === v.basis,
      voorstelGelijk: !!v && a.snapshot === v.delta, voorstelbytes: v ? bytes(v.delta) : 0 };
    r.hergebruikGeschikt = r.incrementeel && r.documentGelijk && r.clientGelijk && r.basisGelijk && r.voorstelGelijk;
    let response;
    try { response = await oud.call(this, url, args, ...rest); }
    catch (e) { voeg({ ...r, transportfout: true }); throw e; }
    const json = response.json;
    response.json = async function (...jsonargs) {
      let b;
      try { b = await json.apply(this, jsonargs); }
      catch (e) { voeg({ ...r, antwoordfout: true }); throw e; }
      r.bindingGelijk = ['schema', 'requestId', 'documentId', 'sourceVersion', 'snapshotSha256', 'clientId'].every(k => b[k] === a[k]);
      r.retryFull = b.retryFull === true;
      r.vectorGelijk = typeof a.sourceVector === 'string' && b.bronvector === a.sourceVector;
      r.deltabytes = bytes(b.delta);
      voeg(r);
      if (actief && regels.length < 1024 && r.bindingGelijk && r.vectorGelijk && !r.retryFull && typeof b.delta === 'string' && /^[0-9a-f]{64}$/.test(b.basis))
        vorig = { documentId: a.documentId, clientId: a.clientId, basis: b.basis, delta: b.delta };
      else vorig = null;
      return b;
    };
    return response;
  }
  w.fetch = fetchmeting;
  return { lees: () => ({ regels: regels.map(r => ({ ...r })), gemist }), stop: () => { actief = false; vorig = null; if (w.fetch === fetchmeting) w.fetch = oud; } };
}
