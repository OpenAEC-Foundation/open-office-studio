/** Modal en Dialoog delen dezelfde volgorde, ook als de focus wegvalt. */
const openVensters: { sluit: () => void }[] = [];

/** Escape zonder focus sluit uitsluitend het laatst geopende dialoogvenster. */
export function registreerDialoog(sluit: () => void) {
  const venster = { sluit };
  openVensters.push(venster);
  const esc = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    if (openVensters[openVensters.length - 1] !== venster) return;
    const actief = document.activeElement;
    if (actief && actief !== document.body) return;
    event.preventDefault();
    venster.sluit();
  };
  window.addEventListener("keydown", esc);
  return () => {
    window.removeEventListener("keydown", esc);
    const index = openVensters.indexOf(venster);
    if (index >= 0) openVensters.splice(index, 1);
  };
}
