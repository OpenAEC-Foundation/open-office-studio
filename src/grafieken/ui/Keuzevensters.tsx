import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2, Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { soortNaam } from "../model.ts";
import type { GrafiekVerwijzing } from "../documenten.ts";
import "./grafieken.css";

function Venster({
  titel,
  children,
  acties,
  sluit,
}: {
  titel: string;
  children: React.ReactNode;
  acties?: React.ReactNode;
  sluit: () => void;
}) {
  const { t } = useTranslation("charts");
  const id = useId();
  const vak = useRef<HTMLDivElement>(null);
  useEffect(() => {
    vak.current?.querySelector<HTMLElement>(".office-dialoogdoorgaan, .grafiek-lijst button, .office-dialoogacties button")?.focus();
  }, []);
  return createPortal(
    <div
      className="office-dialoogachtergrond"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) sluit();
      }}
    >
      <div
        ref={vak}
        className="office-dialoog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") sluit();
        }}
      >
        <h2 id={id} style={{ marginTop: 0 }}>{titel}</h2>
        {children}
        <div className="office-dialoogacties">
          {acties}
          <button type="button" onClick={sluit}>{acties ? t("common:cancel") : t("common:close")}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function Bevestig({
  titel,
  tekst,
  knop,
  doe,
  sluit,
}: {
  titel: string;
  tekst: string;
  knop: string;
  doe: () => Promise<void>;
  sluit: () => void;
}) {
  const { t } = useTranslation("charts");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  return (
    <Venster
      titel={titel}
      sluit={() => !bezig && sluit()}
      acties={
        <button
          type="button"
          className="office-dialoogdoorgaan"
          disabled={bezig}
          onClick={() => {
            setBezig(true);
            doe().catch((e) => {
              setFout(e instanceof Error ? e.message : String(e));
              setBezig(false);
            });
          }}
        >
          {bezig ? t("busy") : knop}
        </button>
      }
    >
      <p>{tekst}</p>
      {fout && <p className="grafiek-melding" role="alert">{fout}</p>}
    </Venster>
  );
}

const plekVan = (g: GrafiekVerwijzing, t: TFunction<"charts">) =>
  g.formaat === "pptx"
    ? t("list.place.slide", { n: (g.dia ?? 0) + 1 })
    : g.formaat === "xlsx"
      ? t("list.place.sheet", { name: g.bladNaam ?? "" })
      : t("list.place.text", { n: (g.volgnummer ?? 0) + 1 });

/** Lijst ‘Grafieken in dit document’ om er een te kiezen. */
export function GrafiekenLijst({
  grafieken,
  kies,
  verwijder,
  sluit,
}: {
  grafieken: GrafiekVerwijzing[];
  kies: (g: GrafiekVerwijzing) => void;
  verwijder: (g: GrafiekVerwijzing) => void;
  sluit: () => void;
}) {
  const { t } = useTranslation("charts");
  return (
    <Venster titel={t("list.title")} sluit={sluit}>
      {grafieken.length ? (
        <ul className="grafiek-lijst">
          {grafieken.map((g) => (
            <li key={g.chartPad + g.rid + g.houderPad} style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                disabled={!g.bewerkbaar}
                title={g.bewerkbaar ? t("list.edit") : g.reden}
                onClick={() => kies(g)}
              >
                <Pencil size={15} />
                <span>
                  <strong>{g.titel || g.naam}</strong>
                  <small>
                    {g.soort ? soortNaam(g.soort) : t("unknownType")} · {plekVan(g, t)}
                    {!g.bewerkbaar && g.reden ? ` · ${g.reden}` : ""}
                  </small>
                </span>
              </button>
              <button type="button" style={{ width: "auto" }} aria-label={t("list.deleteLabel", { name: g.titel || g.naam })} title={t("list.delete")} onClick={() => verwijder(g)}>
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>{t("list.empty")}</p>
      )}
    </Venster>
  );
}
