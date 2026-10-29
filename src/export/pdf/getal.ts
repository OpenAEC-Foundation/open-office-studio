/** Getal voor een PDF-stroom: zonder exponent en met hooguit 3 decimalen. */
export const getal = (n: number) => {
  if (!Number.isFinite(n)) return "0";
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
};
