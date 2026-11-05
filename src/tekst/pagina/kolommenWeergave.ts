interface Sectie { properties?: Record<string, unknown>; [sleutel: string]: unknown }

/**
 * De engine 0.5.1 breekt gelijke kolommen correct af, maar tekent hun alinea's
 * op de volledige paginabreedte. De expliciete kolomroute bewaart de juiste
 * fragmentbreedte. Alleen het indelingsverzoek krijgt deze equivalente vorm;
 * de documenteigenschappen en het opgeslagen pakket blijven intact.
 */
export function kolommenVoorWeergave<T extends Sectie>(secties: readonly T[]): T[] {
  return secties.map((s) => {
    const p = s.properties;
    if (!p || p.equalWidth === false) return s;
    const aantal = Number(p.columnCount ?? (Array.isArray(p.columns) ? p.columns.length : 1));
    if (!Number.isInteger(aantal) || aantal < 2) return s;
    // Breedtes uit w:col tellen niet bij gelijke kolommen. Dezelfde verdeling
    // volgt uit aantal en tussenruimte, zonder zulke afzonderlijke breedtes.
    return { ...s, properties: { ...p, columnCount: aantal, equalWidth: false, columns: undefined } };
  });
}
