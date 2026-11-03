/** Meet alleen paginaboxen rond het venster; meetgegevens leven één aanroep. */
type Rand = { top: number; bottom: number };

export function paginaSelectie<T, R extends Rand>(
  paginas: readonly T[],
  meet: (pagina: T) => R,
  boven: number,
  onder: number,
  gestapeld = false,
): { pagina: T; rect: R; index: number }[] {
  const cache = new Map<number, R>();
  const rect = (i: number) => {
    let r = cache.get(i);
    if (!r) {
      r = meet(paginas[i]);
      cache.set(i, r);
    }
    return r;
  };
  const verzamel = (van: number, tot: number) => {
    const uit = [];
    for (let i = van; i < tot; i++) {
      const r = rect(i);
      if (!(r.bottom < boven || r.top > onder))
        uit.push({ pagina: paginas[i], rect: r, index: i });
    }
    return uit;
  };
  if (
    !gestapeld ||
    paginas.length < 16 ||
    !Number.isFinite(boven) ||
    !Number.isFinite(onder) ||
    boven > onder
  )
    return verzamel(0, paginas.length);
  let van = 0,
    tot = paginas.length;
  while (van < tot) {
    const midden = van + Math.floor((tot - van) / 2),
      r = rect(midden);
    if (
      !Number.isFinite(r.top) ||
      !Number.isFinite(r.bottom) ||
      r.bottom < r.top
    )
      return verzamel(0, paginas.length);
    if (r.bottom < boven) van = midden + 1;
    else tot = midden;
  }
  const eerste = van;
  tot = paginas.length;
  while (van < tot) {
    const midden = van + Math.floor((tot - van) / 2),
      r = rect(midden);
    if (
      !Number.isFinite(r.top) ||
      !Number.isFinite(r.bottom) ||
      r.bottom < r.top
    )
      return verzamel(0, paginas.length);
    if (r.top <= onder) van = midden + 1;
    else tot = midden;
  }
  return verzamel(eerste, van);
}

export function zichtbarePaginaElementen(
  paginas: readonly HTMLElement[],
  venster: Rand,
  marge: number,
) {
  const kolom = paginas[0]?.parentElement;
  const stijl = kolom?.classList.contains("canvas-pages__column")
    ? getComputedStyle(kolom)
    : null;
  // Alleen de eigen paginakolom heeft deze vaste verticale indeling.
  const gestapeld =
    stijl?.display === "flex" &&
    stijl.flexDirection === "column" &&
    paginas.every((p) => p.parentElement === kolom);
  return paginaSelectie(
    paginas,
    (p) => p.getBoundingClientRect(),
    venster.top - marge,
    venster.bottom + marge,
    gestapeld,
  );
}
