import {
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { PptxEditorApi } from "@betteroffice/pptx-react";
import { ArrowLeft, Redo2, Undo2 } from "lucide-react";
import {
  overzichtAlineas,
  wijzigOverzichtAlinea,
  type OverzichtAlinea,
} from "./overzicht";
import "./presentatie.css";

export function DiaOverzicht({
  api,
  anker,
  bewerkbaar,
  sluit,
  fout,
}: {
  api: PptxEditorApi | null;
  anker: HTMLElement | null;
  bewerkbaar: boolean;
  sluit: () => void;
  fout: (bericht: string) => void;
}) {
  const { t } = useTranslation("presentation");
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [gereed, setGereed] = useState(false);
  const versie = useSyncExternalStore(
    (meld) => api?.handle.onUpdate(() => meld()) ?? (() => {}),
    () => api?.handle.version() ?? "",
    () => "",
  );
  useLayoutEffect(() => {
    const h =
      anker?.closest(".office-presentatie")?.querySelector("aside")
        ?.parentElement ?? null;
    if (h && getComputedStyle(h).position === "static")
      h.style.position = "relative";
    setHost(h);
  }, [anker, api]);
  useEffect(() => {
    let actief = true;
    setGereed(false);
    if (api)
      void api
        .flushPendingInput()
        .then(() => {
          if (actief) setGereed(true);
        })
        .catch((e) => {
          if (actief) fout(String(e));
        });
    return () => {
      actief = false;
    };
  }, [api]);
  if (!host || !api || !gereed) return null;
  const inhoud = api.handle.readContent();
  if (!inhoud.ok) return null;
  const alineas = overzichtAlineas(inhoud);
  const geschiedenis = (op: "undo" | "redo") => {
    void api.commands.execute(op, null).then((r) => {
      if (!r.ok) fout(r.failure.message);
    });
  };
  return createPortal(
    <section
      className="dia-overzicht"
      aria-label={t("outline.title")}
      data-versie={versie}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          sluit();
        }
        if (
          (e.ctrlKey || e.metaKey) &&
          !e.altKey &&
          ["z", "y"].includes(e.key.toLowerCase())
        ) {
          e.preventDefault();
          geschiedenis(
            e.key.toLowerCase() === "y" || e.shiftKey ? "redo" : "undo",
          );
        }
      }}
    >
      <header className="sorteerder-balk">
        <strong className="sorteerder-titel">{t("outline.title")}</strong>
        <button type="button" onClick={sluit}>
          <ArrowLeft size={16} />
          {t("sorter.normalView")}
        </button>
        <button
          type="button"
          disabled={!bewerkbaar || !api.handle.canUndo()}
          onClick={() => geschiedenis("undo")}
          aria-label={t("outline.undo")}
        >
          <Undo2 size={16} />
        </button>
        <button
          type="button"
          disabled={!bewerkbaar || !api.handle.canRedo()}
          onClick={() => geschiedenis("redo")}
          aria-label={t("outline.redo")}
        >
          <Redo2 size={16} />
        </button>
      </header>
      <div className="dia-overzicht-inhoud">
        {inhoud.slides.map((dia, index) => (
          <article key={dia.id}>
            <h2>
              <button
                type="button"
                onClick={() => {
                  api.goToSlide(index + 1);
                  sluit();
                }}
              >
                {t("sorter.slide", { number: index + 1 })}
              </button>
            </h2>
            {alineas
              .filter((a) => a.slideId === dia.id)
              .map((a, i) => (
                <OverzichtVeld
                  key={`${a.storyId}/${a.paragraphId}`}
                  alinea={a}
                  uit={!bewerkbaar || !a.bewerkbaar}
                  label={t("outline.paragraph", {
                    slide: index + 1,
                    number: i + 1,
                  })}
                  wijzig={(nieuw) => {
                    if (
                      !bewerkbaar ||
                      !api.commands.getState("insertSlide").enabled
                    )
                      return;
                    if (wijzigOverzichtAlinea(api.handle, a, nieuw))
                      api.refresh();
                  }}
                  fout={fout}
                />
              ))}
            {!alineas.some((a) => a.slideId === dia.id) && (
              <p>{t("outline.empty")}</p>
            )}
          </article>
        ))}
      </div>
    </section>,
    host,
  );
}

function OverzichtVeld({
  alinea,
  uit,
  label,
  wijzig,
  fout,
}: {
  alinea: OverzichtAlinea;
  uit: boolean;
  label: string;
  wijzig: (tekst: string) => void;
  fout: (bericht: string) => void;
}) {
  const [tekst, setTekst] = useState(alinea.tekst);
  useEffect(() => setTekst(alinea.tekst), [alinea.tekst]);
  return (
    <textarea
      aria-label={label}
      value={tekst}
      readOnly={uit}
      rows={Math.min(5, Math.max(1, tekst.split("\n").length))}
      onKeyDown={(e) => {
        if (
          e.key !== "Enter" ||
          e.nativeEvent.isComposing ||
          uit ||
          e.ctrlKey ||
          e.metaKey ||
          e.altKey
        )
          return;
        e.preventDefault();
        const veld = e.currentTarget;
        const artikel = veld.closest("article")!;
        const index = [...artikel.querySelectorAll("textarea")].indexOf(veld);
        try {
          wijzig(
            tekst.slice(0, veld.selectionStart) +
              "\n" +
              tekst.slice(veld.selectionEnd),
          );
          requestAnimationFrame(() => {
            const volgend = artikel.querySelectorAll("textarea")[index + 1];
            volgend?.focus();
            volgend?.setSelectionRange(0, 0);
          });
        } catch (e) {
          fout(e instanceof Error ? e.message : String(e));
        }
      }}
      onChange={(e) => {
        try {
          wijzig(e.target.value);
          setTekst(e.target.value);
        } catch (e) {
          setTekst(alinea.tekst);
          fout(e instanceof Error ? e.message : String(e));
        }
      }}
    />
  );
}
