import {
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { PptxEditorApi } from "@betteroffice/pptx-react";
import { Group, Ungroup } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RibbonFout } from "../Ribbon";
import { useEditorApi, useEditorZichtbaar } from "../lint/editorApi";
import {
  DiaKnop,
  geselecteerdeVorm,
  huidigeIndex,
} from "../lint/presentatie-acties";
import { Dialoog } from "../werkruimte/Dialoog";
import {
  groepeerObjecten,
  GroepFout,
  hefGroepOp,
  leesGroepObjecten,
  type GroepObject,
} from "./groepen";
import "./objecten.css";
interface Begin {
  api: PptxEditorApi;
  versie: string;
  dia: number;
  opheffen: boolean;
  objecten: GroepObject[];
  keuze: string[];
}
export function DiaGroepen({ bediening = true }: { bediening?: boolean }) {
  const { t } = useTranslation("presentation"),
    { presentatie: api, herlaad } = useEditorApi(),
    zichtbaar = useEditorZichtbaar(),
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
    t(`groups.errors.${e instanceof GroepFout ? e.code : "invalid"}`);
  async function open(opheffen: boolean) {
    if (!api || !herlaad || !editable || laden) return;
    setLaden(true);
    try {
      const dia = huidigeIndex(),
        gekozen = String(geselecteerdeVorm(api)?.vorm.sourceId ?? ""),
        bytes = await herlaad.bytes();
      if (live.current !== api) return;
      const objecten = leesGroepObjecten(bytes, dia).filter(
        (o) => !opheffen || o.groep,
      );
      if (!objecten.length) throw new GroepFout("missing");
      setBegin({
        api,
        versie: api.handle.version(),
        dia,
        opheffen,
        objecten,
        keuze: objecten.some(
          (o) => o.id === gekozen && (opheffen || o.mogelijk),
        )
          ? [gekozen]
          : opheffen
            ? [objecten[0].id]
            : [],
      });
    } catch (e) {
      meld(fout(e));
    } finally {
      setLaden(false);
    }
  }
  useEffect(() => {
    if (bediening || !api || !herlaad || !zichtbaar) return;
    const toets = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        !(e.ctrlKey || e.metaKey) ||
        e.altKey ||
        e.key.toLowerCase() !== "g" ||
        !editable ||
        laden
      )
        return;
      if (document.querySelector('.voorstelling,[role="dialog"],dialog[open]'))
        return;
      const target = e.target instanceof Element ? e.target : null;
      if (
        target?.closest(
          'input,textarea,select,[contenteditable="true"],.sorteerder,.dia-overzicht',
        )
      )
        return;
      const active = document.activeElement;
      if (
        active &&
        active !== document.body &&
        !active.closest(
          '.office-presentatie [role="application"],.office-presentatie aside',
        )
      )
        return;
      e.preventDefault();
      e.stopImmediatePropagation();
      void open(e.shiftKey);
    };
    window.addEventListener("keydown", toets, true);
    return () => window.removeEventListener("keydown", toets, true);
  }, [bediening, api, herlaad, zichtbaar, editable, laden]);
  return (
    <>
      {bediening && (
        <>
          <DiaKnop
            naam={t("groups.group")}
            icoon={Group}
            toets="Ctrl+G"
            uit={!editable || laden}
            onClick={() => void open(false)}
          />
          <DiaKnop
            naam={t("groups.ungroup")}
            icoon={Ungroup}
            toets="Ctrl+Shift+G"
            uit={!editable || laden}
            onClick={() => void open(true)}
          />
        </>
      )}
      {begin && begin.api === api && (
        <GroepVenster
          begin={begin}
          sluit={() => setBegin(null)}
          fout={fout}
          doe={async (ids, naam) => {
            if (
              !api ||
              !herlaad ||
              !api.commands.getState("insertSlide").enabled ||
              api.handle.version() !== begin.versie
            )
              throw new GroepFout("missing");
            const bytes = await herlaad.bytes();
            if (live.current !== api || api.handle.version() !== begin.versie)
              throw new GroepFout("missing");
            const result = begin.opheffen
              ? hefGroepOp(bytes, begin.dia, ids[0])
              : groepeerObjecten(bytes, begin.dia, ids, naam).bytes;
            setBegin(null);
            herlaad.vervang(result, { dia: begin.dia });
          }}
        />
      )}
    </>
  );
}
function GroepVenster({
  begin,
  sluit,
  doe,
  fout,
}: {
  begin: Begin;
  sluit: () => void;
  doe: (ids: string[], naam: string) => Promise<void>;
  fout: (e: unknown) => string;
}) {
  const { t } = useTranslation("presentation"),
    [keuze, setKeuze] = useState(begin.keuze),
    [naam, setNaam] = useState(t("groups.defaultName")),
    [bezig, setBezig] = useState(false),
    [melding, setMelding] = useState("");
  const valid = begin.opheffen
    ? keuze.length === 1
    : keuze.length >= 2 && !!naam.trim();
  return (
    <Dialoog
      titel={t(begin.opheffen ? "groups.ungroup" : "groups.group")}
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
            disabled={bezig || !valid}
            onClick={() => {
              setBezig(true);
              setMelding("");
              void doe(keuze, naam)
                .catch((e) => setMelding(fout(e)))
                .finally(() => setBezig(false));
            }}
          >
            {t("groups.apply")}
          </button>
        </>
      }
    >
      <p>{t(begin.opheffen ? "groups.ungroupHelp" : "groups.help")}</p>
      <p>{t("design.reload")}</p>
      <fieldset disabled={bezig} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="dia-objecten-lijst">
          {begin.objecten.map((o, i) => (
            <label key={o.id} className="werkruimte-vink">
              <input
                type={begin.opheffen ? "radio" : "checkbox"}
                name="groepsobjecten"
                checked={keuze.includes(o.id)}
                disabled={!begin.opheffen && !o.mogelijk}
                onChange={(e) =>
                  setKeuze(
                    begin.opheffen
                      ? [o.id]
                      : e.target.checked
                        ? [...keuze, o.id]
                        : keuze.filter((id) => id !== o.id),
                  )
                }
              />
              {o.naam || t("objects.object", { number: i + 1 })}
              {!begin.opheffen &&
                !o.mogelijk &&
                ` (${t("groups.unavailable")})`}
            </label>
          ))}
        </div>
        {!begin.opheffen && (
          <label style={{ display: "grid", gap: 4, marginTop: 12 }}>
            {t("groups.name")}
            <input
              maxLength={255}
              value={naam}
              onChange={(e) => setNaam(e.target.value)}
            />
          </label>
        )}
      </fieldset>
      {melding && <p role="alert">{melding}</p>}
    </Dialoog>
  );
}
