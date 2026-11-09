import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PptxEditorApi } from "@betteroffice/pptx-react";
import {
  maakAnimatieScene,
  tekenAnimatieScene,
  type AnimatieScene,
} from "./animatie-beeld";
import { groepEinden } from "./animatie-logica";
import type { Animatie } from "./animaties";
import type { Overgang } from "./overgangen";
import { speelOvergang } from "./overgang-beeld";

const LEEG: Animatie[] = [];
interface Bron {
  beeld: HTMLCanvasElement;
  scene?: AnimatieScene;
}

/** Eén tijdlijn voor het huidige dia- en presentatorbeeld; React rendert niet per frame. */
export function useAnimatieVoorstelling(
  api: PptxEditorApi,
  index: number,
  lijst: readonly Animatie[],
  overgang: Overgang,
  statisch: (
    index: number,
    breedte: number,
  ) => Promise<HTMLCanvasElement | null>,
  pauze: boolean,
  actief: boolean,
) {
  const animaties = actief ? lijst : LEEG;
  const run = useMemo(
    () => ({
      tijden: new Map<number, number>(),
      einden: groepEinden(animaties),
      begonnen: false,
      entryEind: 0,
      pauzeOp: null as number | null,
      mislukt: false,
    }),
    [index, animaties],
  );
  const cache = useMemo(
    () => ({
      beloftes: new Map<number, Promise<Bron>>(),
      controllers: new Set<AbortController>(),
    }),
    [api, index, animaties],
  );
  useEffect(
    () => () => {
      for (const c of cache.controllers) c.abort();
      cache.beloftes.clear();
    },
    [cache],
  );
  const laatste = useRef(new WeakMap<HTMLCanvasElement, number>());
  const [versie, zetVersie] = useState(0);
  const [uitkomst, zetUitkomst] = useState<{
    run: typeof run;
    klaar: boolean;
    fout: boolean;
  } | null>(null);
  const laatstGemeld = useRef<{
    run: typeof run;
    klaar: boolean;
    fout: boolean;
  } | null>(null);
  const meld = useCallback(
    (klaar: boolean) => {
      const voor = laatstGemeld.current;
      if (
        voor?.run === run &&
        voor.klaar === klaar &&
        voor.fout === run.mislukt
      )
        return;
      const nieuw = { run, klaar, fout: run.mislukt };
      laatstGemeld.current = nieuw;
      zetUitkomst(nieuw);
    },
    [run],
  );
  const klok = useCallback(() => run.pauzeOp ?? performance.now(), [run]);
  const afgerond = useCallback(
    (nu: number) =>
      [...run.einden].every(
        ([groep, eind]) =>
          run.tijden.has(groep) && nu >= run.tijden.get(groep)! + eind,
      ),
    [run],
  );

  useEffect(() => {
    if (pauze && run.pauzeOp === null) run.pauzeOp = performance.now();
    else if (!pauze && run.pauzeOp !== null) {
      const verschil = performance.now() - run.pauzeOp;
      for (const [groep, tijd] of run.tijden)
        run.tijden.set(groep, tijd + verschil);
      run.entryEind += verschil;
      run.pauzeOp = null;
    }
    zetVersie((v) => v + 1);
  }, [pauze, run]);

  const bron = useCallback(
    (breedte: number): Promise<Bron> => {
      const maat = animaties.length ? Math.min(1920, breedte) : breedte;
      let p = cache.beloftes.get(maat);
      if (!p) {
        p = (async () => {
          if (animaties.length) {
            const controller = new AbortController();
            cache.controllers.add(controller);
            try {
              const scene = await maakAnimatieScene(
                api,
                index,
                maat,
                animaties,
                controller.signal,
              );
              const beeld = document.createElement("canvas");
              tekenAnimatieScene(beeld, scene, new Map(), -Infinity);
              return { beeld, scene };
            } catch (e) {
              if (controller.signal.aborted) throw e;
              run.mislukt = true;
              meld(true);
            } finally {
              cache.controllers.delete(controller);
            }
          }
          const beeld = await statisch(index, breedte);
          if (!beeld) throw new Error("slideUnavailable");
          return { beeld };
        })();
        cache.beloftes.set(maat, p);
        if (cache.beloftes.size > 2)
          cache.beloftes.delete(cache.beloftes.keys().next().value!);
      }
      return p;
    },
    [api, index, animaties, cache, statisch, run, meld],
  );

  const teken = useCallback(
    async (
      canvas: HTMLCanvasElement,
      breedte: number,
      signal?: AbortSignal,
    ) => {
      const inhoud = await bron(breedte);
      if (signal?.aborted) return;
      const zelfde = laatste.current.get(canvas) === index;
      let oud: HTMLCanvasElement | null = null;
      if (!zelfde && laatste.current.has(canvas)) {
        oud = canvas.ownerDocument.createElement("canvas");
        oud.width = canvas.width;
        oud.height = canvas.height;
        oud.getContext("2d")?.drawImage(canvas, 0, 0);
      }
      const nu = klok();
      if (!run.begonnen) {
        run.begonnen = true;
        const duur =
          canvas.ownerDocument.defaultView?.matchMedia(
            "(prefers-reduced-motion: reduce)",
          ).matches || ["none", "unknown"].includes(overgang.effect)
            ? 0
            : overgang.duur;
        run.entryEind = nu + duur;
        if (run.einden.has(-1)) run.tijden.set(-1, run.entryEind);
      }
      canvas.width = inhoud.beeld.width;
      canvas.height = inhoud.beeld.height;
      laatste.current.set(canvas, index);
      if (!zelfde)
        await speelOvergang(
          canvas,
          oud,
          inhoud.beeld,
          { ...overgang, duur: Math.max(0, run.entryEind - nu) },
          signal,
        );
      if (signal?.aborted) return;
      if (!inhoud.scene) {
        canvas.getContext("2d")?.drawImage(inhoud.beeld, 0, 0);
        meld(true);
        return;
      }
      const scene = inhoud.scene;
      await new Promise<void>((resolve) => {
        const venster = canvas.ownerDocument.defaultView ?? window;
        let id = 0;
        const klaar = () => {
          venster.cancelAnimationFrame(id);
          signal?.removeEventListener("abort", klaar);
          resolve();
        };
        const frame = () => {
          if (signal?.aborted) {
            klaar();
            return;
          }
          const nu = klok();
          tekenAnimatieScene(
            canvas,
            scene,
            run.tijden,
            nu,
            venster.matchMedia("(prefers-reduced-motion: reduce)").matches,
          );
          meld(afgerond(nu));
          const loopt = [...run.einden].some(
            ([groep, eind]) =>
              run.tijden.has(groep) && nu < run.tijden.get(groep)! + eind,
          );
          if (loopt && run.pauzeOp === null)
            id = venster.requestAnimationFrame(frame);
          else klaar();
        };
        signal?.addEventListener("abort", klaar, { once: true });
        frame();
      });
    },
    [bron, index, run, overgang, klok, meld, afgerond, versie],
  );

  const stap = useCallback(() => {
    if (!animaties.length || run.mislukt || !run.begonnen) return false;
    const nu = klok(),
      entryRest = Math.max(0, run.entryEind - nu);
    if (entryRest) {
      for (const [groep, tijd] of run.tijden)
        run.tijden.set(groep, tijd - entryRest);
      run.entryEind = nu;
    }
    const lopend = [...run.einden].filter(
      ([groep, eind]) =>
        run.tijden.has(groep) && nu < run.tijden.get(groep)! + eind,
    );
    if (lopend.length)
      for (const [groep, eind] of lopend) run.tijden.set(groep, nu - eind);
    else {
      const volgende = [...run.einden.keys()].find(
        (g) => g >= 0 && !run.tijden.has(g),
      );
      if (volgende === undefined) return false;
      run.tijden.set(volgende, nu);
    }
    zetVersie((v) => v + 1);
    meld(afgerond(nu));
    return true;
  }, [animaties, run, klok, meld, afgerond]);
  const terug = useCallback(() => {
    const groepen = [...run.tijden.keys()].filter((g) => g >= 0);
    if (!groepen.length || run.mislukt) return false;
    run.tijden.delete(Math.max(...groepen));
    zetVersie((v) => v + 1);
    meld(false);
    return true;
  }, [run, meld]);
  return {
    teken,
    stap,
    terug,
    voltooid: !animaties.length || (uitkomst?.run === run && uitkomst.klaar),
    fout: uitkomst?.run === run && uitkomst.fout,
  };
}
