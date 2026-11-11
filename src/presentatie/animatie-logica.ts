import {
  animatieGroepen,
  type Animatie,
  type GeplandeAnimatie,
} from "./animaties";

export interface AnimatieStaat {
  alpha: number;
  dx: number;
  dy: number;
  hoek: number;
}
export function animatieStaat(
  lijst: readonly GeplandeAnimatie[],
  tijden: ReadonlyMap<number, number>,
  nu: number,
  verminderd = false,
): AnimatieStaat {
  const eerste = lijst.find(
    (a) => a.effect === "fadeIn" || a.effect === "fadeOut",
  );
  const uit = {
    alpha: eerste?.effect === "fadeIn" ? 0 : 1,
    dx: 0,
    dy: 0,
    hoek: 0,
  };
  for (const a of lijst) {
    const vanaf = tijden.get(a.groep);
    if (vanaf === undefined || nu < vanaf + a.begin) continue;
    const p =
      verminderd || a.duur <= 0
        ? 1
        : Math.max(0, Math.min(1, (nu - vanaf - a.begin) / a.duur));
    if (a.effect === "fadeIn") uit.alpha = p;
    else if (a.effect === "fadeOut") uit.alpha = 1 - p;
    else if (a.effect === "move") {
      uit.dx += a.dx * p;
      uit.dy += a.dy * p;
    } else if (a.effect === "spin") uit.hoek += a.hoek * p;
  }
  return uit;
}

export function groepEinden(lijst: readonly Animatie[]) {
  const uit = new Map<number, number>();
  for (const a of animatieGroepen(lijst))
    uit.set(a.groep, Math.max(uit.get(a.groep) ?? 0, a.eind));
  return uit;
}

/** Automatisch voorbeeld: iedere klikgroep start na het afronden van de vorige. */
export function voorbeeldTijden(lijst: readonly Animatie[], begin: number) {
  const tijden = new Map<number, number>(),
    einden = groepEinden(lijst);
  let klok = begin;
  for (const [groep, eind] of einden) {
    tijden.set(groep, klok);
    klok += eind + 180;
  }
  return { tijden, eind: klok };
}
