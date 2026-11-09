import {
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { PptxEditorApi } from "@betteroffice/pptx-react";
import { Image } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RibbonFout } from "../Ribbon";
import { useEditorApi } from "../lint/editorApi";
import {
  DiaKnop,
  geselecteerdeVorm,
  huidigeIndex,
} from "../lint/presentatie-acties";
import { Dialoog } from "../werkruimte/Dialoog";
import {
  AfbeeldingFout,
  controleerBeeld,
  controleerBijsnijden,
  leesAfbeeldingen,
  schrijfAfbeelding,
  type Bijsnijden,
  type DiaAfbeelding,
} from "./afbeeldingen";
import "./afbeeldingen.css";
interface Begin {
  api: PptxEditorApi;
  versie: string;
  dia: number;
  afbeeldingen: DiaAfbeelding[];
  keuze: string;
}
export function DiaAfbeeldingen() {
  const { t } = useTranslation("presentation"),
    { presentatie: api, herlaad } = useEditorApi(),
    meld = useContext(RibbonFout);
  const [begin, setBegin] = useState<Begin | null>(null),
    [laden, setLaden] = useState(false);
  const editable = useSyncExternalStore(
    (l) => api?.commands.subscribe(l) ?? (() => {}),
    () => api?.commands.getState("insertSlide").enabled ?? false,
  );
  const fout = (e: unknown) =>
    t(`pictures.errors.${e instanceof AfbeeldingFout ? e.code : "invalid"}`);
  async function open() {
    if (!api || !herlaad || !editable) return;
    setLaden(true);
    try {
      const dia = huidigeIndex(),
        selected = String(geselecteerdeVorm(api)?.vorm.sourceId ?? ""),
        bytes = await herlaad.bytes(),
        afbeeldingen = leesAfbeeldingen(bytes, dia);
      if (!afbeeldingen.length) throw new AfbeeldingFout("missing");
      setBegin({
        api,
        versie: api.handle.version(),
        dia,
        afbeeldingen,
        keuze:
          afbeeldingen.find((p) => p.id === selected)?.id ?? afbeeldingen[0].id,
      });
    } catch (e) {
      meld(fout(e));
    } finally {
      setLaden(false);
    }
  }
  return (
    <>
      <DiaKnop
        naam={t("pictures.title")}
        icoon={Image}
        uit={!editable || laden}
        onClick={() => void open()}
      />
      {begin && begin.api === api && (
        <BeeldVenster
          begin={begin}
          sluit={() => setBegin(null)}
          fout={fout}
          doe={async (id, edit) => {
            if (
              !api ||
              !herlaad ||
              !api.commands.getState("insertSlide").enabled ||
              api.handle.version() !== begin.versie
            )
              throw new AfbeeldingFout("missing");
            const bytes = await herlaad.bytes();
            if (api.handle.version() !== begin.versie)
              throw new AfbeeldingFout("missing");
            const result = schrijfAfbeelding(bytes, begin.dia, id, edit);
            setBegin(null);
            herlaad.vervang(result, { dia: begin.dia });
          }}
        />
      )}
    </>
  );
}
type Edit = Parameters<typeof schrijfAfbeelding>[3];
function BeeldVenster({
  begin,
  sluit,
  doe,
  fout,
}: {
  begin: Begin;
  sluit: () => void;
  doe: (id: string, edit: Edit) => Promise<void>;
  fout: (e: unknown) => string;
}) {
  const { t } = useTranslation("presentation"),
    [keuze, setKeuze] = useState(begin.keuze);
  return (
    <BeeldVelden
      key={keuze}
      bron={begin.afbeeldingen.find((p) => p.id === keuze)!}
      sluit={sluit}
      fout={fout}
      doe={(edit) => doe(keuze, edit)}
      kies={
        <label>
          {t("pictures.choose")}
          <select
            aria-label={t("pictures.choose")}
            value={keuze}
            onChange={(e) => setKeuze(e.target.value)}
          >
            {begin.afbeeldingen.map((p, i) => (
              <option key={p.id} value={p.id}>
                {p.naam || t("pictures.image", { number: i + 1 })}
              </option>
            ))}
          </select>
        </label>
      }
    />
  );
}
function BeeldVelden({
  bron,
  kies,
  sluit,
  doe,
  fout,
}: {
  bron: DiaAfbeelding;
  kies: React.ReactNode;
  sluit: () => void;
  doe: (edit: Edit) => Promise<void>;
  fout: (e: unknown) => string;
}) {
  const { t } = useTranslation("presentation");
  const [crop, setCrop] = useState(
    () =>
      Object.fromEntries(
        Object.entries(bron.bijsnijden).map(([k, v]) => [k, String(v)]),
      ) as Record<keyof Bijsnijden, string>,
  );
  const beginAlpha = Math.max(0, Math.min(100, bron.transparantie));
  const [alpha, setAlpha] = useState(String(beginAlpha)),
    [replacement, setReplacement] = useState<{
      bytes: Uint8Array;
      mime: string;
      naam: string;
    } | null>(null),
    [laden, setLaden] = useState(false),
    [bezig, setBezig] = useState(false),
    [melding, setMelding] = useState("");
  const leesId = useRef(0);
  const c = Object.fromEntries(
    Object.entries(crop).map(([k, v]) => [k, Number(v)]),
  ) as unknown as Bijsnijden;
  let geldig =
    Object.values(crop).every((v) => v.trim()) &&
    alpha.trim() !== "" &&
    Number.isFinite(Number(alpha)) &&
    Number(alpha) >= 0 &&
    Number(alpha) <= 100;
  try {
    controleerBijsnijden(c);
  } catch {
    geldig = false;
  }
  const dirtyCrop = Object.entries(c).some(
      ([k, v]) => v !== bron.bijsnijden[k as keyof Bijsnijden],
    ),
    dirtyAlpha = Number(alpha) !== beginAlpha;
  const gewijzigd = dirtyCrop || dirtyAlpha || !!replacement;
  async function bestand(file: File) {
    const id = ++leesId.current;
    setReplacement(null);
    setLaden(true);
    setMelding("");
    try {
      if (file.size > 20 * 1024 * 1024) throw new AfbeeldingFout("tooLarge");
      const bytes = new Uint8Array(await file.arrayBuffer()),
        info = controleerBeeld(bytes),
        url = URL.createObjectURL(
          new Blob([new Uint8Array(bytes)], { type: info.mime }),
        );
      try {
        const image = new window.Image();
        image.src = url;
        await image.decode();
      } finally {
        URL.revokeObjectURL(url);
      }
      if (id === leesId.current)
        setReplacement({ bytes, mime: info.mime, naam: file.name });
    } catch (e) {
      if (id === leesId.current) setMelding(fout(e));
    } finally {
      if (id === leesId.current) setLaden(false);
    }
  }
  return (
    <Dialoog
      titel={t("pictures.title")}
      className="presentatie-afbeeldingen"
      sluit={() => {
        if (!bezig && !laden) sluit();
      }}
      acties={
        <>
          <button
            className="werkruimte-knop"
            disabled={bezig || laden}
            onClick={sluit}
          >
            {t("common:cancel")}
          </button>
          <button
            className="werkruimte-knop is-primair"
            disabled={bezig || laden || !geldig || !gewijzigd}
            onClick={() => {
              setBezig(true);
              setMelding("");
              void doe({
                bijsnijden: dirtyCrop ? c : undefined,
                transparantie: dirtyAlpha ? Number(alpha) : undefined,
                vervanging: replacement?.bytes,
              })
                .catch((e) => setMelding(fout(e)))
                .finally(() => setBezig(false));
            }}
          >
            {t("pictures.apply")}
          </button>
        </>
      }
    >
      <fieldset disabled={bezig || laden}>
        {kies}
        <p>{t("design.reload")}</p>
        <div className="afbeelding-velden">
          <div>
            <h3>{t("pictures.crop")}</h3>
            {(["links", "boven", "rechts", "onder"] as const).map((k) => (
              <label key={k}>
                {t(`pictures.${k}`)}
                <input
                  type="number"
                  step="0.1"
                  value={crop[k]}
                  onChange={(e) => setCrop({ ...crop, [k]: e.target.value })}
                />
              </label>
            ))}
            <label>
              {t("pictures.transparency")}
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={alpha}
                onChange={(e) => setAlpha(e.target.value)}
              />
            </label>
            <label>
              {t("pictures.replace")}
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void bestand(file);
                }}
              />
            </label>
            {replacement && <p>{replacement.naam}</p>}
          </div>
          <BeeldVoorbeeld
            bytes={replacement?.bytes ?? bron.bytes}
            mime={replacement?.mime ?? bron.mime}
            crop={geldig ? c : bron.bijsnijden}
            alpha={geldig ? Number(alpha) : beginAlpha}
            verhouding={bron.verhouding}
          />
        </div>
      </fieldset>
      {!geldig && <p role="alert">{t("pictures.errors.invalid")}</p>}
      {melding && <p role="alert">{melding}</p>}
    </Dialoog>
  );
}
function BeeldVoorbeeld({
  bytes,
  mime,
  crop,
  alpha,
  verhouding,
}: {
  bytes?: Uint8Array;
  mime: string;
  crop: Bijsnijden;
  alpha: number;
  verhouding: number;
}) {
  const { t } = useTranslation("presentation"),
    canvas = useRef<HTMLCanvasElement>(null),
    [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    setImage(null);
    if (!bytes) return;
    const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes)], { type: mime }),
      ),
      img = new window.Image();
    let live = true;
    img.onload = () => {
      if (live) setImage(img);
    };
    img.src = url;
    return () => {
      live = false;
      img.onload = null;
      img.src = "";
      URL.revokeObjectURL(url);
    };
  }, [bytes, mime]);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, 320, 240);
    for (let y = 0; y < 240; y += 16)
      for (let x = 0; x < 320; x += 16) {
        ctx.fillStyle = (x / 16 + y / 16) % 2 ? "#dddddd" : "#ffffff";
        ctx.fillRect(x, y, 16, 16);
      }
    if (!image) return;
    try {
      controleerBijsnijden(crop);
      const width = Math.min(320, 240 * verhouding),
        height = width / verhouding;
      ctx.globalAlpha = Math.max(0, Math.min(1, 1 - alpha / 100));
      ctx.drawImage(
        image,
        (image.naturalWidth * crop.links) / 100,
        (image.naturalHeight * crop.boven) / 100,
        (image.naturalWidth * (100 - crop.links - crop.rechts)) / 100,
        (image.naturalHeight * (100 - crop.boven - crop.onder)) / 100,
        (320 - width) / 2,
        (240 - height) / 2,
        width,
        height,
      );
    } catch {
      /* Ongeldige tijdelijke invoer tekent geen beeld. */
    }
    ctx.globalAlpha = 1;
  }, [
    image,
    crop.links,
    crop.boven,
    crop.rechts,
    crop.onder,
    alpha,
    verhouding,
  ]);
  return (
    <figure>
      <canvas
        ref={canvas}
        width="320"
        height="240"
        role="img"
        aria-label={t("pictures.preview")}
      />
      <figcaption>{t("pictures.preview")}</figcaption>
    </figure>
  );
}
