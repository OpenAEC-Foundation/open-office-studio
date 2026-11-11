import {
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDown,
  ArrowUp,
  Play,
  Plus,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";
import type { PptxEditorApi } from "@betteroffice/pptx-react";
import type { ShapeSnapshot } from "@betteroffice/pptx";
import { RibbonFout } from "../Ribbon";
import { useEditorApi } from "../lint/editorApi";
import {
  DiaKnop,
  geselecteerdeVorm,
  huidigeIndex,
} from "../lint/presentatie-acties";
import { Dialoog } from "../werkruimte/Dialoog";
import { tekenDia } from "./diabeeld";
import {
  AnimatieFout,
  leesAnimaties,
  nieuweAnimatie,
  schrijfAnimaties,
  type Animatie,
  type DiaAnimaties,
} from "./animaties";
import { maakAnimatieScene, tekenAnimatieScene } from "./animatie-beeld";
import { voorbeeldTijden } from "./animatie-logica";
import "./animaties.css";

interface Objectkeuze {
  id: number;
  naam: string;
  alineas: number;
}
interface Begin {
  index: number;
  model: DiaAnimaties;
  objecten: Objectkeuze[];
  selectie: number;
}

export function DiaAnimaties() {
  const { t } = useTranslation("presentation");
  const { presentatie: api, herlaad } = useEditorApi(),
    meld = useContext(RibbonFout);
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
      const index = huidigeIndex(),
        slide = api.handle.snapshot().slides[index];
      const objecten: Objectkeuze[] = [];
      const bezoek = (vormen: readonly ShapeSnapshot[]) => {
        for (const v of vormen) {
          const tekst = v.textStories
            .flatMap((s) =>
              s.paragraphs.map((p) => p.runs.map((r) => r.text).join("")),
            )
            .join(" ")
            .trim()
            .slice(0, 55);
          objecten.push({
            id: v.sourceId,
            naam:
              (v.name ||
                t("animations.objectFallback", {
                  number: objecten.length + 1,
                })) + (tekst ? ` — ${tekst}` : ""),
            alineas:
              v.kind === "shape" && v.textStories.length === 1
                ? v.textStories[0].paragraphs.length
                : 0,
          });
          bezoek(v.children);
        }
      };
      bezoek(slide?.shapes ?? []);
      if (!objecten.length) {
        meld(t("animations.noObjects"));
        return;
      }
      const model = leesAnimaties(await herlaad.bytes(), index),
        selectie = geselecteerdeVorm(api)?.vorm.sourceId ?? objecten[0].id;
      setBegin({ index, objecten, model, selectie });
    } catch {
      meld(t("sorter.packageFailed"));
    } finally {
      setLaden(false);
    }
  }
  return (
    <>
      <DiaKnop
        naam={t("animations.title")}
        icoon={Sparkles}
        uit={!api || !herlaad || !bewerkbaar || laden}
        onClick={() => void open()}
      />
      {begin && api && (
        <AnimatieVenster
          begin={begin}
          api={api}
          sluit={() => setBegin(null)}
          opslaan={async (lijst) => {
            if (!herlaad || !api.commands.getState("insertSlide").enabled)
              throw new Error("readOnly");
            const actueel = await herlaad.bytes(),
              bytes = schrijfAnimaties(actueel, begin.index, lijst);
            setBegin(null);
            if (bytes !== actueel) herlaad.vervang(bytes, { dia: begin.index });
          }}
        />
      )}
    </>
  );
}

function AnimatieVoorbeeld({
  api,
  index,
  lijst,
  uit,
}: {
  api: PptxEditorApi;
  index: number;
  lijst: readonly Animatie[];
  uit: boolean;
}) {
  const { t } = useTranslation("presentation");
  const canvas = useRef<HTMLCanvasElement>(null),
    bezig = useRef<AbortController | null>(null);
  const [speelt, zetSpeelt] = useState(false),
    [fout, zetFout] = useState(false);
  useEffect(() => {
    bezig.current?.abort();
    zetSpeelt(false);
    zetFout(false);
    let actief = true;
    const bron = document.createElement("canvas");
    void tekenDia(api, index, bron, 600)
      .then((ok) => {
        if (
          !actief ||
          !canvas.current ||
          !ok ||
          (bezig.current && !bezig.current.signal.aborted)
        )
          return;
        canvas.current.width = bron.width;
        canvas.current.height = bron.height;
        canvas.current.getContext("2d")?.drawImage(bron, 0, 0);
      })
      .catch(() => {
        if (actief) zetFout(true);
      });
    return () => {
      actief = false;
      bezig.current?.abort();
    };
  }, [api, index, lijst]);
  async function speel() {
    if (speelt) {
      bezig.current?.abort();
      zetSpeelt(false);
      return;
    }
    const controller = new AbortController();
    bezig.current = controller;
    zetSpeelt(true);
    zetFout(false);
    try {
      if (
        lijst.some((a) =>
          [a.duur, a.vertraging, a.dx, a.dy, a.hoek].some(
            (v) => !Number.isFinite(v),
          ),
        )
      )
        throw new AnimatieFout("invalidAnimation");
      const scene = await maakAnimatieScene(
        api,
        index,
        600,
        lijst,
        controller.signal,
      );
      if (controller.signal.aborted || !canvas.current) return;
      const { tijden, eind } = voorbeeldTijden(lijst, performance.now());
      await new Promise<void>((resolve) => {
        let id = 0;
        const stop = () => {
          cancelAnimationFrame(id);
          controller.signal.removeEventListener("abort", stop);
          resolve();
        };
        const frame = () => {
          if (controller.signal.aborted || !canvas.current) {
            stop();
            return;
          }
          const nu = performance.now();
          tekenAnimatieScene(
            canvas.current,
            scene,
            tijden,
            nu,
            matchMedia("(prefers-reduced-motion: reduce)").matches,
          );
          if (nu < eind) id = requestAnimationFrame(frame);
          else stop();
        };
        controller.signal.addEventListener("abort", stop, { once: true });
        frame();
      });
    } catch {
      if (!controller.signal.aborted) zetFout(true);
    } finally {
      if (bezig.current === controller) zetSpeelt(false);
    }
  }
  return (
    <div className="animatie-voorbeeld">
      <canvas ref={canvas} role="img" aria-label={t("animations.preview")} />
      <button
        type="button"
        className="werkruimte-knop"
        disabled={uit || !lijst.length}
        onClick={() => void speel()}
      >
        {speelt ? (
          <Square size={15} aria-hidden="true" />
        ) : (
          <Play size={15} aria-hidden="true" />
        )}
        {t(speelt ? "animations.stop" : "animations.preview")}
      </button>
      {fout && (
        <p role="alert" className="werkruimte-fout">
          {t("animations.previewFailed")}
        </p>
      )}
    </div>
  );
}

function AnimatieVenster({
  begin,
  api,
  sluit,
  opslaan,
}: {
  begin: Begin;
  api: PptxEditorApi;
  sluit: () => void;
  opslaan: (lijst: Animatie[]) => Promise<void>;
}) {
  const { t } = useTranslation("presentation");
  const [lijst, zet] = useState(begin.model.lijst),
    [gekozen, kies] = useState(0),
    [doel, zetDoel] = useState(begin.selectie);
  const [bezig, zetBezig] = useState(false),
    [fout, zetFout] = useState("");
  const a = lijst[gekozen],
    alleenLezen = begin.model.alleenLezen,
    object = begin.objecten.find((o) => o.id === (a?.vorm ?? doel));
  function wijzig<K extends keyof Animatie>(key: K, waarde: Animatie[K]) {
    zet((v) => v.map((a, i) => (i === gekozen ? { ...a, [key]: waarde } : a)));
    zetFout("");
  }
  function voegToe() {
    const nieuw = nieuweAnimatie(doel);
    zet((v) => [...v, nieuw]);
    kies(lijst.length);
    zetFout("");
  }
  function verplaats(delta: number) {
    const doel = gekozen + delta;
    if (doel < 0 || doel >= lijst.length) return;
    zet((v) => {
      const kopie = [...v];
      [kopie[gekozen], kopie[doel]] = [kopie[doel], kopie[gekozen]];
      return kopie;
    });
    kies(doel);
  }
  function perAlinea() {
    if (!a || !object || object.alineas < 2) return;
    const rows = Array.from({ length: object.alineas }, (_, i) => ({
      ...a,
      id: crypto.randomUUID(),
      alinea: [i, i] as [number, number],
      start: i ? ("click" as const) : a.start,
      vertraging: i ? 0 : a.vertraging,
    }));
    zet((v) => [...v.slice(0, gekozen), ...rows, ...v.slice(gekozen + 1)]);
  }
  async function toepassen() {
    zetBezig(true);
    zetFout("");
    try {
      await opslaan(lijst);
    } catch (e) {
      zetFout(
        e instanceof AnimatieFout
          ? t("animations.invalid")
          : t("sorter.packageFailed"),
      );
    } finally {
      zetBezig(false);
    }
  }
  const waarde = (v: number) => (Number.isFinite(v) ? v : "");
  return (
    <Dialoog
      titel={t("animations.title")}
      className="presentatie-animaties"
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
            disabled={bezig || alleenLezen}
            onClick={() => void toepassen()}
          >
            {t(bezig ? "animations.applying" : "animations.apply")}
          </button>
        </>
      }
    >
      {alleenLezen && (
        <p role="status" className="werkruimte-uitleg">
          {t("animations.unsupported")}
        </p>
      )}
      <div className="animatie-indeling">
        <div>
          <label className="animatie-veld">
            <span>{t("animations.object")}</span>
            <select
              value={doel}
              disabled={bezig || alleenLezen}
              onChange={(e) => zetDoel(Number(e.target.value))}
            >
              {begin.objecten.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.naam}
                </option>
              ))}
            </select>
          </label>
          <div className="animatie-acties">
            <button
              type="button"
              className="werkruimte-knop"
              disabled={bezig || alleenLezen}
              onClick={voegToe}
            >
              <Plus size={15} aria-hidden="true" />
              {t("animations.add")}
            </button>
            <button
              type="button"
              className="werkruimte-knop"
              disabled={bezig || alleenLezen || !a || gekozen === 0}
              onClick={() => verplaats(-1)}
              aria-label={t("animations.up")}
              title={t("animations.up")}
            >
              <ArrowUp size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="werkruimte-knop"
              disabled={
                bezig || alleenLezen || !a || gekozen === lijst.length - 1
              }
              onClick={() => verplaats(1)}
              aria-label={t("animations.down")}
              title={t("animations.down")}
            >
              <ArrowDown size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="werkruimte-knop"
              disabled={bezig || alleenLezen || !a}
              onClick={() => {
                zet((v) => v.filter((_, i) => i !== gekozen));
                kies(Math.max(0, gekozen - 1));
              }}
              aria-label={t("animations.remove")}
              title={t("animations.remove")}
            >
              <Trash2 size={15} aria-hidden="true" />
            </button>
          </div>
          {!lijst.length && !alleenLezen && (
            <p className="werkruimte-uitleg">{t("animations.empty")}</p>
          )}
          <ol className="animatie-lijst" aria-label={t("animations.list")}>
            {lijst.map((a, i) => (
              <li key={a.id}>
                <button
                  type="button"
                  disabled={bezig}
                  aria-pressed={i === gekozen}
                  onClick={() => {
                    kies(i);
                    zetDoel(a.vorm);
                  }}
                >
                  <span>
                    {i + 1}.{" "}
                    {begin.objecten.find((o) => o.id === a.vorm)?.naam ??
                      t("animations.objectFallback", { number: i + 1 })}
                  </span>
                  <small>
                    {t(`animations.${a.effect}`)} · {t(`animations.${a.start}`)}
                    {a.alinea
                      ? ` · ${t("animations.paragraphRange", { first: a.alinea[0] + 1, last: a.alinea[1] + 1 })}`
                      : ""}
                  </small>
                </button>
              </li>
            ))}
          </ol>
          {a && (
            <fieldset
              className="animatie-instellingen"
              disabled={bezig || alleenLezen}
            >
              <label className="animatie-veld">
                <span>{t("animations.effect")}</span>
                <select
                  value={a.effect}
                  onChange={(e) =>
                    wijzig("effect", e.target.value as Animatie["effect"])
                  }
                >
                  {[
                    "fadeIn",
                    "spin",
                    "move",
                    "fadeOut",
                    ...(a.effect === "unknown" ? ["unknown"] : []),
                  ].map((k) => (
                    <option key={k} value={k}>
                      {t(`animations.${k}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="animatie-veld">
                <span>{t("animations.start")}</span>
                <select
                  value={a.start}
                  onChange={(e) =>
                    wijzig("start", e.target.value as Animatie["start"])
                  }
                >
                  {["click", "with", "after"].map((k) => (
                    <option key={k} value={k}>
                      {t(`animations.${k}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="animatie-veld">
                <span>{t("animations.duration")}</span>
                <input
                  type="number"
                  min={0}
                  max={60}
                  step={0.1}
                  value={waarde(a.duur / 1000)}
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
              <label className="animatie-veld">
                <span>{t("animations.delay")}</span>
                <input
                  type="number"
                  min={0}
                  max={3600}
                  step={0.1}
                  value={waarde(a.vertraging / 1000)}
                  onChange={(e) =>
                    wijzig(
                      "vertraging",
                      e.target.value === ""
                        ? NaN
                        : Math.round(Number(e.target.value) * 1000),
                    )
                  }
                />
              </label>
              {a.effect === "spin" && (
                <label className="animatie-veld">
                  <span>{t("animations.angle")}</span>
                  <input
                    type="number"
                    min={-3600}
                    max={3600}
                    value={waarde(a.hoek)}
                    onChange={(e) =>
                      wijzig(
                        "hoek",
                        e.target.value === "" ? NaN : Number(e.target.value),
                      )
                    }
                  />
                </label>
              )}
              {a.effect === "move" &&
                (["dx", "dy"] as const).map((k) => (
                  <label className="animatie-veld" key={k}>
                    <span>{t(`animations.${k}`)}</span>
                    <input
                      type="number"
                      min={-1000}
                      max={1000}
                      value={waarde(a[k] * 100)}
                      onChange={(e) =>
                        wijzig(
                          k,
                          e.target.value === ""
                            ? NaN
                            : Number(e.target.value) / 100,
                        )
                      }
                    />
                  </label>
                ))}
              {a.alinea ? (
                <button
                  type="button"
                  className="werkruimte-knop"
                  onClick={() => wijzig("alinea", null)}
                >
                  {t("animations.wholeObject")}
                </button>
              ) : (
                <button
                  type="button"
                  className="werkruimte-knop"
                  disabled={!object || object.alineas < 2}
                  onClick={perAlinea}
                >
                  {t("animations.paragraphs")}
                </button>
              )}
            </fieldset>
          )}
        </div>
        <AnimatieVoorbeeld
          api={api}
          index={begin.index}
          lijst={lijst}
          uit={alleenLezen || bezig}
        />
      </div>
      <p className="werkruimte-uitleg">{t("sorter.reloadHint")}</p>
      {fout && (
        <p role="alert" className="werkruimte-fout">
          {fout}
        </p>
      )}
    </Dialoog>
  );
}
