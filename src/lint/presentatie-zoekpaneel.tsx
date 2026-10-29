/**
 * Paneel Zoeken en vervangen in Presentatie (Ctrl+F, Ctrl+H). Zelfde vorm als in Rekenblad
 * (niet-modaal paneel rechtsboven, Esc sluit); de logica staat in `presentatie-zoeken.ts`.
 */
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PptxEditorApi } from "@betteroffice/pptx-react";
import { formatGetal } from "../i18n/opmaak";
import { huidigeIndex } from "./presentatie-acties";
import { vervang, volgendeIndex, zoekTreffers, type Treffer } from "./presentatie-zoeken";
// Dezelfde paneelstijl als Zoeken en vervangen in Rekenblad.
import "./rekenblad.css";

export function PresentatieZoeken({
  api,
  stand,
  bewerkbaar,
  sluiten,
}: {
  api: PptxEditorApi;
  stand: "zoeken" | "vervangen";
  bewerkbaar: boolean;
  sluiten: () => void;
}) {
  const { t } = useTranslation("ribbon");
  const titel = useId();
  const paneel = useRef<HTMLElement>(null);
  const [zoek, setZoek] = useState("");
  const [door, setDoor] = useState("");
  const [hoofdletters, setHoofdletters] = useState(false);
  const [status, setStatus] = useState("");
  const huidig = useRef<Treffer | null>(null);
  const bezig = useRef(false);

  useEffect(() => {
    const veld = paneel.current?.querySelector<HTMLInputElement>(
      stand === "vervangen" && zoek ? "input[name=door]" : "input[name=zoek]",
    );
    veld?.focus();
    veld?.select();
    // Alleen bij openen of wisselen tussen Ctrl+F en Ctrl+H.
  }, [stand]);

  async function doe(actie: () => Promise<string>) {
    if (bezig.current || !zoek) return;
    bezig.current = true;
    try {
      setStatus(await actie());
    } catch (fout) {
      setStatus(fout instanceof Error ? fout.message : String(fout));
    } finally {
      bezig.current = false;
    }
  }

  /** Selecteert de volgende (of vorige) treffer; geeft de statustekst. */
  const ga = async (terug: boolean) => {
    const { treffers } = await zoekTreffers(api, zoek, hoofdletters);
    const i = volgendeIndex(treffers, huidig.current, terug, huidigeIndex() + 1);
    if (i < 0) {
      huidig.current = null;
      return t("presentation.find.notFound");
    }
    const treffer = treffers[i];
    huidig.current = treffer;
    // selectText zet de focus in de dia; houd hem in het paneel (Enter = volgende, Esc = sluiten).
    const focus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    api.selectText({
      slide: treffer.dia,
      shapeId: treffer.shapeId,
      storyId: treffer.storyId,
      start: treffer.start,
      end: treffer.end,
    });
    if (focus && paneel.current?.contains(focus)) {
      focus.focus();
      requestAnimationFrame(() => paneel.current?.contains(focus) && focus.focus());
    }
    return t("presentation.find.found", {
      current: formatGetal(i + 1),
      total: formatGetal(treffers.length),
      slide: formatGetal(treffer.dia),
    });
  };

  const vervangHuidige = async () => {
    const uitkomst = await zoekTreffers(api, zoek, hoofdletters);
    const doel = huidig.current;
    const treffer = doel
      ? uitkomst.treffers.find(
          (x) => x.slideId === doel.slideId && x.storyId === doel.storyId && x.start === doel.start,
        )
      : undefined;
    // Nog niets geselecteerd (of de selectie is geen treffer meer): eerst naar de volgende.
    if (!treffer) return ga(false);
    await vervang(api, uitkomst, [treffer], door);
    // Na het vervangen naar de volgende treffer, vanaf dezelfde plek.
    huidig.current = { ...treffer, start: treffer.start + door.length, end: treffer.start + door.length };
    const volgende = await ga(false);
    return `${t("presentation.find.replacedCurrent")} ${volgende}`;
  };

  const allesVervangen = async () => {
    const uitkomst = await zoekTreffers(api, zoek, hoofdletters);
    const aantal = await vervang(api, uitkomst, uitkomst.treffers, door);
    huidig.current = null;
    return aantal
      ? t("presentation.find.replacedAll", { number: formatGetal(aantal) })
      : t("presentation.find.notFound");
  };

  return createPortal(
    <section
      ref={paneel}
      className="rekenblad-paneel"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titel}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          sluiten();
        }
      }}
    >
      <header>
        <h2 id={titel}>{t("presentation.find.title")}</h2>
        <button type="button" aria-label={t("common:close")} title={t("spreadsheet.dialogs.closeEsc")} onClick={sluiten}>
          <X size={15} />
        </button>
      </header>
      <form
        className="rekenblad-formulier"
        onSubmit={(event) => {
          event.preventDefault();
          void doe(() => ga(false));
        }}
      >
        <label>
          {t("presentation.find.findWhat")}
          <input
            name="zoek"
            value={zoek}
            onChange={(e) => {
              setZoek(e.target.value);
              huidig.current = null;
            }}
            onKeyDown={(e) => {
              // Shift+Enter: vorige treffer, zoals in de andere modules.
              if (e.key === "Enter" && e.shiftKey) {
                e.preventDefault();
                void doe(() => ga(true));
              }
            }}
          />
        </label>
        <label>
          {t("presentation.find.replaceWith")}
          <input name="door" value={door} disabled={!bewerkbaar} onChange={(e) => setDoor(e.target.value)} />
        </label>
        <label className="rekenblad-vinkje">
          <input
            type="checkbox"
            checked={hoofdletters}
            onChange={(e) => {
              setHoofdletters(e.target.checked);
              huidig.current = null;
            }}
          />
          {t("presentation.find.matchCase")}
        </label>
        <div className="rekenblad-knoppen">
          <button type="button" disabled={!zoek} onClick={() => void doe(() => ga(true))}>
            {t("presentation.find.previous")}
          </button>
          <button type="submit" disabled={!zoek}>
            {t("presentation.find.next")}
          </button>
          <button type="button" disabled={!zoek || !bewerkbaar} onClick={() => void doe(vervangHuidige)}>
            {t("presentation.find.replace")}
          </button>
          <button
            type="button"
            className="rekenblad-primair"
            disabled={!zoek || !bewerkbaar}
            onClick={() => void doe(allesVervangen)}
          >
            {t("presentation.find.replaceAll")}
          </button>
        </div>
        <p role="status" className="rekenblad-status">
          {status}
        </p>
      </form>
    </section>,
    document.body,
  );
}
