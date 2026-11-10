import {
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useTranslation } from "react-i18next";
import { Network } from "lucide-react";
import type { PptxEditorApi } from "@betteroffice/pptx-react";
import { RibbonFout } from "../Ribbon";
import { useEditorApi } from "../lint/editorApi";
import { DiaKnop, huidigeIndex } from "../lint/presentatie-acties";
import { Dialoog } from "../werkruimte/Dialoog";
import { beeldbron } from "./diabeeld";
import {
  DiagramFout,
  diagramIndeling,
  diagramVerbindingen,
  leesDiagrammen,
  schrijfDiagramTekst,
  voegDiagramToe,
  type Diagram,
  type DiagramSoort,
} from "./diagrammen";
import { naarDiagramVormen } from "./diagram-conversie";
import "./diagrammen.css";

interface Begin {
  index: number;
  lijst: Diagram[];
  bytes: Uint8Array;
}
export function DiaDiagrammen() {
  const { t } = useTranslation("presentation"),
    { presentatie: api, herlaad } = useEditorApi(),
    meld = useContext(RibbonFout);
  const enabled = useSyncExternalStore(
    (l) => api?.commands.subscribe(l) ?? (() => {}),
    () => api?.commands.getState("insertSlide").enabled ?? false,
  );
  const [begin, zetBegin] = useState<Begin | null>(null),
    [laden, zetLaden] = useState(false);
  async function open() {
    if (!herlaad || !enabled || laden) return;
    zetLaden(true);
    try {
      const index = huidigeIndex(),
        bytes = await herlaad.bytes();
      zetBegin({ index, bytes, lijst: leesDiagrammen(bytes, index) });
    } catch {
      meld(t("sorter.packageFailed"));
    } finally {
      zetLaden(false);
    }
  }
  return (
    <>
      <DiaKnop
        naam={t("diagrams.title")}
        icoon={Network}
        uit={!api || !herlaad || !enabled || laden}
        onClick={() => void open()}
      />
      {begin && api && (
        <DiagramVenster
          begin={begin}
          sluit={() => zetBegin(null)}
          opslaan={async (maak) => {
            if (!herlaad || !api.commands.getState("insertSlide").enabled)
              throw new Error("readOnly");
            const voor = await herlaad.bytes(),
              na = maak(voor);
            zetBegin(null);
            if (voor !== na) herlaad.vervang(na, { dia: begin.index });
          }}
        />
      )}
    </>
  );
}
function DiagramVoorbeeld({
  bytes,
  index,
}: {
  bytes: Uint8Array;
  index: number;
}) {
  const { t } = useTranslation("presentation"),
    ref = useRef<HTMLCanvasElement>(null),
    [fout, zetFout] = useState(false),
    [gerenderd, zetGerenderd] = useState<Uint8Array | null>(null);
  const laden = gerenderd !== bytes;
  useEffect(() => {
    let actief = true;
    zetFout(false);
    void (async () => {
      const { openPresentation, paintSlide } = await import(
          "@betteroffice/pptx"
        ),
        { documentLettertypen, presentatieLettertypen } = await import(
          "../lettertypen/document"
        ),
        handle = openPresentation(bytes);
      try {
        const info = await documentLettertypen(bytes);
        if (!actief) return;
        for (const face of await presentatieLettertypen(info))
          handle.registerFont(face);
        if (!actief || !ref.current) return;
        const list = handle.layoutSlide(index),
          c = ref.current,
          scale = 720 / Math.max(1, list.width);
        c.width = 720;
        c.height = Math.max(1, Math.round(list.height * scale));
        const ctx = c.getContext("2d");
        if (ctx)
          await paintSlide(ctx, list, 1, scale, {
            resolveImage: beeldbron({ handle } as PptxEditorApi),
          });
      } finally {
        handle.dispose();
      }
    })()
      .catch(() => {
        if (actief) zetFout(true);
      })
      .finally(() => {
        if (actief) zetGerenderd(bytes);
      });
    return () => {
      actief = false;
    };
  }, [bytes, index]);
  return (
    <div className="diagram-voorbeeld">
      {laden && <p role="status">{t("diagrams.loading")}</p>}
      <canvas ref={ref} aria-label={t("diagrams.preview")} />
      {fout && <p role="status">{t("diagrams.previewFailed")}</p>}
    </div>
  );
}
function DiagramSchema({
  soort,
  tekst,
}: {
  soort: DiagramSoort;
  tekst: string;
}) {
  const { t } = useTranslation("presentation"),
    id = useId().replace(/:/g, "");
  let nodes: ReturnType<typeof diagramIndeling>;
  try {
    nodes = diagramIndeling(soort, tekst);
  } catch {
    return (
      <p>
        {t(
          soort === "hierarchy"
            ? "diagrams.hierarchyHint"
            : "diagrams.textHint",
        )}
      </p>
    );
  }
  return (
    <svg
      className="diagram-schema"
      viewBox="0 0 800 480"
      role="img"
      aria-label={t("diagrams.structurePreview")}
    >
      <defs>
        <marker
          id={id}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
      </defs>
      {diagramVerbindingen(nodes).map((e, i) => (
        <line
          key={`e${i}`}
          x1={e.x1 * 800}
          y1={e.y1 * 480}
          x2={e.x2 * 800}
          y2={e.y2 * 480}
          stroke="currentColor"
          strokeWidth="3"
          markerEnd={soort === "hierarchy" ? undefined : `url(#${id})`}
        />
      ))}
      {nodes.map((n, i) => (
        <g key={i}>
          <rect
            x={n.x * 800}
            y={n.y * 480}
            width={n.b * 800}
            height={n.h * 480}
            rx="8"
          />
          <text
            className="diagram-label"
            x={(n.x + n.b / 2) * 800}
            y={(n.y + n.h / 2) * 480}
            dominantBaseline="middle"
          >
            {n.tekst.length > Math.floor((n.b * 800) / 9)
              ? n.tekst.slice(0, Math.max(2, Math.floor((n.b * 800) / 9) - 1)) +
                "…"
              : n.tekst}
          </text>
        </g>
      ))}
    </svg>
  );
}
function DiagramVenster({
  begin,
  sluit,
  opslaan,
}: {
  begin: Begin;
  sluit: () => void;
  opslaan: (maak: (bytes: Uint8Array) => Uint8Array) => Promise<void>;
}) {
  const { t } = useTranslation("presentation"),
    [mode, zetMode] = useState<"new" | "existing">(
      begin.lijst.length ? "existing" : "new",
    ),
    [soort, zetSoort] = useState<DiagramSoort>("process"),
    [tekst, zetTekst] = useState(() => t("diagrams.sampleProcess")),
    [selectie, kies] = useState(begin.lijst[0]?.id ?? -1),
    [teksten, zetTeksten] = useState<Record<number, Record<string, string>>>(
      {},
    ),
    [bezig, zetBezig] = useState(false),
    [fout, zetFout] = useState(""),
    [voorbeeld, zetVoorbeeld] = useState<Uint8Array>(begin.bytes);
  const d = begin.lijst.find((d) => d.id === selectie);
  function wijzigSoort(s: DiagramSoort) {
    zetSoort(s);
    zetTekst(
      t(
        s === "hierarchy"
          ? "diagrams.sampleHierarchy"
          : s === "cycle"
            ? "diagrams.sampleCycle"
            : "diagrams.sampleProcess",
      ),
    );
    zetFout("");
  }
  function tekstBytes(bytes: Uint8Array) {
    if (!d) throw new DiagramFout("missingData");
    const actueel = leesDiagrammen(bytes, begin.index).find(
      (m) => m.id === d.id,
    );
    if (!actueel || JSON.stringify(actueel.punten) !== JSON.stringify(d.punten))
      throw new DiagramFout("stale");
    return schrijfDiagramTekst(bytes, begin.index, d.id, teksten[d.id] ?? {});
  }
  function meld(e: unknown) {
    zetFout(
      t(
        e instanceof DiagramFout && e.message === "paragraphCount"
          ? "diagrams.sameParagraphs"
          : e instanceof DiagramFout && e.message === "stale"
            ? "diagrams.stale"
            : e instanceof DiagramFout &&
                ["unsupportedCache", "missingCache"].includes(e.message)
              ? "diagrams.cacheUnsupported"
              : "diagrams.failed",
      ),
    );
  }
  async function bewaar(converteer = false) {
    zetBezig(true);
    zetFout("");
    try {
      await opslaan((b) =>
        mode === "new"
          ? voegDiagramToe(b, begin.index, soort, tekst, t(`diagrams.${soort}`))
          : converteer
            ? naarDiagramVormen(tekstBytes(b), begin.index, selectie)
            : tekstBytes(b),
      );
    } catch (e) {
      meld(e);
    } finally {
      zetBezig(false);
    }
  }
  function preview(converteer = false) {
    try {
      zetVoorbeeld(
        converteer
          ? naarDiagramVormen(tekstBytes(begin.bytes), begin.index, selectie)
          : tekstBytes(begin.bytes),
      );
      zetFout("");
    } catch (e) {
      meld(e);
    }
  }
  let geldig = true;
  try {
    diagramIndeling(soort, tekst);
  } catch {
    geldig = false;
  }
  return (
    <Dialoog
      titel={t("diagrams.title")}
      sluit={() => {
        if (!bezig) sluit();
      }}
      className="diagram-dialoog"
      acties={
        <>
          <button
            type="button"
            className="werkruimte-knop"
            disabled={bezig}
            onClick={sluit}
          >
            {t("diagrams.cancel")}
          </button>
          <button
            type="button"
            className="werkruimte-knop is-primair"
            disabled={
              bezig ||
              (mode === "new"
                ? !geldig
                : !d || !d.punten.some((p) => p.bewerkbaar))
            }
            onClick={() => void bewaar()}
          >
            {t(mode === "new" ? "diagrams.insert" : "diagrams.apply")}
          </button>
        </>
      }
    >
      <div className="diagram-modi">
        <button
          type="button"
          className="werkruimte-knop"
          aria-pressed={mode === "new"}
          disabled={bezig}
          onClick={() => zetMode("new")}
        >
          {t("diagrams.new")}
        </button>
        <button
          type="button"
          className="werkruimte-knop"
          aria-pressed={mode === "existing"}
          disabled={bezig || !begin.lijst.length}
          onClick={() => zetMode("existing")}
        >
          {t("diagrams.existing")}
        </button>
      </div>
      {mode === "new" ? (
        <div className="diagram-indeling">
          <div>
            <label className="diagram-veld">
              {t("diagrams.kind")}
              <select
                value={soort}
                disabled={bezig}
                onChange={(e) => wijzigSoort(e.target.value as DiagramSoort)}
              >
                {(["process", "cycle", "hierarchy"] as const).map((s) => (
                  <option key={s} value={s}>
                    {t(`diagrams.${s}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="diagram-veld">
              {t("diagrams.labels")}
              <textarea
                rows={9}
                maxLength={12000}
                value={tekst}
                disabled={bezig}
                onChange={(e) => zetTekst(e.target.value)}
              />
            </label>
            <p>
              {t(
                soort === "hierarchy"
                  ? "diagrams.hierarchyHint"
                  : "diagrams.textHint",
              )}
            </p>
            <p>{t("diagrams.nativeShapes")}</p>
          </div>
          <DiagramSchema soort={soort} tekst={tekst} />
        </div>
      ) : d ? (
        <>
          <label className="diagram-veld">
            {t("diagrams.choose")}
            <select
              value={selectie}
              disabled={bezig}
              onChange={(e) => {
                kies(Number(e.target.value));
                zetVoorbeeld(begin.bytes);
                zetFout("");
              }}
            >
              {begin.lijst.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.naam}
                </option>
              ))}
            </select>
          </label>
          <div className="diagram-indeling">
            <div className="diagram-teksten">
              {d.punten.map((p, i) => (
                <label className="diagram-veld" key={p.id}>
                  {t("diagrams.node", { number: i + 1 })}
                  <textarea
                    value={teksten[d.id]?.[p.id] ?? p.tekst}
                    rows={Math.max(
                      2,
                      Math.min(5, p.tekst.split("\n").length + 1),
                    )}
                    maxLength={8000}
                    disabled={bezig || !p.bewerkbaar}
                    onChange={(e) =>
                      zetTeksten((v) => ({
                        ...v,
                        [d.id]: { ...v[d.id], [p.id]: e.target.value },
                      }))
                    }
                  />
                  {!p.bewerkbaar && <small>{t("diagrams.readOnly")}</small>}
                </label>
              ))}
              {!d.punten.length && <p role="status">{t("diagrams.noText")}</p>}
              {d.gedeeld && <p role="status">{t("diagrams.shared")}</p>}
              <p>{t("diagrams.paragraphHint")}</p>
            </div>
            <div>
              <DiagramVoorbeeld bytes={voorbeeld} index={begin.index} />
              <div className="diagram-modi">
                <button
                  type="button"
                  className="werkruimte-knop"
                  disabled={bezig}
                  onClick={() => preview()}
                >
                  {t("diagrams.refreshPreview")}
                </button>
                <button
                  type="button"
                  className="werkruimte-knop"
                  disabled={bezig || !d.cacheVormen}
                  onClick={() => preview(true)}
                >
                  {t("diagrams.previewShapes")}
                </button>
              </div>
            </div>
          </div>
          <p>{t("diagrams.convertHint")}</p>
          <button
            type="button"
            className="werkruimte-knop"
            disabled={bezig || !d.cacheVormen}
            onClick={() => void bewaar(true)}
          >
            {t("diagrams.convert")}
          </button>
          {!d.cacheVormen && <p>{t("diagrams.noCache")}</p>}
        </>
      ) : null}
      <p>{t("diagrams.reloadHint")}</p>
      {fout && <p role="alert">{fout}</p>}
    </Dialoog>
  );
}
