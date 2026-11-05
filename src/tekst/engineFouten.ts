/** Bewaar de eerste enginefouten in dit venster, vóór de melding alleen tekst wordt. */
export interface WriterEngineFout {
  naam: string;
  bericht: string;
  stack: string;
  tijd: number;
}
export interface WriterFoutDoel {
  _openaecWriterFouten?: readonly Readonly<WriterEngineFout>[];
}
declare global {
  interface Window extends WriterFoutDoel {}
}

export function meldWriterEngineFout(
  fout: Error,
  meld: (fout: Error) => void,
  doel: WriterFoutDoel | null = typeof window === "undefined" ? null : window,
) {
  // Alleen scalars bewaren: een Error, documentsessie of Wasm-object vasthouden
  // kan juist de levensduur van het defecte geheugen veranderen. Geen IO.
  try {
    if (doel && (fout.name === "RuntimeError" || /out of bounds|memory access|unreachable|dlmalloc|Document worker trapped|ran out of memory/i.test(fout.message))) {
      const eerder = doel._openaecWriterFouten ?? [];
      if (eerder.length < 4) {
        const opname = Object.freeze({
          naam: fout.name.slice(0, 120), bericht: fout.message.slice(0, 2048),
          stack: typeof fout.stack === "string" ? fout.stack.slice(0, 32768) : "",
          tijd: Date.now(),
        });
        doel._openaecWriterFouten = Object.freeze([...eerder, opname]);
      }
    }
  } catch {
    // Diagnose mag nooit het oorspronkelijke foutobject of de melding vervangen.
  }
  meld(fout);
}
