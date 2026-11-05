/** Houdt interne exports bij, ook als herstelopslag en herladen samenvallen. */
export function maakInterneOpslag() {
  let lopend = 0;
  return {
    bezig: () => lopend > 0,
    async voerUit<T>(werk: () => Promise<T>): Promise<T> {
      lopend++;
      try {
        return await werk();
      } finally {
        lopend--;
      }
    },
  };
}
