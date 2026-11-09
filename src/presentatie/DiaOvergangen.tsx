import {
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useTranslation } from "react-i18next";
import { GalleryHorizontalEnd, Play } from "lucide-react";
import type { PptxEditorApi } from "@betteroffice/pptx-react";
import { RibbonFout } from "../Ribbon";
import { useEditorApi } from "../lint/editorApi";
import { DiaKnop, huidigeIndex } from "../lint/presentatie-acties";
import { Dialoog } from "../werkruimte/Dialoog";
import { tekenDia } from "./diabeeld";
import { leesWeergave } from "./weergave";
import {
  EFFECTEN,
  GEEN_OVERGANG,
  leesOvergangGegevens,
  geldigOvergangGeluid,
  schrijfOvergangen,
  type Geluidsbestand,
  type OvergangGeluid,
  type Overgang,
} from "./overgangen";
import { speelOvergang } from "./overgang-beeld";
import { useGeluidsadres } from "./useOvergangGeluid";
import "./overgangen.css";

interface Begin {
  index: number;
  aantal: number;
  selectie: number[];
  overgang: Overgang;
  geluid: OvergangGeluid;
}
export function DiaOvergangen() {
  const { t } = useTranslation("presentation");
  const { presentatie: api, herlaad } = useEditorApi();
  const meld = useContext(RibbonFout);
  const bewerkbaar = useSyncExternalStore(
    (l) => api?.commands.subscribe(l) ?? (() => {}),
    () => api?.commands.getState("insertSlide").enabled ?? false,
  );
  const [begin, setBegin] = useState<Begin | null>(null),
    [laden, setLaden] = useState(false);
  async function open() {
    if (!api || !herlaad || !bewerkbaar || laden) return;
    setLaden(true);
    try {
      const { overgangen: lijst, geluiden } = leesOvergangGegevens(
          await herlaad.bytes(),
        ),
        index = huidigeIndex();
      if (!lijst[index]) throw new Error("noSlide");
      setBegin({
        index,
        aantal: lijst.length,
        selectie: leesWeergave(herlaad).selectie,
        overgang: lijst[index],
        geluid: geluiden[index],
      });
    } catch {
      meld(t("sorter.packageFailed"));
    } finally {
      setLaden(false);
    }
  }
  return (
    <>
      <DiaKnop
        naam={t("transitions.title")}
        icoon={GalleryHorizontalEnd}
        uit={!api || !herlaad || !bewerkbaar || laden}
        onClick={() => void open()}
      />
      {begin && api && (
        <OvergangVenster
          begin={begin}
          api={api}
          sluit={() => setBegin(null)}
          opslaan={async (o, selectie, geluid, bestand) => {
            if (!herlaad || !api.commands.getState("insertSlide").enabled)
              throw new Error("readOnly");
            const bytes = schrijfOvergangen(
              await herlaad.bytes(),
              selectie,
              o,
              geluid,
              bestand,
            );
            setBegin(null);
            herlaad.vervang(bytes, { dia: begin.index });
          }}
        />
      )}
    </>
  );
}

function Voorbeeld({
  api,
  index,
  overgang,
}: {
  api: PptxEditorApi;
  index: number;
  overgang: Overgang;
}) {
  const { t } = useTranslation("presentation");
  const canvas = useRef<HTMLCanvasElement>(null);
  const [poging, setPoging] = useState(0),
    [fout, setFout] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setFout(false);
    void (async () => {
      const nieuw = document.createElement("canvas"),
        oud = document.createElement("canvas");
      if (!(await tekenDia(api, index, nieuw, 600))) throw new Error("preview");
      if (index > 0 && !(await tekenDia(api, index - 1, oud, 600)))
        throw new Error("preview");
      const doel = canvas.current;
      if (!doel || controller.signal.aborted) return;
      doel.width = nieuw.width;
      doel.height = nieuw.height;
      await speelOvergang(
        doel,
        index > 0 ? oud : null,
        nieuw,
        poging ? overgang : GEEN_OVERGANG,
        controller.signal,
      );
    })().catch(() => {
      if (!controller.signal.aborted) setFout(true);
    });
    return () => controller.abort();
  }, [api, index, overgang, poging]);
  return (
    <div className="overgang-voorbeeld">
      <canvas ref={canvas} role="img" aria-label={t("transitions.preview")} />
      {fout && <p role="alert">{t("transitions.previewFailed")}</p>}
      <button
        type="button"
        className="werkruimte-knop"
        onClick={() => setPoging((n) => n + 1)}
        disabled={overgang.effect === "unknown"}
      >
        <Play size={15} aria-hidden="true" />
        {t("transitions.preview")}
      </button>
    </div>
  );
}

function OvergangVenster({
  begin,
  api,
  sluit,
  opslaan,
}: {
  begin: Begin;
  api: PptxEditorApi;
  sluit: () => void;
  opslaan: (
    o: Overgang,
    selectie: number[],
    geluid: boolean,
    bestand?: Geluidsbestand,
  ) => Promise<void>;
}) {
  const { t } = useTranslation("presentation");
  const [o, setO] = useState(begin.overgang),
    [doel, setDoel] = useState("current");
  const [geluid, setGeluid] = useState<"keep" | "none" | "file">("keep"),
    [bestand, setBestand] = useState<Geluidsbestand | undefined>(),
    [bestandLaden, setBestandLaden] = useState(false),
    [bezig, setBezig] = useState(false),
    [melding, setMelding] = useState("");
  const bestandskeuze = useRef(0);
  useEffect(
    () => () => {
      bestandskeuze.current++;
    },
    [],
  );
  const bestaand =
    begin.geluid && !("stop" in begin.geluid) ? begin.geluid : undefined;
  const geluidsadres = useGeluidsadres(
    geluid === "file"
      ? bestand?.bytes
      : geluid === "keep"
        ? bestaand?.bytes
        : undefined,
    geluid === "keep" ? bestaand?.mime : undefined,
  );
  async function kiesBestand(file: File | undefined) {
    const keuze = ++bestandskeuze.current;
    setBestand(undefined);
    setMelding("");
    if (!file) { setBestandLaden(false); return; }
    setBestandLaden(true);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("tooLarge");
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bestandskeuze.current !== keuze) return;
      if (!geldigOvergangGeluid(bytes)) throw new Error("invalidSound");
      setBestand({ naam: file.name, bytes });
    } catch {
      if (bestandskeuze.current === keuze)
        setMelding(t("transitions.invalidSound"));
    } finally {
      if (bestandskeuze.current === keuze) setBestandLaden(false);
    }
  }
  function wijzig<K extends keyof Overgang>(key: K, waarde: Overgang[K]) {
    setO((v) => ({ ...v, [key]: waarde }));
    setMelding("");
  }
  async function toepassen() {
    if (bestandLaden) return;
    if (geluid === "file" && !bestand) {
      setMelding(t("transitions.invalidSound"));
      return;
    }
    if (
      !Number.isInteger(o.duur) ||
      o.duur < 0 ||
      o.duur > 60000 ||
      (o.na !== null &&
        (!Number.isInteger(o.na) || o.na < 0 || o.na > 86400000)) ||
      (!o.klik && o.na === null)
    ) {
      setMelding(t("transitions.invalidTiming"));
      return;
    }
    setBezig(true);
    setMelding("");
    try {
      await opslaan(
        o,
        doel === "all"
          ? Array.from({ length: begin.aantal }, (_, i) => i)
          : doel === "selected"
            ? begin.selectie
            : [begin.index],
        geluid === "keep",
        geluid === "file" ? bestand : undefined,
      );
    } catch {
      setMelding(t("sorter.packageFailed"));
    } finally {
      setBezig(false);
    }
  }
  const richtingen = o.effect === "push" || o.effect === "wipe";
  const inUit = o.effect === "split" || o.effect === "zoom";
  return (
    <Dialoog
      titel={t("transitions.title")}
      className="presentatie-overgangen"
      sluit={() => {
        if (!bezig) sluit();
      }}
      acties={
        <>
          <button
            type="button"
            className="werkruimte-knop"
            disabled={bezig}
            onClick={sluit}
          >
            {t("common:cancel")}
          </button>
          <button
            type="button"
            className="werkruimte-knop is-primair"
            disabled={bezig || bestandLaden}
            onClick={() => void toepassen()}
          >
            {t(bezig ? "transitions.applying" : "transitions.apply")}
          </button>
        </>
      }
    >
      <fieldset className="overgang-instellingen" disabled={bezig}>
        <label className="overgang-rij">
          <span>{t("transitions.effect")}</span>
          <select
            className="werkruimte-invoer"
            value={o.effect}
            onChange={(e) =>
              wijzig("effect", e.target.value as Overgang["effect"])
            }
          >
            {EFFECTEN.map((effect) => (
              <option key={effect} value={effect}>
                {t(`transitions.${effect}`)}
              </option>
            ))}
            <option value="unknown">{t("transitions.keep")}</option>
          </select>
        </label>
        {o.effect === "unknown" && (
          <p className="werkruimte-uitleg">{t("transitions.unknownHint")}</p>
        )}
        <label className="overgang-rij">
          <span>{t("transitions.duration")}</span>
          <input
            className="werkruimte-invoer"
            type="number"
            min={0}
            max={60}
            step={0.1}
            value={Number.isFinite(o.duur) ? o.duur / 1000 : ""}
            onChange={(e) =>
              wijzig(
                "duur",
                e.target.value === ""
                  ? NaN
                  : Math.round(Number(e.target.value) * 1000),
              )
            }
          />
        </label>
        {richtingen && (
          <label className="overgang-rij">
            <span>{t("transitions.direction")}</span>
            <select
              className="werkruimte-invoer"
              value={o.richting}
              onChange={(e) =>
                wijzig("richting", e.target.value as Overgang["richting"])
              }
            >
              {["l", "r", "u", "d"].map((r) => (
                <option key={r} value={r}>
                  {t(`transitions.${r}`)}
                </option>
              ))}
            </select>
          </label>
        )}
        {inUit && (
          <label className="overgang-rij">
            <span>{t("transitions.direction")}</span>
            <select
              className="werkruimte-invoer"
              value={o.inUit}
              onChange={(e) =>
                wijzig("inUit", e.target.value as Overgang["inUit"])
              }
            >
              {["in", "out"].map((r) => (
                <option key={r} value={r}>
                  {t(`transitions.${r}`)}
                </option>
              ))}
            </select>
          </label>
        )}
        {o.effect === "split" && (
          <label className="overgang-rij">
            <span>{t("transitions.orientation")}</span>
            <select
              className="werkruimte-invoer"
              value={o.orientatie}
              onChange={(e) =>
                wijzig("orientatie", e.target.value as Overgang["orientatie"])
              }
            >
              {["horz", "vert"].map((r) => (
                <option key={r} value={r}>
                  {t(`transitions.${r}`)}
                </option>
              ))}
            </select>
          </label>
        )}
        <Voorbeeld api={api} index={begin.index} overgang={o} />
        <label className="werkruimte-vink">
          <input
            type="checkbox"
            checked={o.klik}
            onChange={(e) => wijzig("klik", e.target.checked)}
          />
          {t("transitions.click")}
        </label>
        <label className="werkruimte-vink">
          <input
            type="checkbox"
            checked={o.na !== null}
            onChange={(e) => wijzig("na", e.target.checked ? 5000 : null)}
          />
          {t("transitions.auto")}
        </label>
        {o.na !== null && (
          <label className="overgang-rij">
            <span>{t("transitions.delay")}</span>
            <input
              className="werkruimte-invoer"
              type="number"
              min={0}
              max={86400}
              step={0.1}
              value={Number.isFinite(o.na) ? o.na / 1000 : ""}
              onChange={(e) =>
                wijzig(
                  "na",
                  e.target.value === ""
                    ? NaN
                    : Math.round(Number(e.target.value) * 1000),
                )
              }
            />
          </label>
        )}
        <label className="overgang-rij">
          <span>{t("transitions.sound")}</span>
          <select
            value={geluid}
            onChange={(e) => {
              setGeluid(e.target.value as typeof geluid);
              setMelding("");
            }}
          >
            <option value="keep">{t("transitions.soundKeep")}</option>
            <option value="none">{t("transitions.soundNone")}</option>
            <option value="file">{t("transitions.soundFile")}</option>
          </select>
        </label>
        {geluid === "file" && (
          <label className="overgang-bestand">
            <span>{t("transitions.soundFile")}</span>
            <input
              type="file"
              accept=".wav,audio/wav,audio/x-wav"
              onChange={(e) => void kiesBestand(e.target.files?.[0])}
            />
          </label>
        )}
        {geluidsadres && (
          <audio
            controls
            src={geluidsadres}
            aria-label={t("transitions.soundPreview")}
          />
        )}
        <p className="werkruimte-uitleg">{t("transitions.soundHint")}</p>
        <label className="overgang-rij">
          <span>{t("transitions.target")}</span>
          <select
            className="werkruimte-invoer"
            value={doel}
            onChange={(e) => setDoel(e.target.value)}
          >
            <option value="current">
              {t("transitions.current", { number: begin.index + 1 })}
            </option>
            {begin.selectie.length > 1 && (
              <option value="selected">
                {t("transitions.selected", { number: begin.selectie.length })}
              </option>
            )}
            <option value="all">{t("transitions.all")}</option>
          </select>
        </label>
      </fieldset>
      <p className="werkruimte-uitleg">{t("sorter.reloadHint")}</p>
      {melding && (
        <p role="alert" className="werkruimte-fout">
          {melding}
        </p>
      )}
    </Dialoog>
  );
}
