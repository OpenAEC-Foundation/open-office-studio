import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatGetal } from "../i18n/opmaak";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import {
  Melding,
  allesVervangen,
  benoemdeBereiken,
  bladHernoemen,
  gaNaar,
  vervangHuidige,
  zoekVolgende,
} from "./rekenblad-opdrachten";

function Paneel({
  titel,
  sluiten,
  children,
}: {
  titel: string;
  sluiten: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation("ribbon");
  const id = useId();
  const paneel = useRef<HTMLElement>(null);
  useEffect(() => {
    paneel.current?.querySelector<HTMLInputElement>("input")?.select();
  }, []);
  return createPortal(
    <section
      ref={paneel}
      className="rekenblad-paneel"
      role="dialog"
      aria-modal="false"
      aria-labelledby={id}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          sluiten();
        }
      }}
    >
      <header>
        <h2 id={id}>{titel}</h2>
        <button
          type="button"
          aria-label={t("common:close")}
          title={t("spreadsheet.dialogs.closeEsc")}
          onClick={sluiten}
        >
          <X size={15} />
        </button>
      </header>
      {children}
    </section>,
    document.body,
  );
}

const tekstVan = (fout: unknown) =>
  fout instanceof Melding || fout instanceof Error
    ? fout.message
    : String(fout);

export function ZoekenVervangen({
  api,
  sluiten,
}: {
  api: XlsxEditorApi;
  sluiten: () => void;
}) {
  const { t } = useTranslation("ribbon");
  const [zoek, setZoek] = useState("");
  const [door, setDoor] = useState("");
  const [hoofdletters, setHoofdletters] = useState(false);
  const [status, setStatus] = useState("");
  const bezig = useRef(false);
  async function doe(actie: () => Promise<string>) {
    if (bezig.current || !zoek) return;
    bezig.current = true;
    try {
      setStatus(await actie());
    } catch (fout) {
      setStatus(tekstVan(fout));
    } finally {
      bezig.current = false;
    }
  }
  const zoeken = (terug = false) =>
    doe(async () => {
      const r = await zoekVolgende(api, zoek, hoofdletters, terug);
      return r
        ? t("spreadsheet.dialogs.find.found", {
            count: r.aantal,
            number: formatGetal(r.aantal),
            location: `${r.treffer.sheetName}!${r.treffer.a1}`,
          })
        : t("spreadsheet.dialogs.find.notFound");
    });
  return (
    <Paneel titel={t("spreadsheet.dialogs.find.title")} sluiten={sluiten}>
      <form
        className="rekenblad-formulier"
        onSubmit={(event) => {
          event.preventDefault();
          void zoeken(false);
        }}
      >
        <label>
          {t("spreadsheet.dialogs.find.findWhat")}
          <input value={zoek} onChange={(e) => setZoek(e.target.value)} />
        </label>
        <label>
          {t("spreadsheet.dialogs.find.replaceWith")}
          <input value={door} onChange={(e) => setDoor(e.target.value)} />
        </label>
        <label className="rekenblad-vinkje">
          <input
            type="checkbox"
            checked={hoofdletters}
            onChange={(e) => setHoofdletters(e.target.checked)}
          />
          {t("spreadsheet.dialogs.find.matchCase")}
        </label>
        <div className="rekenblad-knoppen">
          <button type="button" disabled={!zoek} onClick={() => zoeken(true)}>
            {t("spreadsheet.dialogs.find.previous")}
          </button>
          <button type="submit" disabled={!zoek}>
            {t("spreadsheet.dialogs.find.next")}
          </button>
          <button
            type="button"
            disabled={!zoek}
            onClick={() =>
              doe(async () => {
                const r = await vervangHuidige(api, zoek, door, hoofdletters);
                return r.vervangen
                  ? t("spreadsheet.dialogs.find.replacedCurrent")
                  : r.volgende
                    ? t("spreadsheet.dialogs.find.nextSelected")
                    : t("spreadsheet.dialogs.find.notFound");
              })
            }
          >
            {t("spreadsheet.dialogs.find.replace")}
          </button>
          <button
            type="button"
            className="rekenblad-primair"
            disabled={!zoek}
            onClick={() =>
              doe(async () => {
                const r = await allesVervangen(api, zoek, door, hoofdletters);
                return t(
                  r.overgeslagen
                    ? "spreadsheet.dialogs.find.replacedAllSkipped"
                    : "spreadsheet.dialogs.find.replacedAll",
                  {
                    count: r.vervangen,
                    number: formatGetal(r.vervangen),
                    skipped: formatGetal(r.overgeslagen),
                  },
                );
              })
            }
          >
            {t("spreadsheet.dialogs.find.replaceAll")}
          </button>
        </div>
        <p role="status" className="rekenblad-status">
          {status}
        </p>
      </form>
    </Paneel>
  );
}

export function GaNaar({
  api,
  sluiten,
}: {
  api: XlsxEditorApi;
  sluiten: () => void;
}) {
  const { t } = useTranslation("ribbon");
  const [tekst, setTekst] = useState("");
  const [status, setStatus] = useState("");
  const [namen] = useState(() => benoemdeBereiken(api));
  const lijst = useId();
  async function ga(doel: string) {
    try {
      await gaNaar(api, doel);
      sluiten();
    } catch (fout) {
      setStatus(tekstVan(fout));
    }
  }
  return (
    <Paneel titel={t("spreadsheet.dialogs.goTo.title")} sluiten={sluiten}>
      <form
        className="rekenblad-formulier"
        onSubmit={(event) => {
          event.preventDefault();
          if (tekst.trim()) void ga(tekst);
        }}
      >
        <label>
          {t("spreadsheet.dialogs.goTo.label")}
          <input
            value={tekst}
            placeholder={t("spreadsheet.dialogs.goTo.placeholder")}
            list={namen.length ? lijst : undefined}
            onChange={(e) => setTekst(e.target.value)}
          />
        </label>
        {namen.length > 0 && (
          <>
            <datalist id={lijst}>
              {namen.map((n) => (
                <option key={n.naam} value={n.naam} />
              ))}
            </datalist>
            <ul className="rekenblad-namen" aria-label={t("spreadsheet.dialogs.goTo.namedRanges")}>
              {namen.map((n) => (
                <li key={n.naam}>
                  <button type="button" onClick={() => ga(n.naam)}>
                    <strong>{n.naam}</strong>
                    <span>{n.verwijzing}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="rekenblad-knoppen">
          <button
            type="submit"
            className="rekenblad-primair"
            disabled={!tekst.trim()}
          >
            {t("spreadsheet.dialogs.goTo.go")}
          </button>
        </div>
        <p role="status" className="rekenblad-status">
          {status}
        </p>
      </form>
    </Paneel>
  );
}

export function BladHernoemen({
  api,
  sluiten,
}: {
  api: XlsxEditorApi;
  sluiten: () => void;
}) {
  const { t } = useTranslation("ribbon");
  const info = api.handle.sheetInfo();
  const [naam, setNaam] = useState(info.sheetNames[info.activeSheet] ?? "");
  const [status, setStatus] = useState("");
  return (
    <Paneel titel={t("spreadsheet.dialogs.rename.title")} sluiten={sluiten}>
      <form
        className="rekenblad-formulier"
        onSubmit={async (event) => {
          event.preventDefault();
          try {
            await bladHernoemen(api, naam);
            sluiten();
          } catch (fout) {
            setStatus(tekstVan(fout));
          }
        }}
      >
        <label>
          {t("spreadsheet.dialogs.rename.name")}
          <input
            value={naam}
            maxLength={31}
            onChange={(e) => setNaam(e.target.value)}
          />
        </label>
        <div className="rekenblad-knoppen">
          <button type="button" onClick={sluiten}>
            {t("common:cancel")}
          </button>
          <button type="submit" className="rekenblad-primair">
            {t("spreadsheet.dialogs.rename.rename")}
          </button>
        </div>
        <p role="status" className="rekenblad-status">
          {status}
        </p>
      </form>
    </Paneel>
  );
}
