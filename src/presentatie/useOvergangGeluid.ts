import { useCallback, useEffect, useRef, useState } from "react";
import type { OvergangGeluid } from "./overgangen";

export function useGeluidsadres(
  bytes: Uint8Array | undefined,
  mime = "audio/wav",
) {
  const [adres, setAdres] = useState<string | undefined>();
  useEffect(() => {
    if (!bytes) {
      setAdres(undefined);
      return;
    }
    const url = URL.createObjectURL(
      new Blob([new Uint8Array(bytes)], { type: mime }),
    );
    setAdres(url);
    return () => URL.revokeObjectURL(url);
  }, [bytes, mime]);
  return adres;
}

/** Eén geluidsbron in het hoofdvenster; dubbele schermen spelen geen dubbel geluid. */
export function useOvergangGeluid(
  index: number,
  geluiden: readonly OvergangGeluid[],
  actief: boolean,
) {
  const bron = useRef<HTMLAudioElement | null>(null),
    adres = useRef<string | null>(null);
  const [fout, setFout] = useState(false);
  const stop = useCallback(() => {
    if (bron.current) {
      bron.current.pause();
      bron.current.removeAttribute("src");
      bron.current.load();
      bron.current = null;
    }
    if (adres.current) {
      URL.revokeObjectURL(adres.current);
      adres.current = null;
    }
  }, []);
  const probeer = useCallback(() => {
    const audio = bron.current;
    if (!audio) return;
    void audio
      .play()
      .then(() => {
        if (bron.current === audio) setFout(false);
      })
      .catch(() => {
        if (bron.current === audio) setFout(true);
      });
  }, []);
  useEffect(() => {
    if (!actief) {
      stop();
      setFout(false);
      return;
    }
    const geluid = geluiden[index];
    if (!geluid) return; // Een lus loopt door tot het volgende geluidscommando.
    stop();
    setFout(false);
    if ("stop" in geluid) return;
    const url = URL.createObjectURL(
      new Blob([new Uint8Array(geluid.bytes)], { type: geluid.mime }),
    );
    const audio = new Audio(url);
    audio.loop = geluid.loop;
    bron.current = audio;
    adres.current = url;
    audio.onerror = () => {
      if (bron.current === audio) setFout(true);
    };
    probeer();
  }, [index, geluiden, actief, stop, probeer]);
  useEffect(() => stop, [stop]);
  return { fout, probeer };
}
