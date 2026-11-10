import {
  useContext,
  useRef,
  useState,
  useSyncExternalStore,
  useEffect,
} from "react";
import { Paintbrush } from "lucide-react";
import type { PptxEditorApi } from "@betteroffice/pptx-react";
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
  effectieveOpmaak,
  kopieerObjectOpmaak,
  leesOpmaakObjecten,
  OpmaakKopieFout,
  type OpmaakObject,
  type EffectieveOpmaak,
} from "./opmaakKopie";
import "./objecten.css";
interface Begin {
  api: PptxEditorApi;
  versie: string;
  dia: number;
  objecten: OpmaakObject[];
  bron: string;
  effectief: Map<string, EffectieveOpmaak>;
}
export function DiaOpmaakKopie() {
  const { t } = useTranslation("presentation"),
    { presentatie: api, herlaad } = useEditorApi(),
    meld = useContext(RibbonFout);
  const [begin, setBegin] = useState<Begin | null>(null),
    [laden, setLaden] = useState(false),
    live = useRef(api);
  live.current = api;
  const editable = useSyncExternalStore(
    (l) => api?.commands.subscribe(l) ?? (() => {}),
    () => api?.commands.getState("insertSlide").enabled ?? false,
  );
  const fout = (e: unknown) =>
    t(`formatCopy.errors.${e instanceof OpmaakKopieFout ? e.code : "invalid"}`);
  async function open() {
    if (!api || !herlaad || !editable || laden) return;
    setLaden(true);
    try {
      const dia = huidigeIndex(),
        gekozen = String(geselecteerdeVorm(api)?.vorm.sourceId ?? ""),
        bytes = await herlaad.bytes();
      if (live.current !== api) return;
      const objecten = leesOpmaakObjecten(bytes, dia),
        sources = objecten.filter((o) => o.object);
      if (sources.length < 2) throw new OpmaakKopieFout("missing");
      setBegin({
        api,
        versie: api.handle.version(),
        dia,
        objecten,
        bron: sources.find((o) => o.id === gekozen)?.id ?? sources[0].id,
        effectief: effectieveOpmaak(api.handle.layoutSlide(dia).primitives),
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
        naam={t("formatCopy.title")}
        icoon={Paintbrush}
        uit={!editable || laden}
        onClick={() => void open()}
      />
      {begin && begin.api === api && (
        <Venster
          begin={begin}
          sluit={() => setBegin(null)}
          fout={fout}
          doe={async (bron, doelen, object, tekst) => {
            if (
              !api ||
              !herlaad ||
              !api.commands.getState("insertSlide").enabled ||
              api.handle.version() !== begin.versie
            )
              throw new OpmaakKopieFout("missing");
            const bytes = await herlaad.bytes();
            if (live.current !== api || api.handle.version() !== begin.versie)
              throw new OpmaakKopieFout("missing");
            const result = kopieerObjectOpmaak(bytes, begin.dia, bron, doelen, {
              object,
              tekst,
              effectief: begin.effectief.get(bron),
            });
            setBegin(null);
            herlaad.vervang(result, { dia: begin.dia });
          }}
        />
      )}
    </>
  );
}
function Venster({
  begin,
  sluit,
  doe,
  fout,
}: {
  begin: Begin;
  sluit: () => void;
  doe: (
    bron: string,
    doelen: string[],
    object: boolean,
    tekst: boolean,
  ) => Promise<void>;
  fout: (e: unknown) => string;
}) {
  const { t } = useTranslation("presentation"),
    [bron, setBron] = useState(begin.bron),
    [object, setObject] = useState(true),
    [tekst, setTekst] = useState(
      begin.objecten.find((o) => o.id === begin.bron)?.tekst ?? false,
    ),
    [keuze, setKeuze] = useState<string[]>([]),
    [bezig, setBezig] = useState(false),
    [melding, setMelding] = useState("");
  const source = begin.objecten.find((o) => o.id === bron)!,
    text = tekst && source.tekst;
  const kan = (o: OpmaakObject) =>
    o.id !== bron && o.object && (!text || o.tekst);
  useEffect(() => {
    setKeuze((ids) =>
      ids.filter((id) => begin.objecten.some((o) => o.id === id && kan(o))),
    );
  }, [bron, text]);
  return (
    <Dialoog
      titel={t("formatCopy.title")}
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
            disabled={bezig || (!object && !text) || !keuze.length}
            onClick={() => {
              setBezig(true);
              setMelding("");
              void doe(bron, keuze, object, text)
                .catch((e) => setMelding(fout(e)))
                .finally(() => setBezig(false));
            }}
          >
            {t("formatCopy.apply")}
          </button>
        </>
      }
    >
      <p>{t("formatCopy.help")}</p>
      <p>{t("design.reload")}</p>
      <fieldset disabled={bezig} style={{ border: 0, padding: 0, margin: 0 }}>
        <label style={{ display: "grid", gap: 4, marginBottom: 12 }}>
          {t("formatCopy.source")}
          <select
            aria-label={t("formatCopy.source")}
            value={bron}
            onChange={(e) => setBron(e.target.value)}
          >
            {begin.objecten
              .filter((o) => o.object)
              .map((o, i) => (
                <option key={o.id} value={o.id}>
                  {o.naam || t("objects.object", { number: i + 1 })}
                </option>
              ))}
          </select>
        </label>
        <label className="werkruimte-vink">
          <input
            type="checkbox"
            checked={object}
            onChange={(e) => setObject(e.target.checked)}
          />
          {t("formatCopy.object")}
        </label>
        <label className="werkruimte-vink">
          <input
            type="checkbox"
            checked={text}
            disabled={!source.tekst}
            onChange={(e) => setTekst(e.target.checked)}
          />
          {t("formatCopy.text")}
        </label>
        <h3>{t("formatCopy.targets")}</h3>
        <div className="dia-objecten-lijst">
          {begin.objecten
            .filter((o) => o.id !== bron)
            .map((o, i) => (
              <label key={o.id} className="werkruimte-vink">
                <input
                  type="checkbox"
                  disabled={!kan(o)}
                  checked={keuze.includes(o.id)}
                  onChange={(e) =>
                    setKeuze((ids) =>
                      e.target.checked
                        ? [...ids, o.id]
                        : ids.filter((id) => id !== o.id),
                    )
                  }
                />
                {o.naam || t("objects.object", { number: i + 1 })}
                {!kan(o) && ` (${t("formatCopy.unavailable")})`}
              </label>
            ))}
        </div>
      </fieldset>
      {melding && <p role="alert">{melding}</p>}
    </Dialoog>
  );
}
