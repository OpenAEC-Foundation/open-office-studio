import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { Paneel, tekstVan } from "../lint/rekenblad-dialogen";
import { useEditorApi, meldWijziging } from "../lint/editorApi";
import { alleenLezen, leesSelectie } from "../lint/rekenblad-opdrachten";
import { a1 } from "./werkboekXml";
import {
  RECHTEN,
  leesBeveiliging,
  standaardRechten,
  schrijfBladBeveiliging,
  schrijfStructuurBeveiliging,
  zetCelBeveiliging,
  type BladRechten,
} from "./beveiliging";
import { bladBeveiligd } from "./bladbeveiliging";

export type BeveiligingsVenster = "blad" | "werkmap" | "cellen";
export function BeveiligingVenster({
  api,
  soort,
  sluiten,
}: {
  api: XlsxEditorApi;
  soort: BeveiligingsVenster;
  sluiten: () => void;
}) {
  const { t } = useTranslation("spreadsheet"),
    { herlaad } = useEditorApi();
  const [sel] = useState(() => {
    try {
      return { ...leesSelectie(api), geldig: true };
    } catch {
      const info = api.handle.sheetInfo();
      return {
        blad: info.activeSheet,
        sheetId: info.sheetIds[info.activeSheet],
        bereik: { top: 0, left: 0, bottom: 0, right: 0 },
        focus: { row: 0, col: 0 },
        geldig: false,
      };
    }
  });
  const [actief, setActief] = useState(true),
    [bestaand, setBestaand] = useState(false),
    [rechten, setRechten] = useState<BladRechten>(standaardRechten);
  const [wachtwoord, setWachtwoord] = useState(""),
    [nieuw, setNieuw] = useState(""),
    [herhaal, setHerhaal] = useState("");
  const [locked, setLocked] = useState("yes"),
    [hidden, setHidden] = useState("no");
  const [gereed, setGereed] = useState(false),
    [bezig, setBezig] = useState(false),
    [status, setStatus] = useState("");
  const versie = useRef(""),
    lopend = useRef(false),
    aanwezig = useRef(true);
  useEffect(() => {
    aanwezig.current = true;
    (async () => {
      try {
        versie.current = await api.version();
        if (soort === "cellen") {
          const formats = api.handle.captureFormat(sel.blad, a1(sel.bereik))
            .formats as {
            protection?: { locked?: boolean; hidden?: boolean };
          }[];
          const keuze = (k: "locked" | "hidden", d: boolean) =>
            formats.every((f) => (f.protection?.[k] ?? d) === true)
              ? "yes"
              : formats.every((f) => (f.protection?.[k] ?? d) === false)
                ? "no"
                : "keep";
          if (!aanwezig.current) return;
          setLocked(keuze("locked", true));
          setHidden(keuze("hidden", false));
        } else {
          const b = leesBeveiliging(await herlaad!.bytes());
          if (!aanwezig.current) return;
          const aan =
            soort === "werkmap" ? b.structuur : b.bladen[sel.blad].actief;
          setActief(true);
          setBestaand(aan);
          if (soort === "blad") setRechten(b.bladen[sel.blad].rechten);
        }
        setGereed(true);
      } catch (f) {
        if (aanwezig.current) setStatus(tekstVan(f));
      }
    })();
    return () => {
      aanwezig.current = false;
    };
  }, [api, herlaad, sel, soort]);
  const alleen =
    alleenLezen(api) ||
    !gereed ||
    bezig ||
    (soort === "cellen"
      ? !!bladBeveiligd(api.handle, sel.blad)?.actief || !sel.geldig
      : !herlaad);
  async function bewaar() {
    if (alleen || lopend.current) return;
    lopend.current = true;
    setBezig(true);
    setStatus("");
    try {
      if (alleenLezen(api) || (await api.version()) !== versie.current)
        throw new Error(t("notes.errors.changed"));
      if (soort === "cellen") {
        const uit = zetCelBeveiliging(
          api.handle,
          sel.blad,
          a1(sel.bereik),
          locked === "keep" ? undefined : locked === "yes",
          hidden === "keep" ? undefined : hidden === "yes",
        );
        if (uit.applied) meldWijziging(api.handle);
        sluiten();
        return;
      }
      if (actief && nieuw !== herhaal)
        throw new Error(t("protection.mismatch"));
      const bytes = await herlaad!.bytes();
      if ((await api.version()) !== versie.current)
        throw new Error(t("notes.errors.changed"));
      const uit =
        soort === "blad"
          ? await schrijfBladBeveiliging(
              bytes,
              sel.blad,
              actief ? rechten : null,
              wachtwoord,
              actief ? nieuw : "",
            )
          : await schrijfStructuurBeveiliging(
              bytes,
              actief,
              wachtwoord,
              actief ? nieuw : "",
            );
      if (!aanwezig.current) return;
      if (alleenLezen(api) || (await api.version()) !== versie.current)
        throw new Error(t("notes.errors.changed"));
      herlaad!.vervang(uit, { blad: sel.blad, cel: sel.focus });
      sluiten();
    } catch (f) {
      if (aanwezig.current) setStatus(tekstVan(f));
    } finally {
      lopend.current = false;
      if (aanwezig.current) setBezig(false);
    }
  }
  return (
    <Paneel
      titel={t(
        "protection." +
          { blad: "sheet", werkmap: "workbook", cellen: "cells" }[soort],
      )}
      sluiten={sluiten}
    >
      <form
        className="rekenblad-formulier"
        onSubmit={(e) => {
          e.preventDefault();
          void bewaar();
        }}
      >
        <p>
          {api.handle.sheetInfo().sheetNames[sel.blad]} · {a1(sel.bereik)}
        </p>
        <fieldset disabled={alleen} className="validatie-velden">
          {soort === "cellen" ? (
            <>
              {(["locked", "hidden"] as const).map((k) => (
                <label key={k}>
                  {t("protection." + k)}
                  <select
                    aria-label={t("protection." + k)}
                    value={k === "locked" ? locked : hidden}
                    onChange={(e) =>
                      (k === "locked" ? setLocked : setHidden)(e.target.value)
                    }
                  >
                    {["keep", "yes", "no"].map((v) => (
                      <option key={v} value={v}>
                        {t("protection." + v)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <p>{t("protection.cellHint")}</p>
            </>
          ) : (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={actief}
                  onChange={(e) => setActief(e.target.checked)}
                />
                {t(
                  soort === "blad"
                    ? "protection.enableSheet"
                    : "protection.enableBook",
                )}
              </label>
              {soort === "blad" && actief && (
                <fieldset>
                  <legend>{t("protection.allowed")}</legend>
                  {RECHTEN.map((r) => (
                    <label key={r}>
                      <input
                        type="checkbox"
                        checked={rechten[r]}
                        onChange={(e) =>
                          setRechten((p) => ({ ...p, [r]: e.target.checked }))
                        }
                      />
                      {t("protection.rights." + r)}
                    </label>
                  ))}
                </fieldset>
              )}
              {bestaand && (
                <label>
                  {t("protection.currentPassword")}
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={wachtwoord}
                    onChange={(e) => setWachtwoord(e.target.value)}
                  />
                </label>
              )}
              {actief && (
                <>
                  <label>
                    {t("protection.newPassword")}
                    <input
                      type="password"
                      maxLength={255}
                      autoComplete="new-password"
                      value={nieuw}
                      onChange={(e) => setNieuw(e.target.value)}
                    />
                  </label>
                  <label>
                    {t("protection.repeatPassword")}
                    <input
                      type="password"
                      maxLength={255}
                      autoComplete="new-password"
                      value={herhaal}
                      onChange={(e) => setHerhaal(e.target.value)}
                    />
                  </label>
                </>
              )}
              <p>{t("protection.notEncryption")}</p>
              <p className="rekenblad-hint">{t("protection.reloadHint")}</p>
            </>
          )}
        </fieldset>
        {soort === "cellen" && bladBeveiligd(api.handle, sel.blad)?.actief && (
          <p role="status">{t("protection.unprotectFirst")}</p>
        )}
        <div className="rekenblad-knoppen">
          <button type="button" onClick={sluiten}>
            {t("common:close")}
          </button>
          <button type="submit" disabled={alleen}>
            {bezig ? t("common:loading") : t("common:save")}
          </button>
        </div>
        {status && <p role="alert">{status}</p>}
      </form>
    </Paneel>
  );
}
