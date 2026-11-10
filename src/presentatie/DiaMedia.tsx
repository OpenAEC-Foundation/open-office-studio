import { useContext, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Film } from "lucide-react";
import { RibbonFout } from "../Ribbon";
import { useEditorApi } from "../lint/editorApi";
import { DiaKnop, huidigeIndex } from "../lint/presentatie-acties";
import { Dialoog } from "../werkruimte/Dialoog";
import {
  leesMedia,
  mediaFormaat,
  wijzigMedia,
  voegMediaToe,
  MediaFout,
  STANDAARD_MEDIA,
  type DiaMedium,
  type MediaInstellingen,
} from "./media";
import { MediaSpeler } from "./MediaSpeler";
import "./media.css";

async function canvasPng(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("poster"))),
      "image/png",
    ),
  );
  return new Uint8Array(await blob.arrayBuffer());
}
async function standaardPoster(naam: string, video: boolean) {
  const c = document.createElement("canvas");
  c.width = 640;
  c.height = 360;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#182b42";
  ctx.fillRect(0, 0, 640, 360);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(285, 110);
  ctx.lineTo(285, 225);
  ctx.lineTo(385, 168);
  ctx.closePath();
  ctx.fill();
  ctx.font = "22px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${video ? "▶" : "♫"} ${naam.slice(0, 42)}`, 320, 285, 590);
  return canvasPng(c);
}
interface Begin {
  index: number;
  lijst: DiaMedium[];
}
export function DiaMedia() {
  const { t } = useTranslation("presentation"),
    { presentatie: api, herlaad } = useEditorApi(),
    meld = useContext(RibbonFout);
  const bewerkbaar = useSyncExternalStore(
    (l) => api?.commands.subscribe(l) ?? (() => {}),
    () => api?.commands.getState("insertSlide").enabled ?? false,
  );
  const [begin, zetBegin] = useState<Begin | null>(null),
    [laden, zetLaden] = useState(false);
  async function open() {
    if (!herlaad || !bewerkbaar || laden) return;
    zetLaden(true);
    try {
      const index = huidigeIndex();
      zetBegin({ index, lijst: leesMedia(await herlaad.bytes(), index) });
    } catch {
      meld(t("sorter.packageFailed"));
    } finally {
      zetLaden(false);
    }
  }
  return (
    <>
      <DiaKnop
        naam={t("media.title")}
        icoon={Film}
        uit={!herlaad || !bewerkbaar || laden}
        onClick={() => void open()}
      />
      {begin && (
        <MediaVenster
          begin={begin}
          sluit={() => zetBegin(null)}
          opslaan={async (id, medium, s, poster) => {
            if (!herlaad || !api?.commands.getState("insertSlide").enabled)
              throw new Error("readOnly");
            const bytes = await herlaad.bytes(),
              na =
                id === null
                  ? voegMediaToe(
                      bytes,
                      begin.index,
                      medium.naam,
                      medium.bytes!,
                      poster!,
                      s,
                    )
                  : wijzigMedia(bytes, begin.index, id, s, poster);
            zetBegin(null);
            if (na !== bytes) herlaad.vervang(na, { dia: begin.index });
          }}
        />
      )}
    </>
  );
}
function MediaVenster({
  begin,
  sluit,
  opslaan,
}: {
  begin: Begin;
  sluit: () => void;
  opslaan: (
    id: number | null,
    m: DiaMedium,
    s: MediaInstellingen,
    p?: Uint8Array,
  ) => Promise<void>;
}) {
  const { t } = useTranslation("presentation");
  const [gekozen, kies] = useState(begin.lijst[0]?.id ?? -1),
    [nieuw, zetNieuw] = useState<DiaMedium | null>(null);
  const [s, zet] = useState<MediaInstellingen>(
      begin.lijst[0] ?? STANDAARD_MEDIA,
    ),
    [poster, zetPoster] = useState<Uint8Array>();
  const [bezig, zetBezig] = useState(false),
    [fout, zetFout] = useState(""),
    [duur, zetDuur] = useState(NaN);
  const frame = useRef<HTMLVideoElement | null>(null),
    request = useRef(0);
  const m = nieuw ?? begin.lijst.find((m) => m.id === gekozen),
    readOnly = !nieuw && !m?.bewerkbaar;
  async function bestand(f?: File) {
    if (!f) return;
    const ticket = ++request.current;
    zetBezig(true);
    zetFout("");
    try {
      if (f.size > 50 * 1024 * 1024) throw new MediaFout("invalidFile");
      const bytes = new Uint8Array(await f.arrayBuffer()),
        format = mediaFormaat(f.name, bytes),
        p = await standaardPoster(f.name, format.soort === "video");
      if (ticket !== request.current) return;
      zetNieuw({
        id: -1,
        naam: f.name,
        bytes,
        ...format,
        ...STANDAARD_MEDIA,
        extern: false,
        bewerkbaar: true,
        opDia: true,
        x: 0,
        y: 0,
        breedte: 1,
        hoogte: 1,
        rotatie: 0,
      });
      kies(-1);
      zet({ ...STANDAARD_MEDIA });
      zetPoster(p);
      zetDuur(NaN);
    } catch {
      zetFout(t("media.invalidFile"));
    } finally {
      if (ticket === request.current) zetBezig(false);
    }
  }
  async function pakFrame() {
    const v = frame.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas"),
      scale = Math.min(1, 1280 / v.videoWidth, 1280 / v.videoHeight);
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    zetPoster(await canvasPng(c));
  }
  async function bewaar() {
    if (!m) return;
    if (Number.isFinite(duur) && s.begin + s.eindeAf >= duur) {
      zetFout(t("media.invalidTrim"));
      return;
    }
    zetBezig(true);
    zetFout("");
    try {
      await opslaan(nieuw ? null : gekozen, m, s, poster);
    } catch (e) {
      zetFout(
        t(
          e instanceof MediaFout
            ? "media.invalidSettings"
            : "sorter.packageFailed",
        ),
      );
    } finally {
      zetBezig(false);
    }
  }
  return (
    <Dialoog
      titel={t("media.title")}
      sluit={() => {
        request.current++;
        sluit();
      }}
      className="media-dialoog"
      acties={
        <>
          <button type="button" onClick={sluit}>
            {t("media.cancel")}
          </button>
          <button
            type="button"
            disabled={
              !m ||
              readOnly ||
              bezig ||
              !Number.isFinite(s.begin) ||
              !Number.isFinite(s.eindeAf)
            }
            onClick={() => void bewaar()}
          >
            {t("media.apply")}
          </button>
        </>
      }
    >
      <p>{t("media.limit")}</p>
      <label className="media-bestand">
        {t("media.insert")}
        <input
          type="file"
          accept=".mp4,.webm,.mp3,.m4a,.wav"
          disabled={bezig}
          onChange={(e) => {
            void bestand(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      {!!begin.lijst.length && (
        <label>
          {t("media.existing")}
          <select
            aria-label={t("media.existing")}
            value={nieuw ? "" : gekozen}
            disabled={bezig}
            onChange={(e) => {
              const m = begin.lijst.find(
                (m) => m.id === Number(e.target.value),
              );
              if (m) {
                request.current++;
                zetNieuw(null);
                kies(m.id);
                zet(m);
                zetPoster(undefined);
                zetDuur(NaN);
                zetFout("");
              }
            }}
          >
            {nieuw && <option value="">{t("media.newFile")}</option>}
            {begin.lijst.map((m) => (
              <option key={m.id} value={m.id}>
                {m.naam}
              </option>
            ))}
          </select>
        </label>
      )}
      {m ? (
        <>
          <h3>{m.naam}</h3>
          {m.bytes ? (
            <MediaSpeler
              key={`${gekozen}:${m.naam}`}
              medium={m}
              instellingen={{ ...s, automatisch: false }}
              gereed={zetDuur}
              frame={(el) => {
                frame.current = el;
              }}
            />
          ) : (
            <p role="status">
              {t(m.extern ? "media.external" : "media.missing")}
            </p>
          )}
          {readOnly && <p role="status">{t("media.readOnly")}</p>}
          <fieldset disabled={readOnly || bezig}>
            <legend>{t("media.settings")}</legend>
            <label>
              <input
                type="checkbox"
                checked={s.automatisch}
                onChange={(e) => zet({ ...s, automatisch: e.target.checked })}
              />
              {t("media.auto")}
            </label>
            <label>
              <input
                type="checkbox"
                checked={s.herhalen}
                onChange={(e) => zet({ ...s, herhalen: e.target.checked })}
              />
              {t("media.loop")}
            </label>
            <label>
              {t("media.volume")}
              <input
                aria-label={t("media.volume")}
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={s.volume}
                onChange={(e) => zet({ ...s, volume: Number(e.target.value) })}
              />
            </label>
            <label>
              {t("media.start")}
              <input
                type="number"
                min="0"
                max="86400"
                step="0.1"
                value={Number.isFinite(s.begin) ? s.begin : ""}
                onChange={(e) => zet({ ...s, begin: e.target.valueAsNumber })}
              />
            </label>
            <label>
              {t("media.end")}
              <input
                type="number"
                min="0"
                max="86400"
                step="0.1"
                value={Number.isFinite(s.eindeAf) ? s.eindeAf : ""}
                onChange={(e) => zet({ ...s, eindeAf: e.target.valueAsNumber })}
              />
            </label>
            {m.soort === "video" && (
              <button
                type="button"
                onClick={() =>
                  void pakFrame().catch(() => zetFout(t("media.posterFailed")))
                }
              >
                {t("media.capture")}
              </button>
            )}
            {poster && <span role="status">{t("media.posterReady")}</span>}
          </fieldset>
          <p>{t("media.reloadHint")}</p>
        </>
      ) : (
        <p>{t("media.empty")}</p>
      )}
      {fout && <p role="alert">{fout}</p>}
    </Dialoog>
  );
}
