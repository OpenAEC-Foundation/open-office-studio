interface Openingssignaal {
  isOpen: () => boolean;
  bestaat: () => boolean;
  volg: (gewijzigd: () => void) => () => void;
}

/** Een eenmaal geslaagde opening blijft geslaagd, ook als de gebruiker het
 * onderdeel vóór de controle alweer sluit of het document vervangt. */
export function bevestigOpening(signaal: Openingssignaal, mislukt: () => void, ms = 600): () => void {
  let gestopt = false;
  let ontkoppel = () => {};
  const stop = () => {
    if (gestopt) return;
    gestopt = true;
    clearTimeout(timer);
    ontkoppel();
  };
  const kijk = () => {
    if (!signaal.bestaat() || signaal.isOpen()) stop();
  };
  const timer = setTimeout(() => {
    kijk();
    if (!gestopt) { stop(); mislukt(); }
  }, ms);
  ontkoppel = signaal.volg(kijk);
  if (gestopt) ontkoppel();
  else kijk();
  return stop;
}
