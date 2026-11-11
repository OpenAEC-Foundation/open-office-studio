import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DiaMedium, MediaInstellingen } from "./media";
import { mediaWeergavenaam } from "./mediaNaam";

export function useMediaUrl(bytes: Uint8Array | null, mime: string) {
  const [url, zet] = useState("");
  useEffect(() => {
    if (!bytes) {
      zet("");
      return;
    }
    const u = URL.createObjectURL(
      new Blob([bytes.slice().buffer], { type: mime }),
    );
    zet(u);
    return () => URL.revokeObjectURL(u);
  }, [bytes, mime]);
  return url;
}
/** HTML-decoder: een niet ondersteunde codec verandert het ingesloten bestand niet. */
export function MediaSpeler({
  medium,
  instellingen,
  actief = true,
  stil = false,
  gereed,
  frame,
}: {
  medium: Pick<DiaMedium, "id" | "bytes" | "mime" | "soort" | "naam" | "poster">;
  instellingen: MediaInstellingen;
  actief?: boolean;
  stil?: boolean;
  gereed?: (duur: number) => void;
  frame?: (el: HTMLVideoElement | null) => void;
}) {
  const { t } = useTranslation("presentation"),
    ref = useRef<HTMLMediaElement | null>(null);
  const url = useMediaUrl(medium.bytes, medium.mime),
    [fout, zetFout] = useState(false),
    [geblokkeerd, zetGeblokkeerd] = useState(false);
  const [speelt, zetSpeelt] = useState(false);
  const poster = useMediaUrl(medium.poster ?? null, "image/png");
  const hervatten = useRef(false),
    geladen = useRef(false);
  const gestart = useRef(false);
  const eindstop = useRef<{ tijd: number; eind: number } | null>(null);
  const settings = useRef(instellingen);
  settings.current = instellingen;
  const frameCallback = useRef(frame);
  frameCallback.current = frame;
  const koppel = useCallback((el: HTMLMediaElement | null) => {
    if (!el) ref.current?.pause();
    ref.current = el;
    frameCallback.current?.(el instanceof HTMLVideoElement ? el : null);
  }, []);
  const volume = (v: number) =>
    Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
  async function speel() {
    try {
      await ref.current?.play();
      zetGeblokkeerd(false);
    } catch {
      zetGeblokkeerd(true);
    }
  }
  useEffect(() => {
    zetFout(false);
    zetGeblokkeerd(false);
    geladen.current = false;
    gestart.current = false;
    eindstop.current = null;
  }, [url]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.volume = volume(instellingen.volume);
    el.muted = stil;
  }, [instellingen.volume, stil, url]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!actief) {
      hervatten.current = !el.paused;
      el.pause();
    } else if (
      geladen.current &&
      (hervatten.current || (instellingen.automatisch && !gestart.current))
    ) {
      hervatten.current = false;
      void speel();
    }
  }, [actief, url, instellingen.automatisch]);
  useEffect(
    () => () => {
      ref.current?.pause();
    },
    [],
  );
  useEffect(() => {
    if (!speelt) return;
    const id = window.setInterval(() => {
      if (ref.current && !ref.current.paused) grens();
    }, 40);
    return () => window.clearInterval(id);
  }, [url, actief, speelt]);
  function grens() {
    const el = ref.current,
      s = settings.current;
    if (!el || !Number.isFinite(el.duration)) return;
    if (
      !Number.isFinite(s.begin) ||
      !Number.isFinite(s.eindeAf) ||
      s.begin < 0 ||
      s.eindeAf < 0
    ) {
      el.pause();
      return;
    }
    const eind = el.duration - s.eindeAf;
    if (s.begin >= eind) {
      el.pause();
      zetFout(true);
      return;
    }
    if (el.currentTime < s.begin - 0.04) el.currentTime = s.begin;
    if (el.currentTime >= eind - 0.025) {
      if (s.herhalen && actief) {
        el.currentTime = s.begin;
        void speel();
      } else {
        el.pause();
        el.currentTime = Math.max(s.begin, eind - 0.03);
        eindstop.current = { tijd: el.currentTime, eind };
      }
    }
  }
  const props = {
    src: url || undefined,
    controls: true,
    preload: "metadata",
    "aria-label": mediaWeergavenaam(medium, t),
    ref: koppel,
    onLoadedMetadata: () => {
      const el = ref.current!;
      geladen.current = true;
      el.volume = volume(settings.current.volume);
      el.muted = stil;
      gereed?.(el.duration);
      if (Number.isFinite(settings.current.begin) && settings.current.begin > 0)
        el.currentTime = Math.min(
          settings.current.begin,
          Number.isFinite(el.duration) ? el.duration : settings.current.begin,
        );
      grens();
      if (actief && settings.current.automatisch && !gestart.current) void speel();
    },
    onTimeUpdate: grens,
    onSeeking: grens,
    onPlay: () => {
      zetSpeelt(true);
      if (!actief) ref.current?.pause();
      else {
        gestart.current = true;
        const el = ref.current!,
          stop = eindstop.current;
        // Alleen onze eigen eindstop herstarten. Gewoon pauzeren, terugspoelen
        // of het einde verlengen moet de gekozen afspeelpositie behouden.
        if (
          stop &&
          Math.abs(el.currentTime - stop.tijd) < 0.001 &&
          Math.abs(el.duration - settings.current.eindeAf - stop.eind) < 0.001
        )
          el.currentTime = settings.current.begin;
        eindstop.current = null;
        grens();
      }
    },
    onPause: () => zetSpeelt(false),
    onEnded: () => {
      if (settings.current.herhalen && actief && ref.current) {
        ref.current.currentTime = settings.current.begin;
        void speel();
      }
    },
    onError: () => zetFout(true),
  };
  return (
    <div
      className="media-speler"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {medium.soort === "video" ? (
        <video {...props} poster={poster || undefined} playsInline />
      ) : (
        <audio {...props} />
      )}
      {fout && <p role="status">{t("media.codecFailed")}</p>}
      {geblokkeerd && !fout && (
        <button type="button" onClick={() => void speel()}>
          {t("media.play")}
        </button>
      )}
    </div>
  );
}
