/* Alleen voor de eigen gegenereerde proefbron: bronbytes vóór overdracht bewaren. */
(() => {
  if (window._officeWorkerBron) throw Error('Workerbronbewaking bestaat al');
  const sessie = proefApi().getEditorRef().getYrsSession();
  const origineel = Worker.prototype.postMessage;
  const grens = 2 * 1024 * 1024, maximum = 256;
  const berichten = [], workers = new WeakMap();
  let bytes = 0, volgende = 0, volledig = true;
  const kopie = waarde => {
    if (waarde == null) return null;
    const bron = waarde instanceof ArrayBuffer ? new Uint8Array(waarde)
      : ArrayBuffer.isView(waarde) ? new Uint8Array(waarde.buffer, waarde.byteOffset, waarde.byteLength) : null;
    if (!bron) throw Error('Workerbron is geen binaire weergave');
    if (bytes + bron.byteLength > grens) { volledig = false; return null; }
    bytes += bron.byteLength;
    return bron.slice();
  };
  const begin = kopie(sessie.encodeStateAsUpdate());
  const versie = sessie.version(), clientId = sessie.clientId;
  const post = function(bericht, ...rest) {
    if (['bootstrap', 'applyUpdate', 'sync', 'syncUpdate', 'destroy'].includes(bericht?.type)) {
      if (berichten.length >= maximum) volledig = false;
      else {
        if (!workers.has(this)) workers.set(this, ++volgende);
        berichten.push({ worker: workers.get(this), type: bericht.type, id: bericht.id,
          state: kopie(bericht.snapshot?.state), update: kopie(bericht.update),
          clientId: bericht.snapshot?.clientId });
      }
    }
    return origineel.call(this, bericht, ...rest);
  };
  Worker.prototype.postMessage = post;
  window._officeWorkerBron = {
    exporteer() {
      // Na de tijdmeting pas naar JSON omzetten; geen buffer terug overdragen.
      return { schema: 1, volledig, bytes, grens, maximum, versie, clientId,
        begin: begin && Array.from(begin),
        berichten: berichten.map(b => ({ ...b, state: b.state && Array.from(b.state), update: b.update && Array.from(b.update) })),
        grens_bewijs: 'Begin is de hostbron vóór invoer, geen bewijs van de toenmalige workerbron. Alleen bronupdates; geen lettertypen, rendererbeelden of tijdmeting.' };
    },
    stop() {
      if (Worker.prototype.postMessage !== post) throw Error('Workerbronhaak is nog door een andere meting omwikkeld');
      Worker.prototype.postMessage = origineel;
    },
  };
  return true;
})()
