import {
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Copy, ClipboardPaste } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Actie, RibbonFout } from "../../Ribbon";
import { useEditorApi, useEditorZichtbaar } from "../../lint/editorApi";
import { huidigeIndex, geselecteerdeVorm } from "../../lint/presentatie-acties";
import { Dialoog } from "../../werkruimte/Dialoog";
import { leesKlembordTekst } from "../../klembord";
import {
  actueleGrafiek,
  isGrafiekKopie,
  leesGrafiekKopie,
  maakGrafiekKopie,
  plakGrafiekKopie,
} from "../kopie";
import {
  leesGrafiek,
  lijstGrafieken,
  type GrafiekVerwijzing,
} from "../documenten";
import { rasterUitModel } from "../model";
import { GrafiekVenster } from "./GrafiekVenster";

async function schrijf(tekst: string) {
  if ("__TAURI_INTERNALS__" in window) {
    const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
    await writeText(tekst);
  } else await navigator.clipboard.writeText(tekst);
}
/** Afzonderlijke bediening; de drie apps blijven dezelfde grafiekeditor gebruiken. */
export function GrafiekOverdracht({
  formaat,
  bediening = true,
}: {
  formaat: "xlsx" | "pptx";
  bediening?: boolean;
}) {
  const { t } = useTranslation("charts"),
    apis = useEditorApi(),
    zichtbaar = useEditorZichtbaar(),
    meld = useContext(RibbonFout);
  const { herlaad, presentatie: pptx, rekenblad: xlsx } = apis;
  const live = useRef(apis);
  live.current = apis;
  const [kopie, setKopie] = useState<{
    grafieken: GrafiekVerwijzing[];
    keuze: number;
  } | null>(null);
  const [plakvenster, setPlakvenster] = useState<React.ReactNode>(null);
  const [laden, setLaden] = useState(false);
  const bewerkbaar = useSyncExternalStore(
    (l) => pptx?.commands.subscribe(l) ?? (() => {}),
    () => pptx?.commands.getState("insertSlide").enabled ?? false,
  );
  const fout = (e: unknown) =>
    meld(e instanceof Error ? e.message : t("transfer.invalid"));
  async function openKopie() {
    if (!herlaad || laden) return;
    setLaden(true);
    try {
      const bytes = await herlaad.bytes(),
        grafieken = lijstGrafieken(bytes, formaat);
      if (!grafieken.length) throw new Error(t("transfer.empty"));
      const id = apis.grafiekSelectie?.lees(),
        vorm = pptx ? geselecteerdeVorm(pptx)?.vorm.sourceId : null;
      const index = grafieken.findIndex((g) =>
        formaat === "xlsx"
          ? `${g.houderPad}#${g.ankerIndex}` === id
          : g.dia === huidigeIndex() && g.vormId === vorm,
      );
      setKopie({ grafieken, keuze: Math.max(0, index) });
    } catch (e) {
      fout(e);
    } finally {
      setLaden(false);
    }
  }
  async function plak(tekst?: string) {
    if (!herlaad || !pptx || !bewerkbaar) return;
    const owner = pptx,
      reloader = herlaad,
      dia = huidigeIndex();
    try {
      await reloader.bytes();
      const versie = owner.handle.version();
      const inhoud = tekst ?? (await leesKlembordTekst()),
        gelezen = leesGrafiekKopie(inhoud);
      if (live.current.presentatie !== owner)
        throw new Error(t("transfer.changed"));
      setPlakvenster(
        <GrafiekVenster
          modus="insert"
          begin={gelezen.model}
          waarschuwingen={gelezen.waarschuwingen}
          gegevens={{ soort: "blad", raster: rasterUitModel(gelezen.model) }}
          sluit={() => setPlakvenster(null)}
          bevestig={async ({ model }) => {
            if (
              live.current.presentatie !== owner ||
              owner.handle.version() !== versie ||
              !owner.commands.getState("insertSlide").enabled
            )
              throw new Error(t("transfer.changed"));
            const actueel = await reloader.bytes();
            if (owner.handle.version() !== versie)
              throw new Error(t("transfer.changed"));
            const r = plakGrafiekKopie(actueel, inhoud, dia, model);
            setPlakvenster(null);
            reloader.vervang(r.bytes, { dia });
          }}
        />,
      );
    } catch (e) {
      fout(e);
    }
  }
  useEffect(() => {
    if (bediening || formaat !== "pptx" || !zichtbaar || !pptx) return;
    const onPaste = (e: ClipboardEvent) => {
      if (
        e.defaultPrevented ||
        (e.target instanceof Element &&
          e.target.closest(
            'input,textarea,[contenteditable="true"],[role="dialog"]',
          ))
      )
        return;
      const inhoud = e.clipboardData?.getData("text/plain") ?? "";
      if (!isGrafiekKopie(inhoud)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      void plak(inhoud);
    };
    window.addEventListener("paste", onPaste, true);
    return () => window.removeEventListener("paste", onPaste, true);
  }, [bediening, formaat, zichtbaar, pptx, herlaad, bewerkbaar]);
  return (
    <>
      {bediening && (
        <div className="ribbon-stapel">
          <Actie
            naam={t("transfer.copy")}
            icoon={Copy}
            disabled={!herlaad || laden}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void openKopie()}
          />
          {formaat === "pptx" && (
            <Actie
              naam={t("transfer.paste")}
              icoon={ClipboardPaste}
              disabled={!herlaad || !bewerkbaar}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void plak()}
            />
          )}
        </div>
      )}
      {kopie && (
        <KopieVenster
          grafieken={kopie.grafieken}
          begin={kopie.keuze}
          sluit={() => setKopie(null)}
          doe={async (g) => {
            if (!herlaad) throw new Error(t("transfer.changed"));
            const bytes = await herlaad.bytes();
            if (
              !lijstGrafieken(bytes, formaat).some(
                (n) =>
                  n.chartPad === g.chartPad &&
                  n.houderPad === g.houderPad &&
                  n.rid === g.rid,
              )
            )
              throw new Error(t("transfer.changed"));
            const gelezen = leesGrafiek(bytes, g.chartPad),
              model =
                formaat === "xlsx" && xlsx
                  ? await actueleGrafiek(xlsx, gelezen.model)
                  : gelezen.model;
            await schrijf(maakGrafiekKopie(bytes, formaat, g.chartPad, model));
            setKopie(null);
          }}
        />
      )}
      {plakvenster}
    </>
  );
}
/** Blijft gemonteerd als het tabblad Invoegen sluit; verborgen documenten luisteren niet mee. */
export function GrafiekPlakListener() {
  return <GrafiekOverdracht formaat="pptx" bediening={false} />;
}
function KopieVenster({
  grafieken,
  begin,
  sluit,
  doe,
}: {
  grafieken: GrafiekVerwijzing[];
  begin: number;
  sluit: () => void;
  doe: (g: GrafiekVerwijzing) => Promise<void>;
}) {
  const { t } = useTranslation("charts"),
    [keuze, setKeuze] = useState(begin),
    [bezig, setBezig] = useState(false),
    [melding, setMelding] = useState("");
  return (
    <Dialoog
      titel={t("transfer.copy")}
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
            disabled={bezig}
            onClick={() => {
              setBezig(true);
              setMelding("");
              void doe(grafieken[keuze])
                .catch((e) =>
                  setMelding(
                    e instanceof Error ? e.message : t("transfer.invalid"),
                  ),
                )
                .finally(() => setBezig(false));
            }}
          >
            {t("transfer.copy")}
          </button>
        </>
      }
    >
      <p>{t("transfer.help")}</p>
      <label>
        {t("transfer.choose")}
        <select
          aria-label={t("transfer.choose")}
          disabled={bezig}
          value={keuze}
          onChange={(e) => setKeuze(Number(e.target.value))}
        >
          {grafieken.map((g, i) => (
            <option key={i} value={i}>
              {g.titel || g.naam} —{" "}
              {g.bladNaam ?? t("transfer.slide", { number: (g.dia ?? 0) + 1 })}
            </option>
          ))}
        </select>
      </label>
      {melding && <p role="alert">{melding}</p>}
    </Dialoog>
  );
}
