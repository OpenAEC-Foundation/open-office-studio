import { useLayoutEffect, useRef } from "react";

interface BewaarSessie {
  oosBewaarUpdate?: boolean;
  onUpdate(meld: (update: unknown, oorsprong: string) => void): () => void;
}

/** Lees tijdens synchrone bewaaradoptie geen geometrie uit dezelfde sessie. */
export function volgBewaarProjectie(
  sessie: BewaarSessie,
  meld: () => void,
  actueel: () => boolean,
  plan: (werk: () => void) => void = queueMicrotask,
): () => void {
  let actief = true;
  let volgnummer = 0;
  const stop = sessie.onUpdate((_update, oorsprong) => {
    // Ook lokale invoer maakt een nog wachtende bewaarprojectie achterhaald.
    const nummer = ++volgnummer;
    if (oorsprong !== "remote" || !actief || !actueel()) return;
    if (!sessie.oosBewaarUpdate) { meld(); return; }
    plan(() => {
      if (actief && nummer === volgnummer && actueel()) meld();
    });
  });
  return () => { actief = false; ++volgnummer; stop(); };
}

/** Renderbinding weigert een oude sessie al vóór de effectopruiming. */
export function useBewaarProjectie(
  sessie: BewaarSessie | null | undefined,
  meld: (direct: boolean, oorsprong: string) => unknown,
  workerOpen: boolean | undefined,
  isWorkerSessie: (sessie: BewaarSessie) => boolean,
): void {
  const eigenaar = useRef(sessie);
  eigenaar.current = sessie;
  // Layoutopruiming beëindigt de binding bij verwijderen/herladen vóór een
  // microtaak kan lopen; een nieuwe effectbinding heeft een eigen levensduur.
  useLayoutEffect(() => {
    if (!sessie) return;
    return volgBewaarProjectie(sessie, () => {
      if (!workerOpen || !isWorkerSessie(sessie)) meld(true, "remote");
    }, () => eigenaar.current === sessie);
  }, [sessie, meld, workerOpen, isWorkerSessie]);
}
