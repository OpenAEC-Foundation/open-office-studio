import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { SlidersHorizontal } from "lucide-react";
import type { PptxEditorApi } from "@betteroffice/pptx-react";
import type { ShapeRect } from "@betteroffice/pptx";
import { Dialoog } from "../werkruimte/Dialoog";
import { useEditorApi } from "../lint/editorApi";
import {
  DiaKnop,
  geselecteerdeVorm,
  huidigeIndex,
} from "../lint/presentatie-acties";
import {
  objectKaders,
  pasObjectKadersToe,
  schikObjecten,
  type ObjectOpdracht,
} from "./objecten";
import "./objecten.css";

export function DiaObjecten() {
  const { presentatie: api } = useEditorApi();
  const { t } = useTranslation("presentation");
  const [open, setOpen] = useState<{
    api: PptxEditorApi;
    dia: string;
    keuze: string[];
  } | null>(null);
  const bewerkbaar = useSyncExternalStore(
    (meld) => api?.commands.subscribe(meld) ?? (() => {}),
    () => api?.commands.getState("insertSlide").enabled ?? false,
  );
  return (
    <>
      <DiaKnop
        naam={t("objects.title")}
        icoon={SlidersHorizontal}
        groot
        uit={!bewerkbaar}
        onClick={() => {
          if (!api) return;
          const gekozen = geselecteerdeVorm(api)?.vorm.id;
          const dia = api.handle.snapshot().slides[huidigeIndex()];
          if (dia)
            setOpen({ api, dia: dia.id, keuze: gekozen ? [gekozen] : [] });
        }}
      />
      {open && api === open.api && (
        <ObjectenDialoog
          api={api}
          slideId={open.dia}
          begin={open.keuze}
          sluit={() => setOpen(null)}
        />
      )}
    </>
  );
}

function ObjectenDialoog({
  api,
  slideId,
  begin,
  sluit,
}: {
  api: PptxEditorApi;
  slideId: string;
  begin: string[];
  sluit: () => void;
}) {
  const { t } = useTranslation("presentation");
  useSyncExternalStore(
    (meld) => api.handle.onUpdate(() => meld()),
    () => api.handle.version(),
  );
  const bewerkbaar = useSyncExternalStore(
    (meld) => api.commands.subscribe(meld),
    () => api.commands.getState("insertSlide").enabled,
  );
  const dia = api.handle.snapshot().slides.find((s) => s.id === slideId);
  const objecten = objectKaders(dia?.shapes ?? []);
  const [keuze, setKeuze] = useState(begin);
  const gekozen = objecten.filter((o) => keuze.includes(o.id));
  const [referentie, setReferentie] = useState<"selectie" | "dia">("selectie");
  const [velden, setVelden] = useState({ x: "", y: "", width: "", height: "" });
  const [basis, setBasis] = useState<ShapeRect | null>(null);
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  const [bericht, setBericht] = useState("");
  const enkel = gekozen.length === 1 ? gekozen[0] : null;
  useEffect(() => {
    setBasis(enkel?.bron ?? enkel?.rect ?? null);
    setVelden(
      Object.fromEntries(
        ["x", "y", "width", "height"].map((k) => [
          k,
          enkel ? String(enkel.rect[k as keyof ShapeRect] / 360000) : "",
        ]),
      ) as typeof velden,
    );
  }, [enkel?.id]);
  const voerUit = (werk: () => Promise<unknown>) => {
    setFout("");
    setBericht("");
    setBezig(true);
    void werk()
      .then(() => setBericht(t("objects.applied")))
      .catch((e) => setFout(e instanceof Error ? e.message : String(e)))
      .finally(() => setBezig(false));
  };
  const schik = (opdracht: ObjectOpdracht) =>
    voerUit(async () => {
      await api.flushPendingInput();
      const deck = api.handle.snapshot();
      const live = deck.slides.find((s) => s.id === slideId);
      if (!live) throw new Error(t("objects.gone"));
      const actueel = objectKaders(live.shapes).filter((o) =>
        keuze.includes(o.id),
      );
      await pasObjectKadersToe(
        api,
        slideId,
        schikObjecten(
          actueel,
          opdracht,
          referentie,
          deck.widthEmu,
          deck.heightEmu,
        ),
      );
      if (actueel.length === 1) {
        const nieuw = objectKaders(
          api.handle.snapshot().slides.find((s) => s.id === slideId)?.shapes ??
            [],
        ).find((o) => o.id === actueel[0].id);
        if (nieuw) {
          setBasis(nieuw.bron ?? nieuw.rect);
          setVelden(
            Object.fromEntries(
              Object.entries(nieuw.rect).map(([k, v]) => [
                k,
                String(v / 360000),
              ]),
            ) as typeof velden,
          );
        }
      }
    });
  return (
    <Dialoog
      titel={t("objects.title")}
      sluit={sluit}
      acties={
        <button type="button" className="werkruimte-knop" onClick={sluit}>
          {t("objects.close")}
        </button>
      }
    >
      <p>{t("objects.choose")}</p>
      <div className="dia-objecten-lijst">
        {objecten.map((o, i) => (
          <label key={o.id} className="werkruimte-vink">
            <input
              type="checkbox"
              checked={keuze.includes(o.id)}
              onChange={(e) =>
                setKeuze(
                  e.target.checked
                    ? [...keuze, o.id]
                    : keuze.filter((id) => id !== o.id),
                )
              }
            />
            {o.naam || t("objects.object", { number: i + 1 })}
          </label>
        ))}
        {!objecten.length && <p>{t("objects.empty")}</p>}
      </div>
      <fieldset disabled={bezig || !bewerkbaar}>
        <legend>{t("objects.align")}</legend>
        <label className="werkruimte-veld">
          {t("objects.relative")}
          <select
            value={referentie}
            onChange={(e) => setReferentie(e.target.value as typeof referentie)}
          >
            <option value="selectie">{t("objects.selection")}</option>
            <option value="dia">{t("objects.slide")}</option>
          </select>
        </label>
        <div className="dia-objecten-knoppen">
          {(
            [
              "links",
              "centreren",
              "rechts",
              "boven",
              "midden",
              "onder",
            ] as const
          ).map((w) => (
            <button
              type="button"
              className="werkruimte-knop"
              key={w}
              disabled={!gekozen.length}
              onClick={() => schik(w)}
            >
              {t(`objects.${w}`)}
            </button>
          ))}
          <button
            type="button"
            className="werkruimte-knop"
            disabled={gekozen.length < 3}
            onClick={() => schik("horizontaal")}
          >
            {t("objects.horizontal")}
          </button>
          <button
            type="button"
            className="werkruimte-knop"
            disabled={gekozen.length < 3}
            onClick={() => schik("verticaal")}
          >
            {t("objects.vertical")}
          </button>
        </div>
      </fieldset>
      <fieldset disabled={!enkel || bezig || !bewerkbaar}>
        <legend>{t("objects.position")}</legend>
        {!enkel && <p>{t("objects.one")}</p>}
        {(["x", "y", "width", "height"] as const).map((k) => (
          <label className="werkruimte-veld" key={k}>
            {t(`objects.${k}`)} (cm)
            <input
              type="number"
              step="0.01"
              value={velden[k]}
              onChange={(e) => setVelden({ ...velden, [k]: e.target.value })}
            />
          </label>
        ))}
        <button
          type="button"
          className="werkruimte-knop"
          onClick={() => {
            if (!enkel || !basis) return;
            const rect = Object.fromEntries(
              Object.entries(velden).map(([k, v]) => [
                k,
                v.trim() ? Math.round(Number(v) * 360000) : NaN,
              ]),
            ) as unknown as ShapeRect;
            voerUit(async () => {
              await pasObjectKadersToe(
                api,
                slideId,
                new Map([[enkel.id, rect]]),
                new Map([[enkel.id, basis]]),
              );
              setBasis(rect);
            });
          }}
        >
          {t("objects.apply")}
        </button>
      </fieldset>
      {fout && (
        <p role="alert" className="werkruimte-fout">
          {fout}
        </p>
      )}
      <p role="status">{bericht}</p>
    </Dialoog>
  );
}
