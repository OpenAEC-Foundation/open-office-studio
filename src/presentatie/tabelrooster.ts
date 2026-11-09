/** Bewerkingen op het rechthoekige DrawingML-tabelrooster, zonder pakket- of UI-afhankelijkheid. */
export interface CelStijl {
  vulling?: string;
  rand?: string;
  randPunten?: number;
  uitlijning?: "l" | "ctr" | "r";
  verticaal?: "t" | "ctr" | "b";
  marge?: number;
}
export interface TabelCel {
  tekst: string;
  rijSpan: number;
  kolomSpan: number;
  bedekt: boolean;
  /** Origineel fragment: onbewerkte tekst/opmaak blijft intact. */
  xml?: string;
  tekstGewijzigd?: boolean;
  stijl?: CelStijl;
}
export interface TabelRooster {
  cellen: TabelCel[][];
  breedtes: number[];
  hoogtes: number[];
  rijXml?: (string | undefined)[];
  kolomXml?: (string | undefined)[];
}
export interface CelBereik {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}
export function leesCelBereik(
  tekst: string,
  rijen: number,
  kolommen: number,
): CelBereik {
  const m =
    /^\s*([A-Z]{1,2})([1-9]\d*)(?:\s*:\s*([A-Z]{1,2})([1-9]\d*))?\s*$/i.exec(
      tekst,
    );
  if (!m) throw new TabelFout("invalid");
  const kolom = (s: string) =>
    [...s.toUpperCase()].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
  const a = Number(m[2]) - 1,
    b = Number(m[4] ?? m[2]) - 1,
    c = kolom(m[1]),
    d = kolom(m[3] ?? m[1]);
  if (Math.max(a, b) >= rijen || Math.max(c, d) >= kolommen)
    throw new TabelFout("invalid");
  return {
    r0: Math.min(a, b),
    r1: Math.max(a, b),
    c0: Math.min(c, d),
    c1: Math.max(c, d),
  };
}
export class TabelFout extends Error {
  constructor(
    public code: "invalid" | "partialMerge" | "tooLarge" | "missing",
  ) {
    super(code);
  }
}
export const legeCel = (): TabelCel => ({
  tekst: "",
  rijSpan: 1,
  kolomSpan: 1,
  bedekt: false,
});
export function nieuwRooster(rijen: number, kolommen: number): TabelRooster {
  if (
    !Number.isInteger(rijen) ||
    !Number.isInteger(kolommen) ||
    rijen < 1 ||
    kolommen < 1
  )
    throw new TabelFout("invalid");
  if (rijen > 200 || kolommen > 50 || rijen * kolommen > 5000)
    throw new TabelFout("tooLarge");
  return {
    cellen: Array.from({ length: rijen }, () =>
      Array.from({ length: kolommen }, legeCel),
    ),
    breedtes: Array(kolommen).fill(1440000),
    hoogtes: Array(rijen).fill(360000),
  };
}
const kopie = (t: TabelRooster): TabelRooster => ({
  ...t,
  cellen: t.cellen.map((r) =>
    r.map((c) => ({ ...c, stijl: c.stijl ? { ...c.stijl } : undefined })),
  ),
  breedtes: [...t.breedtes],
  hoogtes: [...t.hoogtes],
  rijXml: t.rijXml ? [...t.rijXml] : undefined,
  kolomXml: t.kolomXml ? [...t.kolomXml] : undefined,
});
export function eigenaars(t: TabelRooster) {
  const rows = t.cellen.length,
    cols = t.breedtes.length;
  if (
    !rows ||
    !cols ||
    rows > 200 ||
    cols > 50 ||
    rows * cols > 5000 ||
    t.hoogtes.length !== rows ||
    t.cellen.some((r) => r.length !== cols) ||
    [...t.hoogtes, ...t.breedtes].some(
      (n) => !Number.isSafeInteger(n) || n <= 0,
    )
  )
    throw new TabelFout("invalid");
  if (
    t.breedtes.reduce((a, b) => a + b, 0) > 2147483647 ||
    t.hoogtes.reduce((a, b) => a + b, 0) > 2147483647
  )
    throw new TabelFout("invalid");
  if (
    t.cellen.reduce(
      (n, row) => n + row.reduce((n, c) => n + c.tekst.length, 0),
      0,
    ) >
    2 * 1024 * 1024
  )
    throw new TabelFout("tooLarge");
  const map: ({ r: number; c: number } | null)[][] = Array.from(
    { length: rows },
    () => Array(cols).fill(null),
  );
  t.cellen.forEach((row, r) =>
    row.forEach((cel, c) => {
      if (cel.bedekt) return;
      if (
        !Number.isInteger(cel.rijSpan) ||
        !Number.isInteger(cel.kolomSpan) ||
        cel.rijSpan < 1 ||
        cel.kolomSpan < 1 ||
        r + cel.rijSpan > rows ||
        c + cel.kolomSpan > cols
      )
        throw new TabelFout("invalid");
      for (let y = r; y < r + cel.rijSpan; y++)
        for (let x = c; x < c + cel.kolomSpan; x++) {
          if (map[y][x]) throw new TabelFout("invalid");
          map[y][x] = { r, c };
        }
    }),
  );
  if (map.some((row) => row.some((c) => !c))) throw new TabelFout("invalid");
  return map as { r: number; c: number }[][];
}
function geldigBereik(t: TabelRooster, b: CelBereik) {
  if (
    ![b.r0, b.c0, b.r1, b.c1].every(Number.isInteger) ||
    b.r0 < 0 ||
    b.c0 < 0 ||
    b.r1 < b.r0 ||
    b.c1 < b.c0 ||
    b.r1 >= t.cellen.length ||
    b.c1 >= t.breedtes.length
  )
    throw new TabelFout("invalid");
}
export function voegCellenSamen(t: TabelRooster, b: CelBereik): TabelRooster {
  geldigBereik(t, b);
  const owners = eigenaars(t),
    n = kopie(t),
    seen = new Set<string>(),
    tekst: string[] = [];
  for (let r = b.r0; r <= b.r1; r++)
    for (let c = b.c0; c <= b.c1; c++) {
      const o = owners[r][c],
        cell = t.cellen[o.r][o.c];
      if (
        o.r < b.r0 ||
        o.c < b.c0 ||
        o.r + cell.rijSpan - 1 > b.r1 ||
        o.c + cell.kolomSpan - 1 > b.c1
      )
        throw new TabelFout("partialMerge");
      const id = `${o.r}:${o.c}`;
      if (!seen.has(id)) {
        seen.add(id);
        if (cell.tekst) tekst.push(cell.tekst);
      }
      n.cellen[r][c] = {
        ...n.cellen[r][c],
        rijSpan: 1,
        kolomSpan: 1,
        bedekt: true,
        tekst: "",
        tekstGewijzigd: true,
      };
    }
  n.cellen[b.r0][b.c0] = {
    ...n.cellen[b.r0][b.c0],
    rijSpan: b.r1 - b.r0 + 1,
    kolomSpan: b.c1 - b.c0 + 1,
    bedekt: false,
    tekst: tekst.join("\n"),
    tekstGewijzigd: true,
  };
  return n;
}
export function splitsCel(t: TabelRooster, r: number, c: number): TabelRooster {
  geldigBereik(t, { r0: r, r1: r, c0: c, c1: c });
  const owner = eigenaars(t)[r][c],
    cel = t.cellen[owner.r][owner.c],
    n = kopie(t);
  for (let y = owner.r; y < owner.r + cel.rijSpan; y++)
    for (let x = owner.c; x < owner.c + cel.kolomSpan; x++)
      n.cellen[y][x] = {
        ...n.cellen[y][x],
        rijSpan: 1,
        kolomSpan: 1,
        bedekt: false,
      };
  return n;
}
/** Voeg in vóór `index`; verwijdering krimpt merges en verplaatst hun inhoud zo nodig. */
export function wijzigRooster(
  t: TabelRooster,
  as: "rij" | "kolom",
  index: number,
  verwijder = false,
): TabelRooster {
  eigenaars(t);
  const count = as === "rij" ? t.cellen.length : t.breedtes.length;
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index > (verwijder ? count - 1 : count) ||
    (verwijder && count === 1)
  )
    throw new TabelFout("invalid");
  const n = kopie(t),
    anchors: { r: number; c: number; cel: TabelCel }[] = [];
  t.cellen.forEach((row, r) =>
    row.forEach((cel, c) => {
      if (!cel.bedekt) anchors.push({ r, c, cel: { ...cel } });
    }),
  );
  if (as === "rij") {
    n.rijXml?.splice(
      index,
      verwijder ? 1 : 0,
      ...(verwijder ? [] : [undefined]),
    );
    if (verwijder) {
      n.cellen.splice(index, 1);
      n.hoogtes.splice(index, 1);
    } else {
      n.cellen.splice(
        index,
        0,
        Array.from({ length: t.breedtes.length }, legeCel),
      );
      n.hoogtes.splice(index, 0, t.hoogtes[Math.min(index, count - 1)]);
    }
  } else {
    n.kolomXml?.splice(
      index,
      verwijder ? 1 : 0,
      ...(verwijder ? [] : [undefined]),
    );
    n.cellen.forEach((row) => {
      if (verwijder) row.splice(index, 1);
      else row.splice(index, 0, legeCel());
    });
    if (verwijder) n.breedtes.splice(index, 1);
    else n.breedtes.splice(index, 0, t.breedtes[Math.min(index, count - 1)]);
  }
  if (
    n.cellen.length > 200 ||
    n.breedtes.length > 50 ||
    n.cellen.length * n.breedtes.length > 5000
  )
    throw new TabelFout("tooLarge");
  // Wis de oude dekking; plaats daarna de aangepaste ankers.
  n.cellen.forEach((row) =>
    row.forEach((c) => {
      c.rijSpan = 1;
      c.kolomSpan = 1;
      c.bedekt = false;
    }),
  );
  for (const a of anchors) {
    let pos = as === "rij" ? a.r : a.c,
      span = as === "rij" ? a.cel.rijSpan : a.cel.kolomSpan;
    if (verwijder) {
      if (index < pos) pos--;
      else if (index < pos + span) {
        span--;
        if (!span) continue;
      }
    } else {
      if (index <= pos) pos++;
      else if (index < pos + span) span++;
    }
    const r = as === "rij" ? pos : a.r,
      c = as === "kolom" ? pos : a.c;
    const cel = {
      ...a.cel,
      rijSpan: as === "rij" ? span : a.cel.rijSpan,
      kolomSpan: as === "kolom" ? span : a.cel.kolomSpan,
      bedekt: false,
    };
    for (let y = r; y < r + cel.rijSpan; y++)
      for (let x = c; x < c + cel.kolomSpan; x++)
        if (y !== r || x !== c) n.cellen[y][x].bedekt = true;
    n.cellen[r][c] = cel;
  }
  eigenaars(n);
  return n;
}
/** Plakken is expliciet: een rechthoek wordt gevuld; gedeeltelijke merges worden geweigerd. */
export function plakCellen(
  t: TabelRooster,
  r: number,
  c: number,
  data: readonly (readonly string[])[],
): TabelRooster {
  if (
    !data.length ||
    !data[0]?.length ||
    data.some((row) => row.length !== data[0].length)
  )
    throw new TabelFout("invalid");
  const b = {
    r0: r,
    c0: c,
    r1: r + data.length - 1,
    c1: c + data[0].length - 1,
  };
  geldigBereik(t, b);
  const own = eigenaars(t),
    n = kopie(t);
  for (let y = b.r0; y <= b.r1; y++)
    for (let x = b.c0; x <= b.c1; x++) {
      const o = own[y][x],
        a = t.cellen[o.r][o.c];
      if (a.rijSpan > 1 || a.kolomSpan > 1) throw new TabelFout("partialMerge");
      n.cellen[y][x] = {
        ...n.cellen[y][x],
        tekst: data[y - r][x - c],
        tekstGewijzigd: true,
      };
    }
  return n;
}
