import { useCallback, useRef } from "react";
import { speelOvergang } from "./overgang-beeld";
import { GEEN_OVERGANG, type Overgang } from "./overgangen";

export function useOvergangTeken(
  index: number,
  bron: (index: number, breedte: number) => Promise<CanvasImageSource | null>,
  overgang = GEEN_OVERGANG,
) {
  const laatste = useRef(new WeakMap<HTMLCanvasElement, number>());
  return useCallback(
    async (
      canvas: HTMLCanvasElement,
      breedte: number,
      signal?: AbortSignal,
    ) => {
      const beeld = await bron(index, breedte);
      if (!beeld || signal?.aborted) return;
      const zelfde = laatste.current.get(canvas) === index;
      let oud: HTMLCanvasElement | null = null;
      if (
        !zelfde &&
        laatste.current.has(canvas) &&
        canvas.width > 1 &&
        canvas.height > 1
      ) {
        oud = canvas.ownerDocument.createElement("canvas");
        oud.width = canvas.width;
        oud.height = canvas.height;
        oud.getContext("2d")?.drawImage(canvas, 0, 0);
      }
      const maat = beeld as HTMLCanvasElement | HTMLImageElement;
      canvas.width = "naturalWidth" in maat ? maat.naturalWidth : maat.width;
      canvas.height =
        "naturalHeight" in maat ? maat.naturalHeight : maat.height;
      laatste.current.set(canvas, index);
      await speelOvergang(
        canvas,
        oud,
        beeld,
        zelfde ? GEEN_OVERGANG : overgang,
        signal,
      );
    },
    [index, bron, overgang],
  );
}
