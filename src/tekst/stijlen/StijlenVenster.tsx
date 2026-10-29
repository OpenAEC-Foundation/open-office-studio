/**
 * Stijlenvenster (Ctrl+Alt+Shift+S): alle stijlen met filter, voorbeeld,
 * toepassen, wijzigen, nieuwe stijl, opmaak wissen en inspecteren (welke
 * stijl en welke directe opmaak de cursorpositie heeft).
 */
import { useMemo, useState } from "react";
import { Eraser, FilePlus2, Pilcrow, Type, Palette } from "lucide-react";
import { useDocxCommands } from "@betteroffice/docx-react";
import { useTranslation } from "react-i18next";
import { useOpmaak } from "../../i18n/opmaak";
import { Dialoog } from "../../werkruimte/Dialoog";
import { beschrijfOpmaak, directeOpmaak, losOp, runOpPositie, stijlNaam, vindAlinea, voorbeeldStijl } from "./model";
import { galerijStijlen, useStijlMenu } from "./StijlGalerij";
import { useStijlen } from "./StijlenBeheer";

type Filter = "aanbevolen" | "gebruikt" | "alle";

export function StijlenVenster() {
  const { t } = useTranslation(["writer", "common"]);
  const { locale, getal } = useOpmaak();
  const staat = useStijlen();
  const opdrachten = useDocxCommands();
  const menu = useStijlMenu();
  const [filter, setFilter] = useState<Filter>("gebruikt");
  const [zoek, setZoek] = useState("");
  const [voorbeeld, setVoorbeeld] = useState(true);
  const [inspecteren, setInspecteren] = useState(true);
  const alle = staat.stijlen?.styles ?? [];

  const lijst = useMemo(() => {
    const basis =
      filter === "aanbevolen"
        ? galerijStijlen(alle, staat.gebruikt)
        : alle
            .filter((s) => s.type === "paragraph" || s.type === "character")
            .filter((s) => (filter === "gebruikt" ? staat.gebruikt.has(s.styleId) : !s.hidden))
            .sort((a, b) => stijlNaam(a).localeCompare(stijlNaam(b), locale));
    const z = zoek.trim().toLowerCase();
    return z ? basis.filter((s) => stijlNaam(s).toLowerCase().includes(z) || s.styleId.toLowerCase().includes(z)) : basis;
  }, [alle, filter, zoek, staat.gebruikt, locale]);

  // Inspecteren: stijl en directe opmaak op de cursorpositie.
  const ref = staat.api();
  const info = ref?.getSelectionInfo() ?? null;
  const doc = ref?.getDocument() ?? staat.document;
  const direct = directeOpmaak(doc, info?.paraId);
  const run = direct ? runOpPositie(vindAlinea(doc, info?.paraId)?.content ?? [], info?.before.length ?? 0) : null;
  const alineastijl = alle.find((s) => s.styleId === (direct?.styleId ?? staat.alineastijl ?? ""));
  const standaard = alle.find((s) => s.type === "paragraph" && s.default);
  const tekenstijl = run?.styleId ? alle.find((s) => s.styleId === run.styleId) : undefined;
  const { styleId: _rs, ...runZonderStijl } = run ?? {};
  const beschrijving = beschrijfOpmaak(runZonderStijl, direct?.alinea);

  return (
    <Dialoog
      titel={t("styles.pane.title")}
      sluit={staat.sluit}
      className="tekst-stijlenvenster"
      acties={
        <>
          <button
            type="button"
            className="werkruimte-knop"
            disabled={!staat.kanHerladen}
            onClick={() => staat.open({ soort: "nieuw", uitSelectie: true })}
          >
            <FilePlus2 size={14} aria-hidden="true" /> {t("styles.pane.newStyle")}
          </button>
          <button type="button" className="werkruimte-knop" disabled={!staat.kanHerladen} onClick={() => staat.open({ soort: "sets" })}>
            <Palette size={14} aria-hidden="true" /> {t("styles.pane.styleSet")}
          </button>
          <button
            type="button"
            className="werkruimte-knop"
            disabled={!staat.bewerkbaar}
            title={t("styles.pane.clearFormattingHint", { shortcut: "Ctrl+M" })}
            onClick={() =>
              void opdrachten.execute("clearFormatting", null).then((r) => {
                if (!r.ok) staat.fout(r.failure.message);
              })
            }
          >
            <Eraser size={14} aria-hidden="true" /> {t("styles.pane.clearFormatting")}
          </button>
          <button type="button" className="werkruimte-knop is-primair" onClick={staat.sluit}>
            {t("common:close")}
          </button>
        </>
      }
    >
      <div className="tekst-stijlen-filters">
        <input
          type="search"
          placeholder={t("styles.pane.search")}
          aria-label={t("styles.pane.search")}
          value={zoek}
          data-autofocus
          onChange={(e) => setZoek(e.target.value)}
        />
        <select aria-label={t("styles.pane.filterLabel")} value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
          <option value="gebruikt">{t("styles.pane.filterInUse")}</option>
          <option value="aanbevolen">{t("styles.pane.filterRecommended")}</option>
          <option value="alle">{t("styles.pane.filterAll")}</option>
        </select>
        <label className="werkruimte-vink">
          <input type="checkbox" checked={voorbeeld} onChange={(e) => setVoorbeeld(e.target.checked)} /> {t("styles.pane.preview")}
        </label>
      </div>
      <ul className="tekst-stijlenlijst" role="listbox" aria-label={t("styles.pane.title")}>
        {lijst.map((s) => {
          const actief = s.styleId === staat.alineastijl;
          const naam = stijlNaam(s);
          const aantal = staat.gebruikt.get(s.styleId);
          return (
            <li key={s.styleId} role="option" aria-selected={actief}>
              <button
                type="button"
                className={actief ? "is-actief" : ""}
                disabled={!staat.bewerkbaar}
                title={t("styles.pane.applyHint", { name: naam })}
                onClick={() => staat.pasToe(s.styleId)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  const vak = e.currentTarget.getBoundingClientRect();
                  menu.open(e.clientX || vak.left, e.clientY || vak.bottom, s);
                }}
              >
                <span className="tekst-stijlenlijst-naam" style={voorbeeld ? voorbeeldStijl(losOp(staat.stijlen, s.styleId, staat.thema), 14) : undefined}>
                  {naam}
                </span>
                <span className="tekst-stijlenlijst-soort" aria-label={s.type === "character" ? t("styles.characterStyle") : t("styles.paragraphStyle")}>
                  {aantal ? <small>{getal(aantal)}×</small> : null}
                  {s.type === "character" ? <Type size={13} aria-hidden="true" /> : <Pilcrow size={13} aria-hidden="true" />}
                </span>
              </button>
            </li>
          );
        })}
        {!lijst.length && <li className="werkruimte-uitleg">{t("styles.pane.noneFound")}</li>}
      </ul>
      <details className="tekst-inspecteren" open={inspecteren} onToggle={(e) => setInspecteren(e.currentTarget.open)}>
        <summary>{t("styles.inspect.title")}</summary>
        {!info?.paraId ? (
          <p className="werkruimte-uitleg">{t("styles.inspect.placeCursor")}</p>
        ) : (
          <dl>
            <dt>{t("styles.inspect.paragraphStyle")}</dt>
            <dd>{alineastijl ? stijlNaam(alineastijl) : standaard ? stijlNaam(standaard) : "—"}</dd>
            <dt>{t("styles.inspect.characterStyleLabel")}</dt>
            <dd>{tekenstijl ? stijlNaam(tekenstijl) : run?.styleId ?? "—"}</dd>
            <dt>{t("styles.inspect.directParagraph")}</dt>
            <dd>{beschrijving.alinea.length ? beschrijving.alinea.join(" · ") : t("styles.inspect.none")}</dd>
            <dt>{t("styles.inspect.directCharacter")}</dt>
            <dd>{beschrijving.tekst.length ? beschrijving.tekst.join(" · ") : t("styles.inspect.none")}</dd>
          </dl>
        )}
      </details>
      {menu.element}
    </Dialoog>
  );
}
