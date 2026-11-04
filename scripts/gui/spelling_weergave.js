/* Onafhankelijke controle van de zichtbare golven tegen de volledige foutencache. */
window._controleerSpellingWeergave = async () => {
  const paneel = window._spellingProefPaneel ?? document.querySelector('.office-tabpaneel:not([hidden]) .office-tekst')?.closest('.office-tabpaneel');
  if (!paneel) throw Error('Eigen documentpaneel ontbreekt');
  window._spellingProefPaneel = paneel;
  const laag = paneel.querySelector('.spelling-golflijnen');
  let props = null;
  for (let f = laag?.[Object.keys(laag).find(k => k.startsWith('__reactFiber$'))]; f; f = f.return) {
    if (f.memoizedProps?.sessie && f.memoizedProps?.geometry) { props = f.memoizedProps; break; }
  }
  const sessie = props?.sessie ?? window._spellingProefSessie;
  if (!sessie || sessie.aantal === null) return { gereed: false, reden: 'Volledige foutencache nog niet gereed' };
  window._spellingProefSessie = sessie;
  const fouten = sessie.zichtbareFouten();
  const canoniek = JSON.stringify(fouten.map(({ alinea, fout }) => [alinea.story, alinea.paraId, fout]));
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canoniek)))].map(n => n.toString(16).padStart(2, '0')).join('');
  const spans = laag ? [...laag.querySelectorAll('.spelling-golf')] : [];
  if (paneel.hidden) return { gereed: true, verborgen: true, cache_aantal: fouten.length, cache_sha256: hash, getekend: spans.length };
  if (!props || !laag) return { gereed: false, reden: 'Zichtbare spellinglaag ontbreekt' };
  const ed = sessie.editor()?.getEditorRef(), geometry = props.geometry;
  const indeling = ed?.getLayout(), native = ed?.getYrsSession();
  const vlak = laag.closest('.docx-editor__scroll-container, .docx-editor__viewport');
  if (!indeling || !native || !vlak) return { gereed: false, reden: 'Editor of venster ontbreekt' };
  if (geometry.layout.version !== native.version()) return { gereed: false, reden: 'Renderer toont nog een andere bronversie' };
  const v = vlak.getBoundingClientRect(), boven = Math.max(v.top, 0) - 400, onder = Math.min(v.bottom, innerHeight) + 400;
  const paginas = [...vlak.querySelectorAll('.canvas-page')];
  if (paginas.length !== indeling.pages.length) return { gereed: false, reden: 'Pagina-aantallen nog verschillend' };
  // Referentie: lineair alle pagina's bekijken, zonder de productiecache/binaire zoekroute.
  let van = Infinity, tot = -Infinity;
  const inBeeld = [];
  paginas.forEach((e, i) => {
    const r = e.getBoundingClientRect();
    if (r.bottom < boven || r.top > onder) return;
    if (r.bottom >= Math.max(v.top, 0) && r.top <= Math.min(v.bottom, innerHeight)) inBeeld.push(i);
    for (const f of indeling.pages[i].fragments) {
      if (typeof f.pmStart === 'number') van = Math.min(van, f.pmStart);
      if (typeof f.pmEnd === 'number') tot = Math.max(tot, f.pmEnd);
    }
  });
  if (inBeeld.some(i => !geometry.isPageBuilt(i))) return { gereed: false, reden: 'Zichtbare pagina nog niet opgebouwd', paginas: inBeeld };
  const rauw = sessie.offsetLezer(), verwacht = new Map(), alineaInBeeld = new Map();
  const plek = (alinea, offset, eind = false) => ed.yrsLocToDisplayPosition({ story: alinea.story, paraId: alinea.paraId, offset: rauw(alinea, offset, eind) });
  for (const { alinea, fout } of fouten) {
    const sleutel = `${alinea.story}\0${alinea.paraId}`;
    if (!alineaInBeeld.has(sleutel)) {
      const a = plek(alinea, 0), b = plek(alinea, alinea.tekst.length, true);
      alineaInBeeld.set(sleutel, a === null || b === null || (b >= van && a <= tot));
    }
    if (!alineaInBeeld.get(sleutel)) continue;
    const a = plek(alinea, fout.start), b = plek(alinea, fout.eind, true);
    if (a === null || b === null || b <= a || b < van || a > tot) continue;
    geometry.dom.getRectsForRange(a, b).forEach((rect, i) => {
      const r = geometry.toOverlayRect(rect), dikte = Math.max(2, Math.round(3 * geometry.layout.zoom));
      if (r && r.width > 0) verwacht.set(`${alinea.paraId}:${fout.start}:${i}`, { left: r.x, top: r.y + r.height - dikte - Math.round(r.height * 0.06), width: r.width, height: dikte });
    });
  }
  const afwijkingen = [];
  if (spans.length !== verwacht.size) afwijkingen.push(`Aantal ${spans.length}, verwacht ${verwacht.size}`);
  for (const e of spans) {
    const fiber = e[Object.keys(e).find(k => k.startsWith('__reactFiber$'))], r = verwacht.get(fiber?.key);
    if (!r) { afwijkingen.push(`Onbekende golfsleutel ${fiber?.key}`); continue; }
    for (const naam of ['left', 'top', 'width', 'height']) {
      const waarde = parseFloat(e.style[naam]);
      if (!Number.isFinite(waarde) || Math.abs(waarde - r[naam]) > 0.05) afwijkingen.push(`${fiber.key}/${naam}: ${waarde}, verwacht ${r[naam]}`);
    }
  }
  return { gereed: afwijkingen.length === 0, afwijkingen: afwijkingen.slice(0, 8), verborgen: false, cache_aantal: fouten.length, cache_sha256: hash, getekend: spans.length, verwacht: verwacht.size, layout_id: geometry.layout.id, zoom: geometry.layout.zoom, bronversie: native.version(), bereik: [van, tot] };
};
