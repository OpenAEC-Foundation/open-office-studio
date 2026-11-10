import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import type { PptxEditorApi } from "@betteroffice/pptx-react";
import { useTranslation } from "react-i18next";
import { useEditorApi } from "../lint/editorApi";
import { rijkeNotitieSessie } from "./notitiesSessie";
import { NotitieFout } from "./notitiesPakket";
import { RijkeNotitieBewerker } from "./RijkeNotitieBewerker";
import "./rijkeNotities.css";
export function RijkeNotitiesPaneel({
  api,
  host,
  opslaan,
}: {
  api: PptxEditorApi;
  host: RefObject<HTMLDivElement | null>;
  opslaan: () => void;
}) {
  const { t } = useTranslation("presentation"),
    { herlaad } = useEditorApi(),
    session = rijkeNotitieSessie(api)!,
    [current, setCurrent] = useState(() => ({
      index: 0,
      id: session.lees(0).id,
    })),
    [melding, setMelding] = useState(""),
    [bezig, setBezig] = useState(false),
    live = useRef(api);
  live.current = api;
  useSyncExternalStore(session.subscribe, session.version);
  const editable = useSyncExternalStore(
      (l) => api.commands.subscribe(l),
      () => api.commands.getState("insertSlide").enabled,
    ),
    note = session.huidig(current.id);
  const fout = (e: unknown) =>
    setMelding(
      t(
        `richNotes.errors.${e instanceof NotitieFout ? e.code : e instanceof Error && ["field", "tooLarge"].includes(e.message) ? e.message : "invalid"}`,
      ),
    );
  useEffect(() => {
    const root = host.current;
    if (!root) return;
    let last: Element | null = null,
      count = -1,
      index = -1,
      frame = 0;
    const changed = () => {
      frame = 0;
      const buttons = [
          ...root.querySelectorAll(".office-presentatie aside > button"),
        ],
        n = Math.max(
          0,
          buttons.findIndex((b) => b.getAttribute("aria-current") === "page"),
        ),
        button = buttons[n] ?? null;
      if (n === index && button === last && count === buttons.length) return;
      last = button;
      count = buttons.length;
      index = n;
      try {
        const next = session.lees(n);
        setCurrent({ index: n, id: next.id });
        setMelding(next.error ? t(`richNotes.errors.${next.error.code}`) : "");
      } catch (e) {
        fout(e);
      }
    };
    const observer = new MutationObserver(() => {
      if (!frame) frame = requestAnimationFrame(changed);
    });
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-current"],
    });
    changed();
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [api, session, host]);
  const apply = async () => {
    if (!editable || !herlaad || bezig) return;
    setBezig(true);
    setMelding("");
    try {
      await api.flushPendingInput();
      const version = api.handle.version(),
        revision = session.version(),
        bytes = api.save();
      if (
        live.current !== api ||
        version !== api.handle.version() ||
        revision !== session.version() ||
        !api.commands.getState("insertSlide").enabled
      )
        throw new NotitieFout("changed");
      herlaad.vervang(bytes, { dia: current.index });
    } catch (e) {
      fout(e);
    } finally {
      setBezig(false);
    }
  };
  return (
    <section
      className="rijke-notities"
      aria-label={t("richNotes.title")}
      data-testid="rich-notes-pane"
    >
      <header>
        <strong>{t("richNotes.slide", { number: current.index + 1 })}</strong>
        <span className="rijke-notitie-acties">
          <button
            className="werkruimte-knop"
            disabled={!editable || bezig || !note.changed}
            onClick={() => {
              session.reset(current.index);
              setMelding("");
            }}
          >
            {t("richNotes.discard")}
          </button>
          <button
            className="werkruimte-knop"
            disabled={!editable || bezig || !note.changed || !!note.error}
            onClick={() => void apply()}
          >
            {t("richNotes.apply")}
          </button>
        </span>
      </header>
      {note.error ? (
        <>
          <p role="alert">{t(`richNotes.errors.${note.error.code}`)}</p>
          <pre className="rijke-notitie-weergave">{note.plain}</pre>
        </>
      ) : (
        <RijkeNotitieBewerker
          key={current.id}
          doc={note.doc}
          editable={editable && !bezig}
          undo={note.undo}
          redo={note.redo}
          wijzig={(d, kind) => {
            if (!api.commands.getState("insertSlide").enabled)
              throw new NotitieFout("changed");
            session.schrijf(current.id, d, kind);
            setMelding("");
          }}
          ongedaan={() => session.undo(current.id)}
          opnieuw={() => session.redo(current.id)}
          opslaan={opslaan}
          fout={fout}
        />
      )}
      <small>{t("richNotes.saveHelp")}</small>
      {melding && <p role="alert">{melding}</p>}
    </section>
  );
}
