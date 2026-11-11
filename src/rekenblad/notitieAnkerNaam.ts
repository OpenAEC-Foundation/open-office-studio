/** Verborgen celankers laten de rekenkern notities met invoegen en Undo meeschuiven. */
export const NOTITIEANKER = "_OpenAEC_CellNote_";
export const isNotitieAnker = (naam: string) =>
  /^_OpenAEC_CellNote_\d+_[A-Z]+[1-9]\d*$/i.test(naam);
