import { useContext, useState, useSyncExternalStore, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { PptxEditorApi } from "@betteroffice/pptx-react";
import { GalleryVerticalEnd, Paintbrush, Palette } from "lucide-react";
import { RibbonFout } from "../Ribbon";
import { useEditorApi } from "../lint/editorApi";
import { DiaKnop, huidigeIndex } from "../lint/presentatie-acties";
import { Dialoog } from "../werkruimte/Dialoog";
import { diaKeuze } from "./voetteksten";
import { leesWeergave } from "./weergave";
import { bewaarBytes } from "../afdrukken/bewaren";
import {
  leesThemaBestand,
  schrijfThemaBestand,
  themaBestandsnaam,
  ThemaBestandFout,
  THEMA_BESTAND_MAX,
} from "./themaBestand";
import {
  dupliceerLayout,
  dupliceerMaster,
  hernoemOntwerp,
  KLEUREN,
  leesOntwerp,
  OntwerpFout,
  pasLayoutToe,
  pasThemaToe,
  schrijfAchtergrond,
  THEMAS,
  valideerThema,
  verwijderLayout,
  type Achtergrond,
  type OntwerpInfo,
  type Thema,
} from "./ontwerp";
import "./ontwerp.css";

type Modus = "layouts" | "themes" | "background";
interface Begin {
  api: PptxEditorApi;
  info: OntwerpInfo;
  index: number;
  selectie: number[];
  versie: string;
  modus: Modus;
}
const OPSLAG = "oos.presentatie.themas.v1";
function eigenThemas(): Thema[] {
  try {
    const waarde: unknown = JSON.parse(localStorage.getItem(OPSLAG) ?? "[]");
    if (!Array.isArray(waarde)) return [];
    return waarde.slice(0, 30).flatMap((t) => {
      try {
        return [valideerThema(t)];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

export function DiaOntwerp() {
  const { t } = useTranslation("presentation"),
    { presentatie: api, herlaad } = useEditorApi();
  const meld = useContext(RibbonFout);
  const bewerkbaar = useSyncExternalStore(
    (l) => api?.commands.subscribe(l) ?? (() => {}),
    () => api?.commands.getState("insertSlide").enabled ?? false,
  );
  const [begin, setBegin] = useState<Begin | null>(null),
    [laden, setLaden] = useState(false);
  const fout = (e: unknown) =>
    e instanceof OntwerpFout
      ? t(`design.errors.${e.code}`)
      : t("design.errors.invalid");
  async function open(modus: Modus) {
    if (!api || !herlaad || !bewerkbaar || laden) return;
    setLaden(true);
    try {
      const bytes = await herlaad.bytes();
      setBegin({
        api,
        modus,
        info: leesOntwerp(bytes),
        index: huidigeIndex(),
        selectie: leesWeergave(herlaad).selectie,
        versie: api.handle.version(),
      });
    } catch (e) {
      meld(fout(e));
    } finally {
      setLaden(false);
    }
  }
  return (
    <>
      {(
        [
          ["layouts", GalleryVerticalEnd],
          ["themes", Palette],
          ["background", Paintbrush],
        ] as const
      ).map(([mode, icon]) => (
        <DiaKnop
          key={mode}
          naam={t(`design.${mode}`)}
          icoon={icon}
          uit={!bewerkbaar || !herlaad || laden}
          onClick={() => void open(mode)}
        />
      ))}
      {begin && begin.api === api && (
        <OntwerpVenster
          begin={begin}
          sluit={() => setBegin(null)}
          fout={fout}
          opslaan={async (werk) => {
            if (
              !api ||
              !herlaad ||
              !api.commands.getState("insertSlide").enabled ||
              api.handle.version() !== begin.versie
            )
              throw new OntwerpFout("missing");
            const bytes = await herlaad.bytes();
            if (api.handle.version() !== begin.versie)
              throw new OntwerpFout("missing");
            const nieuw = werk(bytes);
            setBegin(null);
            herlaad.vervang(nieuw, { dia: begin.index });
          }}
        />
      )}
    </>
  );
}

function OntwerpVenster({
  begin,
  sluit,
  opslaan,
  fout,
}: {
  begin: Begin;
  sluit: () => void;
  opslaan: (werk: (bytes: Uint8Array) => Uint8Array) => Promise<void>;
  fout: (e: unknown) => string;
}) {
  const { t } = useTranslation("presentation");
  const { info, index, modus } = begin;
  const [doel, setDoel] = useState<"current" | "all" | "range">(
    begin.selectie.length > 1 ? "range" : "current",
  );
  const [reeks, setReeks] = useState(
    (begin.selectie.length ? begin.selectie : [index])
      .map((i) => i + 1)
      .join(", "),
  );
  const [deel, setDeel] = useState(
    info.dias[index]?.layout ?? info.layouts[0]?.pad ?? "",
  );
  const [naam, setNaam] = useState(
    info.layouts.find((l) => l.pad === deel)?.naam ?? "",
  );
  const [reset, setReset] = useState(false);
  const [bgDoel, setBgDoel] = useState<"slides" | "layout" | "master">(
    "slides",
  );
  const [soort, setSoort] = useState<Achtergrond["soort"]>("kleur");
  const [kleur, setKleur] = useState("#FFFFFF"),
    [tweede, setTweede] = useState("#356BC4"),
    [hoek, setHoek] = useState(90);
  const afbeeldingVersie = useRef(0);
  const themaInvoer = useRef<HTMLInputElement>(null);
  const [afbeelding, setAfbeelding] = useState<Uint8Array | null>(null);
  const [custom, setCustom] = useState(eigenThemas);
  const [thema, setThema] = useState<Thema>(() => ({
    ...THEMAS[0],
    kleuren: [...THEMAS[0].kleuren],
  }));
  const [bezig, setBezig] = useState(false),
    [melding, setMelding] = useState("");
  const master = info.masters.find((m) => m.pad === deel),
    layout = info.layouts.find((l) => l.pad === deel);
  const selectie = () =>
    doel === "all"
      ? info.dias.map((_, n) => n)
      : doel === "current"
        ? [index]
        : diaKeuze(reeks, info.dias.length);
  function uitvoeren(werk: (bytes: Uint8Array) => Uint8Array) {
    setBezig(true);
    setMelding("");
    void opslaan(werk)
      .catch((e) => setMelding(fout(e)))
      .finally(() => setBezig(false));
  }
  function toepassen() {
    uitvoeren((bytes) => {
      if (modus === "layouts")
        return pasLayoutToe(bytes, selectie(), deel, reset);
      if (modus === "themes") return pasThemaToe(bytes, selectie(), thema);
      const bg: Achtergrond =
        soort === "erven"
          ? { soort }
          : soort === "kleur"
            ? { soort, kleur }
            : soort === "verloop"
              ? { soort, kleur, tweede, hoek }
              : { soort, bytes: afbeelding ?? new Uint8Array() };
      const current = info.layouts.find(
        (l) => l.pad === info.dias[index]?.layout,
      );
      const doelen =
        bgDoel === "slides"
          ? selectie().map((i) => info.dias[i].pad)
          : bgDoel === "layout"
            ? [current?.pad ?? ""]
            : [current?.master ?? ""];
      return schrijfAchtergrond(bytes, doelen, bg);
    });
  }
  function bewaarThema() {
    try {
      valideerThema(thema);
      const nieuw = [
        ...custom.filter((t) => t.naam !== thema.naam),
        { ...thema, kleuren: [...thema.kleuren] },
      ].slice(-30);
      localStorage.setItem(OPSLAG, JSON.stringify(nieuw));
      setCustom(nieuw);
      setMelding(t("design.saved"));
    } catch (e) {
      setMelding(fout(e));
    }
  }
  const themaFout = (e: unknown) =>
    t(
      `design.errors.${e instanceof ThemaBestandFout && e.code === "tooLarge" ? "themeTooLarge" : "themeFile"}`,
    );
  async function importeerThema(file: File) {
    setBezig(true);
    setMelding("");
    try {
      if (file.size > THEMA_BESTAND_MAX) throw new ThemaBestandFout("tooLarge");
      const nieuw = leesThemaBestand(new Uint8Array(await file.arrayBuffer()));
      setThema(nieuw);
      setMelding(t("design.importedTheme"));
    } catch (e) {
      setMelding(themaFout(e));
    } finally {
      setBezig(false);
    }
  }
  async function exporteerThema() {
    setBezig(true);
    setMelding("");
    try {
      const pad = await bewaarBytes(
        schrijfThemaBestand(thema),
        themaBestandsnaam(thema.naam),
        "application/json",
      );
      if (pad !== null) setMelding(t("design.exportedTheme"));
    } catch (e) {
      setMelding(
        e instanceof ThemaBestandFout
          ? themaFout(e)
          : t("design.errors.themeSave"),
      );
    } finally {
      setBezig(false);
    }
  }
  const veld = (
    key: string,
    value: string,
    onChange: (value: string) => void,
    type = "text",
  ) => (
    <label>
      {t(`design.${key}`)}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
  return (
    <Dialoog
      titel={t(`design.${modus}`)}
      className="presentatie-ontwerp"
      sluit={() => {
        if (!bezig) sluit();
      }}
      acties={
        <>
          <button className="werkruimte-knop" disabled={bezig} onClick={sluit}>
            {t("common:cancel")}
          </button>
          <button
            className="werkruimte-knop is-primair"
            disabled={
              bezig ||
              (modus === "layouts" && !layout) ||
              (modus === "background" && soort === "afbeelding" && !afbeelding)
            }
            onClick={toepassen}
          >
            {t("design.apply")}
          </button>
        </>
      }
    >
      <fieldset disabled={bezig}>
        <p>{t("design.reload")}</p>
        {(modus !== "background" || bgDoel === "slides") && (
          <div className="ontwerp-doel">
            <label>
              {t("design.scope")}
              <select
                aria-label={t("design.scope")}
                value={doel}
                onChange={(e) => setDoel(e.target.value as typeof doel)}
              >
                {["current", "all", "range"].map((d) => (
                  <option key={d} value={d}>
                    {t(`design.${d}`)}
                  </option>
                ))}
              </select>
            </label>
            {doel === "range" && veld("range", reeks, setReeks)}
          </div>
        )}
        {modus === "layouts" && (
          <>
            <label>
              {t("design.choose")}
              <select
                aria-label={t("design.choose")}
                value={deel}
                onChange={(e) => {
                  const d = [...info.masters, ...info.layouts].find(
                    (d) => d.pad === e.target.value,
                  );
                  setDeel(e.target.value);
                  setNaam(d?.naam ?? "");
                }}
              >
                {info.masters.map((m) => (
                  <optgroup key={m.pad} label={m.naam}>
                    <option value={m.pad}>
                      {t("design.master")} — {m.naam}
                    </option>
                    {info.layouts
                      .filter((l) => l.master === m.pad)
                      .map((l) => (
                        <option key={l.pad} value={l.pad}>
                          {l.naam} ({l.gebruikt})
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>
            {veld("name", naam, setNaam)}
            <div className="ontwerp-acties">
              <button
                className="werkruimte-knop"
                onClick={() => uitvoeren((b) => hernoemOntwerp(b, deel, naam))}
              >
                {t("design.rename")}
              </button>
              <button
                className="werkruimte-knop"
                onClick={() =>
                  uitvoeren((b) =>
                    master
                      ? dupliceerMaster(b, deel, naam)
                      : dupliceerLayout(b, deel, naam),
                  )
                }
              >
                {t("design.duplicate")}
              </button>
              <button
                className="werkruimte-knop"
                disabled={!layout || layout.gebruikt > 0}
                onClick={() => uitvoeren((b) => verwijderLayout(b, deel))}
              >
                {t("design.delete")}
              </button>
            </div>
            <label className="ontwerp-check">
              <input
                type="checkbox"
                checked={reset}
                onChange={(e) => setReset(e.target.checked)}
              />
              {t("design.reset")}
            </label>
            <p>{t("design.layoutHelp")}</p>
          </>
        )}
        {modus === "themes" && (
          <>
            <div
              className="ontwerp-themas"
              role="group"
              aria-label={t("design.presets")}
            >
              {[...THEMAS, ...custom].map((preset, i) => (
                <button
                  key={i}
                  className="ontwerp-thema"
                  aria-label={preset.naam}
                  aria-pressed={
                    JSON.stringify(preset) === JSON.stringify(thema)
                  }
                  onClick={() =>
                    setThema({ ...preset, kleuren: [...preset.kleuren] })
                  }
                >
                  <span
                    style={{
                      background: preset.achtergrond,
                      color: preset.kleuren[0],
                      fontFamily: preset.kop,
                    }}
                  >
                    <b>Aa</b>
                    <i>
                      {preset.kleuren.slice(4, 10).map((c, n) => (
                        <em key={n} style={{ background: c }} />
                      ))}
                    </i>
                  </span>
                  {preset.naam}
                </button>
              ))}
            </div>
            {veld("name", thema.naam, (v) => setThema({ ...thema, naam: v }))}
            <div className="ontwerp-doel">
              {veld("headingFont", thema.kop, (v) =>
                setThema({ ...thema, kop: v }),
              )}
              {veld("bodyFont", thema.tekst, (v) =>
                setThema({ ...thema, tekst: v }),
              )}
            </div>
            <div className="ontwerp-kleuren">
              {KLEUREN.map((key, i) => (
                <label key={key}>
                  {t(`design.colors.${key}`)}
                  <input
                    type="color"
                    value={thema.kleuren[i]}
                    onChange={(e) =>
                      setThema({
                        ...thema,
                        kleuren: thema.kleuren.map((c, n) =>
                          n === i ? e.target.value : c,
                        ),
                      })
                    }
                  />
                </label>
              ))}
              {veld(
                "background",
                thema.achtergrond,
                (v) => setThema({ ...thema, achtergrond: v }),
                "color",
              )}
            </div>
            <button className="werkruimte-knop" onClick={bewaarThema}>
              {t("design.saveTheme")}
            </button>
            <button
              className="werkruimte-knop"
              onClick={() => void exporteerThema()}
            >
              {t("design.exportTheme")}
            </button>
            <button
              className="werkruimte-knop"
              onClick={() => themaInvoer.current?.click()}
            >
              {t("design.importTheme")}
            </button>
            <input
              ref={themaInvoer}
              type="file"
              accept=".oos-theme,application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void importeerThema(f);
              }}
            />
            <p>{t("design.themeFileHelp")}</p>
          </>
        )}
        {modus === "background" && (
          <>
            <label>
              {t("design.backgroundTarget")}
              <select
                aria-label={t("design.backgroundTarget")}
                value={bgDoel}
                onChange={(e) => setBgDoel(e.target.value as typeof bgDoel)}
              >
                {["slides", "layout", "master"].map((d) => (
                  <option key={d} value={d}>
                    {t(`design.${d}`)}
                  </option>
                ))}
              </select>
            </label>
            {bgDoel !== "slides" && <p>{t("design.inheritance")}</p>}
            <label>
              {t("design.fill")}
              <select
                aria-label={t("design.fill")}
                value={soort}
                onChange={(e) => setSoort(e.target.value as typeof soort)}
              >
                {["erven", "kleur", "verloop", "afbeelding"].map((d) => (
                  <option key={d} value={d}>
                    {t(`design.${d}`)}
                  </option>
                ))}
              </select>
            </label>
            {(soort === "kleur" || soort === "verloop") &&
              veld("color", kleur, setKleur, "color")}
            {soort === "verloop" && (
              <>
                {veld("secondColor", tweede, setTweede, "color")}
                {veld(
                  "angle",
                  String(hoek),
                  (v) => setHoek(Number(v)),
                  "number",
                )}
              </>
            )}
            {soort === "afbeelding" && (
              <label>
                {t("design.image")}
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    const versie = ++afbeeldingVersie.current;
                    setMelding("");
                    setAfbeelding(null);
                    if (f) {
                      if (f.size > 20 * 1024 * 1024) {
                        setMelding(t("design.errors.invalid"));
                        return;
                      }
                      void f
                        .arrayBuffer()
                        .then((b) => {
                          if (versie === afbeeldingVersie.current)
                            setAfbeelding(new Uint8Array(b));
                        })
                        .catch((e) => setMelding(fout(e)));
                    }
                  }}
                />
              </label>
            )}
            {(soort === "kleur" || soort === "verloop") && (
              <div
                className="ontwerp-voorbeeld"
                role="img"
                aria-label={t("design.preview")}
                style={{
                  background:
                    soort === "kleur"
                      ? kleur
                      : `linear-gradient(${hoek + 90}deg,${kleur},${tweede})`,
                }}
              />
            )}
          </>
        )}
      </fieldset>
      {melding && <p role="status">{melding}</p>}
    </Dialoog>
  );
}
