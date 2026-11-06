/** Alleen bestaande verhalen mogen in de volgende workersnapshot worden opgevraagd. */
export function bestaandeWorkerVerhalen<T>(invoer: Iterable<readonly [string, T]>, verhalen: readonly string[]): (readonly [string, T])[] {
  const bestaand = new Set(verhalen);
  // Eerdere tekenopvragingen kunnen nog verwijderde tabelcellen bevatten.
  // Volgorde en omgevingen van de overblijvende opvragingen blijven intact.
  return [...invoer].filter(([verhaal]) => bestaand.has(verhaal));
}
