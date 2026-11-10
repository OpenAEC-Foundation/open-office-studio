import {
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ClipboardPaste, Copy, FileInput } from "lucide-react";
import type { PptxEditorApi } from "@betteroffice/pptx-react";
import { useTranslation } from "react-i18next";
import { RibbonFout } from "../Ribbon";
import { useEditorApi, useEditorZichtbaar } from "../lint/editorApi";
import { DiaKnop, huidigeIndex } from "../lint/presentatie-acties";
import { Dialoog } from "../werkruimte/Dialoog";
import { leesKlembordTekst } from "../klembord";
import {
  hergebruikDias,
  HergebruikFout,
  isDiaKopie,
  leesDiaKopie,
  leesHergebruik,
  maakDiaKopie,
} from "./hergebruik";
import { leesWeergave, zetWeergave } from "./weergave";
import "./hergebruik.css";

interface Begin {
  api: PptxEditorApi;
  versie: string;
  index: number;
  bytes: Uint8Array;
  naam: string;
  info: ReturnType<typeof leesHergebruik>;
}
async function schrijf(tekst: string) {
  if ("__TAURI_INTERNALS__" in window) {
    const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
    await writeText(tekst);
  } else await navigator.clipboard.writeText(tekst);
}
export function DiaHergebruik({ bediening = true }: { bediening?: boolean }) {
  const { t } = useTranslation("presentation"),
    { presentatie: api, herlaad } = useEditorApi(),
    zichtbaar = useEditorZichtbaar(),
    meld = useContext(RibbonFout);
  const bestand = useRef<HTMLInputElement>(null),
    live = useRef(api);
  live.current = api;
  const [begin, setBegin] = useState<Begin | null>(null),
    [laden, setLaden] = useState(false);
  const enabled = useSyncExternalStore(
    (l) => api?.commands.subscribe(l) ?? (() => {}),
    () => api?.commands.getState("insertSlide").enabled ?? false,
  );
  const fout = (e: unknown) =>
    e instanceof HergebruikFout
      ? t(`reuse.errors.${e.code}`)
      : t("reuse.errors.invalid");
  const selectie = () => {
    const w = leesWeergave(herlaad ?? api);
    return w.weergave === "sorteerder" && w.selectie.length
      ? w.selectie
      : [huidigeIndex()];
  };
  async function openen(bytes: Uint8Array, naam: string) {
    if (!api || !herlaad || !enabled) return;
    const info = leesHergebruik(bytes);
    await herlaad.bytes();
    if (live.current !== api) return;
    setBegin({
      api,
      versie: api.handle.version(),
      index: huidigeIndex(),
      bytes,
      naam,
      info,
    });
  }
  async function kopieer() {
    if (!api || !herlaad || laden) return;
    setLaden(true);
    try {
      await schrijf(maakDiaKopie(await herlaad.bytes(), selectie()));
    } catch (e) {
      meld(fout(e));
    } finally {
      setLaden(false);
    }
  }
  async function plak(tekst?: string) {
    try {
      await openen(
        leesDiaKopie(tekst ?? (await leesKlembordTekst())),
        t("reuse.copied"),
      );
    } catch (e) {
      meld(fout(e));
    }
  }
  useEffect(() => {
    if (bediening || !api || !herlaad || !zichtbaar) return;
    const invoer = (e: Event) =>
      e.target instanceof Element &&
      e.target.closest(
        'input,textarea,[contenteditable="true"],[role="dialog"]',
      );
    const onPaste = (e: ClipboardEvent) => {
      if (e.defaultPrevented || invoer(e)) return;
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (!isDiaKopie(text)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      void plak(text);
    };
    const onCopy = (e: ClipboardEvent) => {
      if (
        e.defaultPrevented ||
        invoer(e) ||
        leesWeergave(herlaad).weergave !== "sorteerder" ||
        !e.clipboardData
      )
        return;
      try {
        const text = maakDiaKopie(api.handle.save(), selectie());
        e.clipboardData.setData("text/plain", text);
        e.preventDefault();
        e.stopImmediatePropagation();
      } catch (e) {
        meld(fout(e));
      }
    };
    window.addEventListener("paste", onPaste, true);
    window.addEventListener("copy", onCopy, true);
    return () => {
      window.removeEventListener("paste", onPaste, true);
      window.removeEventListener("copy", onCopy, true);
    };
  }, [bediening, api, herlaad, zichtbaar, enabled]);
  return (
    <>
      {bediening && (
        <>
          <DiaKnop
            naam={t("reuse.title")}
            icoon={FileInput}
            uit={!enabled || laden}
            onClick={() => bestand.current?.click()}
          />
          <DiaKnop
            naam={t("reuse.copy")}
            icoon={Copy}
            uit={!api || laden}
            onClick={() => void kopieer()}
          />
          <DiaKnop
            naam={t("reuse.paste")}
            icoon={ClipboardPaste}
            uit={!enabled || laden}
            onClick={() => void plak()}
          />
          <input
            ref={bestand}
            type="file"
            accept=".pptx"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setLaden(true);
              void (async () => {
                if (f.size > 100 * 1024 * 1024)
                  throw new HergebruikFout("tooLarge");
                await openen(new Uint8Array(await f.arrayBuffer()), f.name);
              })()
                .catch((e) => meld(fout(e)))
                .finally(() => setLaden(false));
            }}
          />
        </>
      )}
      {begin && begin.api === api && (
        <HergebruikVenster
          begin={begin}
          sluit={() => setBegin(null)}
          fout={fout}
          doe={async (gekozen) => {
            if (
              !api ||
              !herlaad ||
              api !== begin.api ||
              api.handle.version() !== begin.versie ||
              !api.commands.getState("insertSlide").enabled
            )
              throw new HergebruikFout("invalid");
            const bytes = await herlaad.bytes();
            if (api.handle.version() !== begin.versie)
              throw new HergebruikFout("invalid");
            const r = hergebruikDias(bytes, begin.bytes, gekozen, begin.index);
            zetWeergave(herlaad, {
              selectie: Array.from(
                { length: r.aantal },
                (_, i) => r.eerste + i,
              ),
              bericht: t("reuse.inserted", { number: r.aantal }),
            });
            setBegin(null);
            herlaad.vervang(r.bytes, { dia: r.eerste });
          }}
        />
      )}
    </>
  );
}
function HergebruikVenster({
  begin,
  sluit,
  doe,
  fout,
}: {
  begin: Begin;
  sluit: () => void;
  doe: (selectie: number[]) => Promise<void>;
  fout: (e: unknown) => string;
}) {
  const { t } = useTranslation("presentation"),
    [keuze, setKeuze] = useState(begin.info.dias.map((d) => d.index)),
    [bezig, setBezig] = useState(false),
    [melding, setMelding] = useState("");
  return (
    <Dialoog
      titel={t("reuse.title")}
      className="presentatie-hergebruik"
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
            disabled={bezig || !keuze.length}
            onClick={() => {
              setBezig(true);
              setMelding("");
              void doe(keuze)
                .catch((e) => setMelding(fout(e)))
                .finally(() => setBezig(false));
            }}
          >
            {t("reuse.insert")}
          </button>
        </>
      }
    >
      <p>
        <b>{begin.naam}</b>
      </p>
      <p>{t("reuse.help")}</p>
      <p>{t("design.reload")}</p>
      <fieldset disabled={bezig}>
        <label>
          <input
            type="checkbox"
            checked={
              keuze.length === begin.info.dias.length && keuze.length > 0
            }
            onChange={(e) =>
              setKeuze(
                e.target.checked ? begin.info.dias.map((d) => d.index) : [],
              )
            }
          />
          {t("reuse.all")}
        </label>
        <div className="hergebruik-lijst">
          {begin.info.dias.map((d) => (
            <label key={d.index}>
              <input
                type="checkbox"
                checked={keuze.includes(d.index)}
                onChange={(e) =>
                  setKeuze((k) =>
                    e.target.checked
                      ? [...k, d.index]
                      : k.filter((i) => i !== d.index),
                  )
                }
              />
              <span>
                {t("reuse.slide", { number: d.index + 1 })}
                {d.naam ? `: ${d.naam}` : ""}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {melding && <p role="alert">{melding}</p>}
    </Dialoog>
  );
}
